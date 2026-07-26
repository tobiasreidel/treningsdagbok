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
