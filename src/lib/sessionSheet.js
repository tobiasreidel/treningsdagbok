// The session sheet: what a whole session looks like, start to finish, fitted
// to the time the athlete actually has.
//
// A prescription used to be one library entry. That is what a coach writes on
// the whiteboard, not what they tell you at the door: a real session is a
// warm-up, the main work, something that sits well after it, and ten minutes
// of the prehab everyone skips. And it has a length. The most common complaint
// about app-generated plans is a two-and-a-half-hour session for someone who
// has sixty minutes, so the budget is the first input here, not an afterthought.
//
// Pure: exercises and a budget in, a list of parts with minutes out, plus what
// was cut to fit and why. Nothing here decides *which* main session to do; that
// is the engine's job (coach.js). This decides what surrounds it.
import { EXERCISE_MAP, WARMUP_PROTOCOLS, availableExercises } from './exercises'

// What a session is assumed to be when the athlete has not said. Ninety
// minutes is the length most gym sessions actually run, warm-up included.
export const DEFAULT_SESSION_MINUTES = 90

// Warm-up protocols and what they cost. WU2 is mandatory before maximal finger
// loading and is never the part that gets cut.
const WARMUP_MINUTES = { general: 10, finger_full: 12, shoulder: 8 }

// Nothing in the sheet is shorter than this once it is in; a five-minute
// "volume block" is not a block.
const MIN_PART_MINUTES = 20
const MIN_MAIN_MINUTES = 15
const FINISHER_MINUTES = 10
const FINISHER_SHORT_MINUTES = 5

// What sits well after each kind of main session, in order of preference.
// Same stimulus clustered together: hangs first, then climbing that does not
// ask more of the fingers; after a hard day nothing but prehab, because the
// hard day was the point and a second block is how it stops being hard.
const PAIRINGS = {
  fingerStrength: ['B9', 'B6', 'B7', 'B13'],
  fingerMaintenance: ['B6', 'B9', 'B7', 'B13'],
  antagonist: ['B13', 'B7'],
}

// The habit at the end. Prehab after any day that loaded the fingers or the
// shoulders; a few stretches after an easy one.
const FINISHER_HARD = ['S12', 'S15']
const FINISHER_EASY = ['T1', 'T4', 'T5']

const ROLE_LABELS = {
  warmup: 'Warm-up',
  main: 'Main',
  then: 'Then',
  finish: 'Finish',
}

function part(role, ex, minutes, extra = {}) {
  return {
    role,
    label: ROLE_LABELS[role],
    id: ex.id,
    name: ex.name,
    how: ex.how || null,
    minutes: Math.round(minutes),
    exercise: ex,
    ...extra,
  }
}

function usable(ids, { profile, discipline, injuredRegions, age }) {
  const list = availableExercises(
    ids.map((id) => EXERCISE_MAP[id]).filter(Boolean),
    profile,
    discipline,
  )
  return list.filter(
    (e) =>
      !(age != null && age < 18 && e.youth === 'blocked') &&
      !(e.loads || []).some((r) => (injuredRegions || []).includes(r)),
  )
}

