// The one place that interprets `sessions.extra`.
//
// WHY THIS EXISTS
// ---------------
// `extra` is an untyped JSON blob that has been through four shapes. Three real
// bugs came from consumers interpreting it independently and drifting apart:
//
//   * the hangboard chart read `set.weight` while v4 writes `load_total_kg`,
//     so it charted 0 kg for every session logged after the migration;
//   * `finger.campus` was read as a boolean when it is an enum whose 'spray'
//     member is also truthy, so spray sessions counted as campus;
//   * `gradeContext: 'spray'` was looked up in a limits object with no spray
//     key, so the label silently disappeared.
//
// All three are the same bug. So every read of `extra` goes through
// `normaliseSession()`, which returns a fully resolved shape: hangboard loads
// always in total kilos (or an explicit null when they cannot be read), campus
// always the enum, grades always parsed. Nothing else should touch `extra`
// directly, and a new consumer gets the resolved shape for free.
//
// Writes stamp `extra.schema_version`. Absent means v3 or older, which is a
// rule we can state once here instead of guessing at each call site.
import { normalizeHang } from './formState'
import { formatGrade } from './constants'

export const SCHEMA_VERSION = 4

const num = (v) => Number(v) || 0
const finite = (v) => Number.isFinite(Number(v)) && v !== '' && v !== null

// Time of day, coarse on purpose. A three-way choice is one tap and gets the
// finger-recovery window from calendar days to +/- 3 hours, which is enough to
// tell a Monday evening to Wednesday morning gap (34 h) from two days.
export const TIMES_OF_DAY = [
  { key: 'morning', label: 'Morning', hour: 9 },
  { key: 'midday', label: 'Midday', hour: 13 },
  { key: 'evening', label: 'Evening', hour: 19 },
]

export function hourForTimeOfDay(key) {
  return TIMES_OF_DAY.find((t) => t.key === key)?.hour ?? null
}

// Which slot a clock hour falls in, for defaulting the field when logging today.
export function timeOfDayNow(date = new Date()) {
  const h = date.getHours()
  if (h < 11) return 'morning'
  if (h < 16) return 'midday'
  return 'evening'
}

// One hangboard set, resolved.
//
//   kg          total load including bodyweight, or null when unreadable
//   derived     reconstructed from a legacy added-weight row
//   unreadable  legacy added weight with no bodyweight to convert it
function normaliseSet(set, bodyweight) {
  const seconds = num(set.time) || null
  const edgeMm = num(set.edge) || null
  const total = Number(set.load_total_kg)
  if (Number.isFinite(total) && total > 0) {
    return { kg: total, derived: false, unreadable: false, seconds, edgeMm }
  }
  const added = Number(set.weight)
  if (!finite(set.weight) || !Number.isFinite(added)) {
    return { kg: null, derived: false, unreadable: false, seconds, edgeMm }
  }
  const bw = num(bodyweight)
  if (!(bw > 0)) {
    return { kg: null, derived: false, unreadable: true, seconds, edgeMm }
  }
  // Legacy rows are added weight, and one-hand sets may be negative (assisted).
  return { kg: bw + added, derived: true, unreadable: false, seconds, edgeMm }
}

function normaliseHangboard(list, bodyweight) {
  return (list || []).map((h) => {
    const nh = normalizeHang(h)
    return {
      hands: nh.hands,
      grip: nh.grip,
      reps: Math.max(1, num(nh.reps)),
      restS: num(nh.rest) || null,
      sets: nh.sets.map((s) => normaliseSet(s, bodyweight)),
    }
  })
}

// `campus` was a boolean before it was an enum. `true` meant a campus board.
function normaliseCampus(v) {
  if (v === true) return 'board'
  if (v === 'board' || v === 'spray') return v
  return ''
}

const cache = new WeakMap()

// The resolved read shape for one session row. Cached per row object (the row
// is immutable in practice), because the recovery model re-reads every session
// dozens of times per render.
export function normaliseSession(row, { bodyweight = 0 } = {}) {
  if (!row) return emptyShape()
  const hit = cache.get(row)
  if (hit && hit.bodyweight === num(bodyweight)) return hit.shape

  const e = row.extra || {}
  const f = e.finger || {}
  const shape = {
    version: Number(e.schema_version) || 3,
    date: row.date,
    sport: row.sport,
    subtype: row.subtype || null,
    location: row.location || null,
    rpe: num(row.rpe) || null,
    duration: num(row.duration) || null,
    fingerRpe: num(e.rpe_finger) || null,
    pump: num(e.pump) || null,
    trainingLoad: num(e.training_load) || null,
    // Grades worked, formatted for the session's own scale. Indoor sessions log
    // these instead of routes, and they are a real difficulty signal.
    grades: (e.grades || []).map((g) => formatGrade(g, row.subtype)).filter(Boolean),
    // Indoor stand-in for the outdoor route log: how many attempts were within
    // a grade of the limit. Nothing else in an indoor session reveals this.
    nearLimitAttempts: finite(e.near_limit_attempts) ? num(e.near_limit_attempts) : null,
    timeOfDay: e.time_of_day || null,
    hour: hourForTimeOfDay(e.time_of_day),
    campus: normaliseCampus(f.campus),
    pockets: !!f.pockets,
    hangboard: normaliseHangboard(f.hangboard, bodyweight),
    strength: e.strength || [],
    strengthMinutes: num(e.strength_minutes) || null,
    fingerMinutes: num(e.finger_minutes) || null,
    coach: e.coach || null,
    exerciseIds: exerciseIdsOf(e.coach),
    testIds: e.test_session?.ids || [],
  }
  shape.hasUnreadableHangs = shape.hangboard.some((h) => h.sets.some((s) => s.unreadable))
  shape.hasFingerWork = !!(shape.campus || shape.hangboard.length > 0)
  cache.set(row, { bodyweight: num(bodyweight), shape })
  return shape
}

function exerciseIdsOf(coach) {
  if (!coach) return []
  if (Array.isArray(coach.exercises)) return coach.exercises
  return coach.exercise ? [coach.exercise] : []
}

function emptyShape() {
  return {
    version: SCHEMA_VERSION,
    date: null, sport: null, subtype: null, location: null,
    rpe: null, duration: null, fingerRpe: null, pump: null, trainingLoad: null,
    grades: [], nearLimitAttempts: null, timeOfDay: null, hour: null,
    campus: '', pockets: false, hangboard: [], strength: [],
    strengthMinutes: null, fingerMinutes: null, coach: null,
    exerciseIds: [], testIds: [],
    hasUnreadableHangs: false, hasFingerWork: false,
  }
}

// Stamp the version on the way out. Called by the write path so every new row
// says which shape it is in.
export function stampSchema(extra) {
  return { schema_version: SCHEMA_VERSION, ...(extra || {}) }
}
