// Progressive overload for hangboard prescriptions, from what was logged.
//
// The library already says how to progress each finger session ("when all 4
// sets hit target with the margin intact on two sessions running, add 2-3%"),
// but it said it in prose, and a number nobody computes is a number nobody
// applies. This module reads the last few logged sessions of a prescribed
// exercise and turns the prose into the load for today.
//
// Everything here is pure: sessions in, a target load and the reason for it
// out. The "reason" is the product. A coach who moves your load without saying
// why is a coach you stop trusting, and the same is true of a card.
//
// What it does NOT do: learn. At one athlete there is nothing to fit. These
// are the same fixed rules a coach applies by hand, applied consistently.
import { differenceInCalendarDays } from 'date-fns'
import { asDate } from './format'
import { normaliseSession } from './sessionShape'
import { sessionExercises } from './exercises'

const num = (v) => Number(v) || 0

// One step up, as a fraction of max total load. The library's own progression
// note says 2-3%; 2.5% of a 100 kg max is 2.5 kg, which is the smallest plate
// that exists. Chosen, and deliberately small: connective tissue adapts slower
// than the muscle that pulls on it.
export const PROGRESS_STEP = 0.025

// After a session that ended in pain the next one is lighter, not skipped: the
// problem list routes around the fingers for a fortnight anyway, and when the
// session comes back it should come back from below.
export const BACKOFF_STEP = 0.1

// Sessions older than this are a different block of you. A load from three
// months ago, before a deload and a retest, says nothing about today.
export const HISTORY_DAYS = 56

// Hang time counts as the same protocol within this many seconds of the
// prescribed work time: a 10 s max hang logged as 9 s is the same session.
const SECONDS_TOLERANCE = 3

// How a logged session went, as a number the rules can compare.
//   +1 nailed it (every set, margin intact)
//    0 as planned
//   -1 cut short, or harder than it should have been
//   -2 pain
// A session logged before the outcome question existed is scored from what
// was logged: finishing the prescribed number of sets reads as "as planned",
// fewer as "cut short". Finger RPE well above the session's target overrides
// an optimistic tick: a max hang that felt like a 10 is not a set to add to.
function outcomeScore(shape, prescribedSets, setsDone, targetFingerRpe) {
  let score
  switch (shape.outcome) {
    case 'pain':
      score = -2
      break
    case 'short':
      score = -1
      break
    case 'nailed':
      score = 1
      break
    case 'done':
      score = 0
      break
    default:
      score = prescribedSets > 0 && setsDone > 0 && setsDone < prescribedSets ? -1 : 0
  }
  const rf = shape.fingerRpe
  if (rf && targetFingerRpe && rf >= Math.min(10, targetFingerRpe + 2)) score = Math.min(score, -1)
  return score
}

