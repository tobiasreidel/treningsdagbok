import { fetchSessions } from './sessions'
import { fetchInjuries } from './health'
import { fetchIcuFitnessData } from './fitness'
import { fetchCoachProfile, fetchGoals } from './coachProfile'
import { fetchWellness, fetchOstrc } from './wellness'
import { fetchFingerTests, fetchPhysicalTests } from './fingerTests'
import { getCoachModel, getSessionPick } from './prefs'
import { coachReadout } from './coach'
import { todayISO } from './format'

// One place that assembles everything coachReadout() reads, because five
// places assembling it independently is how the app ended up telling you two
// different things at once: the dashboard card left out your finger tests, so
// a hangboard session it scored off edge size alone could land in a different
// recovery tier than the same session on /coach - and a pain-aborted test,
// which flips the whole suggestion to "back off", was invisible to every
// screen except the Coach page.
//
// Every caller now gets the same inputs, and a new signal is wired in once.

// Pass `sessions` when the caller already has them (the dashboard and the
// stats page both hold a list already) to skip the round-trip.
export async function loadCoachInputs({ sessions = null } = {}) {
  const haveSessions = Array.isArray(sessions)
  const [s, inj, fit, prof, gls, well, ost, ft, pt] = await Promise.allSettled([
    haveSessions ? Promise.resolve(sessions) : fetchSessions(),
    fetchInjuries(),
    fetchIcuFitnessData(),
    fetchCoachProfile(),
    fetchGoals(),
    fetchWellness(),
    fetchOstrc(),
    fetchFingerTests(),
    fetchPhysicalTests(),
  ])
  const val = (r, fb) => (r.status === 'fulfilled' ? r.value : fb)
  // A missing coach_profile table means "not set up", not "a profile that
  // answered no to everything" - normalise it away so nothing downstream
  // treats it as one.
  const p = val(prof, null)
  return {
    sessions: val(s, []),
    injuries: val(inj, []),
    // Not connected to intervals.icu is normal, not an error - readiness just
    // runs on the signals that are available.
    icu: val(fit, {})?.wellness ?? null,
    profile: p?.missingTable ? null : p,
    goals: val(gls, []),
    wellness: val(well, []),
    ostrc: val(ost, []),
    fingerTests: val(ft, []),
    physicalTests: val(pt, []),
  }
}

// The readout for a set of inputs. `opts` wins, so a screen holding its own
// live state (the session you picked on /coach) can override without having to
// restate the rest.
export function readoutFrom(inputs, opts = {}) {
  return coachReadout(inputs.sessions, inputs.injuries, inputs.icu, {
    model: getCoachModel(),
    profile: inputs.profile,
    goals: inputs.goals,
    wellness: inputs.wellness,
    ostrc: inputs.ostrc,
    fingerTests: inputs.fingerTests,
    physicalTests: inputs.physicalTests,
    pick: getSessionPick(todayISO()),
    ...opts,
  })
}

// Empty inputs, so a component can render its loading state against the same
// shape instead of juggling nine separate useStates.
export const EMPTY_COACH_INPUTS = {
  sessions: [],
  injuries: [],
  icu: null,
  profile: null,
  goals: [],
  wellness: [],
  ostrc: [],
  fingerTests: [],
  physicalTests: [],
}

// ---- logging a prescribed session -------------------------------------------

// Which sport a library exercise is logged as. The library thinks in training
// categories; the diary thinks in sports, and only the coach knows how to
// translate between the two.
const SPORT_FOR_CATEGORY = {
  finger: { sport: 'finger' },
  boulder: { sport: 'climbing', subtype: 'bouldering' },
  rope: { sport: 'climbing', subtype: 'sport' },
  strength: { sport: 'strength' },
  mobility: { sport: 'strength' },
  warmup: { sport: 'strength' },
}

// Turn today's prescription into a half-filled session, so "do this" and
// "write down what I did" aren't two unrelated acts. Returns null for the
// categories the diary has no sport for (the mental exercises) - the caller
// hides the button rather than opening a form that can't be saved.
//
// A hangboard session also arrives with its sets already laid out at the
// prescribed kilos: the card has already resolved "80-90% of max" into a real
// number, and asking the user to retype it into four rows is asking them to do
// arithmetic the app just did.
export function sessionFromSuggestion(suggestion) {
  // The session you chose, which is not necessarily the first in the list: the
  // list keeps the coach's order and the selection moves within it.
  const ex = suggestion?.chosen ?? suggestion?.exercises?.[0]
  const map = ex && SPORT_FOR_CATEGORY[ex.category]
  if (!map) return null
  const extra = {
    // Pre-answers "was this the planned session?" - it is, by construction.
    // A list, so anything else done in the same session can be added to it.
    coach: { followed: 'planned', type: suggestion.key, exercises: [ex.id] },
  }
  const hang = seededHangboard(ex, suggestion.hang)
  if (hang) extra.finger = hang
  return {
    sport: map.sport,
    subtype: map.subtype ?? null,
    // Indoor is a guess for board and gym work, and the wrong guess to force -
    // left blank so the wizard still asks.
    duration: ex.minutes ? String(ex.minutes) : '',
    extra,
  }
}

// The library entry's own sets, seeded at the resolved load. Only when the
// prescription actually resolved to kilos: seeding a percentage would write a
// number that means nothing.
function seededHangboard(ex, hang) {
  if (ex?.category !== 'finger' || !ex.intensity || ex.intensity.anchor !== 'pctMaxTotal') return null
  if (!hang || hang.blocked || !(hang.loTotal > 0)) return null
  const v = ex.volume || {}
  const sets = Math.max(1, Number(v.sets) || 1)
  const reps = Math.max(1, Number(v.reps) || 1)
  const seconds = Number(v.work_s) || null
  // The midpoint of the prescribed range, rounded to the nearest kilo: a range
  // is not something a set row can hold.
  const kg = Math.round((hang.loTotal + hang.hiTotal) / 2)
  return {
    hangboard: [
      {
        hands: 'two',
        grip: ex.intensity.grip && ex.intensity.grip !== 'rotating' ? ex.intensity.grip : 'halfcrimp',
        reps: String(reps),
        rest: v.rest_s ? String(v.rest_s) : '',
        sets: Array.from({ length: sets }, () => ({
          load_total_kg: String(kg),
          time: seconds ? String(seconds) : '',
          edge: ex.intensity.edge_mm ? String(ex.intensity.edge_mm) : '',
        })),
      },
    ],
  }
}
