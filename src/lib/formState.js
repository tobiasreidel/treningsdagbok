import { todayISO } from './format'

// The single source of truth for the session form shape. Both the register
// wizard and the edit page work against this object.
export function emptyForm() {
  return {
    date: todayISO(),
    sport: null,
    subtype: null,
    location: null, // climbing only
    feeling: null,
    rpe: null,
    duration: '',
    notes: '',
    // sport-specific scalars, mirrored into sessions.extra (jsonb)
    //   cycling : { distance_km, elevation_m, avg_speed, avg_hr, avg_power }
    //   climbing: { grades: [], grading_system: 'french' }
    extra: {},
    routes: [], // outdoor climbing only
    photoFile: null, // newly attached File
    photoUrl: null, // existing storage path (edit)
    removePhoto: false,
  }
}

export function sessionToForm(s) {
  return {
    date: s.date,
    sport: s.sport,
    subtype: s.subtype ?? null,
    location: s.location ?? null,
    feeling: s.feeling ?? null,
    rpe: s.rpe ?? null,
    duration: s.duration ?? '',
    notes: s.notes ?? '',
    extra: s.extra ?? {},
    routes: (s.routes || []).map((r) => ({
      name: r.name ?? '',
      grade: r.grade ?? null,
      send_type: r.send_type ?? null,
    })),
    photoFile: null,
    photoUrl: s.photo_url ?? null,
    removePhoto: false,
  }
}

export function isOutdoorClimbing(form) {
  return form.sport === 'climbing' && form.location === 'outdoor'
}

// The strength + finger-training module is shown for standalone strength or
// finger sessions and (optionally) for indoor climbing sessions.
export function usesStrengthModule(form) {
  return (
    form.sport === 'strength' ||
    form.sport === 'finger' ||
    (form.sport === 'climbing' && form.location === 'indoor')
  )
}

export function emptyRoute() {
  return { name: '', grade: null, send_type: null }
}

export function emptyExercise() {
  return { exercise: 'pullups', sets: '', reps: '', weight: '' }
}

// A hangboard exercise: one or two hands, a grip, a rep count, an optional
// rest (in seconds) between reps, and a list of sets. Each set carries its own
// load, hang time (seconds) and edge size (mm); new sets default to the first
// set's values but can be changed individually.
//
// LOAD IS STORED AS TOTAL KG — bodyweight included — matching the finger test
// it gets compared against (see fingerLoad.js for why the denominator decides
// whether "85% of max" is a near-maximal hang or an assisted one).
//
//   v4 sets:    { load_total_kg, time, edge, ... }
//   legacy sets:{ weight }  = ADDED kg, converted with a bodyweight at read
//               time and left untouched on disk.
export function emptyHang() {
  return {
    hands: 'two',
    grip: 'halfcrimp',
    reps: '1',
    rest: '',
    sets: [{ load_total_kg: '', time: '', edge: '' }],
  }
}

// Read a hangboard entry in any shape it has ever been stored in:
//   v1 flat        { hands, weight }
//   v2 sets        { hands, reps, rest, sets: [{ weight, time, edge }] }
//   v4 total load  { hands, grip, reps, rest, sets: [{ load_total_kg, ... }] }
// Legacy `weight` is preserved verbatim so nothing is lost or silently
// reinterpreted on disk; fingerLoad.setTotalLoad() decides what it means.
export function normalizeHang(h) {
  const base = { load_total_kg: '', weight: '', time: '', edge: '' }
  if (h && Array.isArray(h.sets)) {
    return {
      hands: h.hands || 'two',
      grip: h.grip || 'halfcrimp',
      reps: h.reps ?? '1',
      rest: h.rest ?? '',
      sets: h.sets.length ? h.sets.map((s) => ({ ...base, ...s })) : [{ ...base }],
    }
  }
  return {
    hands: h?.hands || 'two',
    grip: h?.grip || 'halfcrimp',
    reps: h?.reps ?? '1',
    rest: '',
    sets: [{ ...base, weight: h?.weight ?? '' }],
  }
}

// Is this set expressed in the legacy added-weight form?
export function isLegacyHangSet(set) {
  const total = Number(set?.load_total_kg)
  return !(Number.isFinite(total) && total > 0) && set?.weight !== '' && set?.weight != null
}