// The logged sessions that were this exercise, newest first, each reduced to
// the numbers the rules need. A session counts when it names the exercise, or
// when it holds a two-hand hangboard block on the same grip at the same hang
// time: the "Log this session" flow names it, a session typed in by hand
// usually does not, and the fingers do not care which.
export function priorSessions(exercise, sessions, profile, { today = new Date() } = {}) {
  if (!exercise || exercise.category !== 'finger') return []
  const grip = exercise.intensity?.grip && exercise.intensity.grip !== 'rotating'
    ? exercise.intensity.grip
    : 'halfcrimp'
  const workS = num(exercise.volume?.work_s) || null
  const prescribedSets = num(exercise.volume?.sets) || 0
  const targetFingerRpe = num(exercise.rpeTarget?.finger) || null
  const bodyweight = num(profile?.bodyweight_kg)
  const out = []
  for (const s of sessions || []) {
    if (!s?.date) continue
    const ago = differenceInCalendarDays(today, asDate(s.date))
    if (ago < 0 || ago > HISTORY_DAYS) continue
    const n = normaliseSession(s, { bodyweight })
    const named = sessionExercises(s).some((e) => e.id === exercise.id)
    const blocks = n.hangboard.filter(
      (h) =>
        h.hands === 'two' &&
        h.grip === grip &&
        (named || workS == null || h.sets.some((x) => x.seconds != null && Math.abs(x.seconds - workS) <= SECONDS_TOLERANCE)),
    )
    if (!named && !blocks.length) continue
    const kgs = blocks.flatMap((h) => h.sets.map((x) => x.kg)).filter((kg) => kg != null && kg > 0)
    // A named session with no readable sets still says how it went, which is
    // enough to hold or back off, but not enough to progress from.
    const kg = kgs.length ? Math.max(...kgs) : null
    const setsDone = kgs.length
    out.push({
      date: s.date,
      kg,
      setsDone,
      named,
      outcome: n.outcome,
      fingerRpe: n.fingerRpe,
      score: outcomeScore(n, prescribedSets, setsDone, targetFingerRpe),
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// The load for today, in kilos total, and why.
//
//   exercise     a library entry anchored on pctMaxTotal
//   maxTotal     the usable max total load for its grip, kg
//   conservative true with finger injury history: the range's top half is
//                off the table, so the step up runs out sooner
//
// Returns null when there is nothing to prescribe from (no max, or an exercise
// not anchored on one).
export function hangTarget(exercise, sessions, profile, maxTotal, { conservative = false, today = new Date() } = {}) {
  const int = exercise?.intensity
  if (!int || int.anchor !== 'pctMaxTotal' || !(maxTotal > 0)) return null
  const lo = int.lo
  const hi = conservative ? int.lo + (int.hi - int.lo) / 2 : int.hi
  const loKg = lo * maxTotal
  const hiKg = hi * maxTotal
  const clampKg = (kg) => Math.round(Math.max(loKg, Math.min(hiKg, kg)))
  const priors = priorSessions(exercise, sessions, profile, { today })
  const last = priors[0] || null

  const base = { loKg, hiKg, lo, hi, conservative, priors: priors.length, last }

  if (!last) {
    return {
      ...base,
      rule: 'start',
      kg: Math.round(loKg),
      note: 'First time on this session against this max, so it starts at the low end of the range.',
    }
  }

  if (last.score <= -2) {
    const kg = clampKg((last.kg || loKg) * (1 - BACKOFF_STEP))
    return {
      ...base,
      rule: 'backoff',
      kg,
      note: 'Last time ended in pain. Ten percent off, and any pain today is the signal to stop, not to push through.',
    }
  }

  // A session with no readable load (a legacy row, or one logged without the
  // sets) can hold the plan but has nothing to add 2.5% to.
  if (last.kg == null) {
    return {
      ...base,
      rule: 'start',
      kg: Math.round(loKg),
      note: 'The last session did not log its sets, so this one starts at the low end of the range again.',
    }
  }

  // The max moved under the history: a retest raised it, so the old load now
  // sits below the range, or lowered it, so the old load sits above.
  if (last.kg < loKg - 0.5) {
    return {
      ...base,
      rule: 'start',
      kg: Math.round(loKg),
      note: 'Your max went up since the last session, so the range moved and this starts at its low end.',
    }
  }
  if (last.kg > hiKg + 0.5) {
    return {
      ...base,
      rule: 'capped',
      kg: Math.round(hiKg),
      note: conservative
        ? 'Held at the top of the range: with finger injury history the coach keeps hangs in the lower half of it.'
        : 'Held at the top of the range. Adding beyond it means your max has moved: retest rather than keep loading.',
    }
  }

  if (last.score === -1) {
    return {
      ...base,
      rule: 'repeat',
      kg: clampKg(last.kg),
      note:
        last.outcome === 'short'
          ? `Last time was cut short at ${Math.round(last.kg)} kg, so the load stays there until it goes to plan.`
          : `Last time at ${Math.round(last.kg)} kg felt harder than this session should, so the load stays put.`,
    }
  }

  const prev = priors[1] || null
  const sameLoad = (a, b) => a?.kg != null && b?.kg != null && Math.abs(a.kg - b.kg) <= 1
  const twoGood = prev && prev.score >= 0 && sameLoad(prev, last) && last.score + prev.score >= 1
  const threeSteady =
    prev && priors[2] && prev.score >= 0 && priors[2].score >= 0 && sameLoad(prev, last) && sameLoad(priors[2], last)
  if (twoGood || threeSteady) {
    const kg = clampKg(last.kg * (1 + PROGRESS_STEP))
    if (kg <= Math.round(last.kg)) {
      return {
        ...base,
        rule: 'capped',
        kg,
        note: conservative
          ? 'Sessions are going to plan, but with finger injury history the coach keeps hangs in the lower half of the range. Retest to move it.'
          : 'Sessions are going to plan and the load is at the top of the range. Time to retest your max rather than keep adding.',
      }
    }
    return {
      ...base,
      rule: 'progress',
      kg,
      note: `The last ${threeSteady && !twoGood ? 'three' : 'two'} sessions went to plan at ${Math.round(last.kg)} kg, so this one adds 2.5% of your max.`,
    }
  }

  return {
    ...base,
    rule: 'repeat',
    kg: clampKg(last.kg),
    note:
      last.score >= 1
        ? `Last time went well at ${Math.round(last.kg)} kg. One more session there with the margin intact, then it goes up.`
        : `Same load as last time, ${Math.round(last.kg)} kg. Two sessions to plan at a load is what earns the next step.`,
  }
}

// Set count for a session in a given block week. Volume, not intensity, is what
// ramps across the three loading weeks: intensity is set by the load above and
// by the grade band, and moving both at once is how a block ends in a pulley.
export function scaledSets(exercise, volumeMult = 1) {
  const sets = num(exercise?.volume?.sets)
  if (!sets) return null
  return Math.max(1, Math.round(sets * volumeMult))
}