// Build the sheet.
//
//   typeKey        the session type the day is (limit, fingerStrength, ...)
//   main           the library entry chosen as the main work
//   minutes        the athlete's budget for the whole session
//   durationMult   deload / taper reduction applied to the main work
//   reduced        true in a deload or taper week: no second block, the point
//                  of the week is less
//   sets           the main work's set count for this block week, if known
export function buildSessionSheet({
  typeKey,
  main,
  minutes = null,
  durationMult = 1,
  reduced = false,
  sets = null,
  profile = null,
  discipline = null,
  injuredRegions = [],
  age = null,
} = {}) {
  const budget = minutes > 0 ? Math.round(minutes) : DEFAULT_SESSION_MINUTES
  if (!main) return { parts: [], total: 0, budget, cut: false, cutNote: null }

  const ctx = { profile, discipline, injuredRegions, age }
  const parts = []
  const physical = main.category !== 'mental' && main.category !== 'mobility'

  // --- warm-up ---------------------------------------------------------------
  if (physical) {
    parts.push(part('warmup', WARMUP_PROTOCOLS.general, WARMUP_MINUTES.general))
    if (main.warmup === 'finger_full') {
      parts.push(part('warmup', WARMUP_PROTOCOLS.finger_full, WARMUP_MINUTES.finger_full, { required: true }))
    } else if (main.warmup === 'shoulder') {
      parts.push(part('warmup', WARMUP_PROTOCOLS.shoulder, WARMUP_MINUTES.shoulder))
    }
  }

  // --- main ------------------------------------------------------------------
  const mainMinutes = Math.max(MIN_MAIN_MINUTES, Math.round((main.minutes || 60) * durationMult))
  parts.push(part('main', main, mainMinutes, { sets, reducedBy: durationMult < 1 ? durationMult : null }))

  // --- finisher --------------------------------------------------------------
  const hardDay = main.fingerCost === 'high' || main.fingerCost === 'medium'
  let finisher = null
  if (typeKey !== 'antagonist' && typeKey !== 'mobility' && typeKey !== 'mental') {
    const ids = hardDay ? FINISHER_HARD : FINISHER_EASY
    const list = usable(ids, ctx)
    if (list.length) {
      finisher = {
        role: 'finish',
        label: ROLE_LABELS.finish,
        id: list.map((e) => e.id).join('+'),
        name: hardDay ? 'Prehab: shoulders and elbows' : 'Stretch out',
        how: hardDay
          ? 'Light, never a lift: external rotations and wrist eccentrics, 2 sets each. The ten minutes climbers skip, and the ones the shoulder surgeon would ask about.'
          : 'Two minutes each, easy. Nothing here should be a stretch to your limit after a session.',
        minutes: FINISHER_MINUTES,
        exercise: null,
        exercises: list,
      }
    }
  }

  // --- a second block, when there is room and the week is not a reduction ---
  let secondary = null
  const used = () => parts.reduce((a, p) => a + p.minutes, 0) + (finisher ? finisher.minutes : 0)
  if (!reduced && PAIRINGS[typeKey]) {
    const room = budget - used()
    if (room >= MIN_PART_MINUTES + 5) {
      const candidate = usable(PAIRINGS[typeKey], ctx)[0]
      if (candidate) {
        const want = Math.min(candidate.minutes || 60, 60, room)
        secondary = part('then', candidate, Math.max(MIN_PART_MINUTES, want), {
          secondary: true,
        })
      }
    }
  }
  if (secondary) parts.push(secondary)
  if (finisher) parts.push(finisher)

  // --- fit to the budget -------------------------------------------------------
  // The order of sacrifice: the second block, then the finisher's length, then
  // the main work's length. The warm-up is never cut: a max-hang session on
  // cold fingers is not a shorter session, it is a different and worse one.
  let cut = false
  let cutNote = null
  let total = parts.reduce((a, p) => a + p.minutes, 0)
  if (total > budget && secondary) {
    parts.splice(parts.indexOf(secondary), 1)
    secondary = null
    total = parts.reduce((a, p) => a + p.minutes, 0)
  }
  if (total > budget && finisher && finisher.minutes > FINISHER_SHORT_MINUTES) {
    finisher.minutes = FINISHER_SHORT_MINUTES
    total = parts.reduce((a, p) => a + p.minutes, 0)
  }
  if (total > budget) {
    const mainPart = parts.find((p) => p.role === 'main')
    const fixed = total - mainPart.minutes
    const allowed = Math.max(MIN_MAIN_MINUTES, budget - fixed)
    if (allowed < mainPart.minutes) {
      cut = true
      cutNote = `Cut to fit ${budget} min: ${mainPart.minutes} min of ${mainPart.name} becomes ${allowed}. Drop the last set or the last problems, never the warm-up.`
      mainPart.minutes = allowed
      mainPart.cutFrom = mainPart.minutes
    }
    total = parts.reduce((a, p) => a + p.minutes, 0)
  }

  return {
    parts,
    total,
    budget,
    cut,
    cutNote,
    // Everything the sheet names, for logging the session as what it was.
    ids: parts.flatMap((p) => (p.exercises ? p.exercises.map((e) => e.id) : p.exercise && p.role !== 'warmup' ? [p.exercise.id] : [])),
  }
}
