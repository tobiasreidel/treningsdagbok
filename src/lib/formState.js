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
      attempts: r.attempts ?? '',
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
  return { name: '', grade: null, send_type: null, attempts: '' }
}

export function emptyExercise() {
  return { exercise: 'pullups', sets: '', reps: '', weight: '' }
}

// A hangboard exercise: one or two hands, a rep count, an optional rest (in
// seconds) between reps, and a list of sets. Each set carries its own added
// weight (kg), hang time (seconds), and edge size (mm); new sets default to the
// first set's values but can be changed individually. One-hand weight may be
// negative (assisted via pulley); two-hand weight is added only.
export function emptyHang() {
  return { hands: 'two', reps: '1', rest: '', sets: [{ weight: '', time: '', edge: '' }] }
}

// Read a hangboard entry in either shape. Legacy entries were a flat
// { hands, weight }; new ones are { hands, reps, rest, sets: [{ weight, time, edge }] }.
// Edge size was added later, so older sets simply lack it (treated as blank).
export function normalizeHang(h) {
  if (h && Array.isArray(h.sets)) {
    return {
      hands: h.hands || 'two',
      reps: h.reps ?? '1',
      rest: h.rest ?? '',
      sets: h.sets.length
        ? h.sets.map((s) => ({ edge: '', ...s }))
        : [{ weight: '', time: '', edge: '' }],
    }
  }
  return {
    hands: h?.hands || 'two',
    reps: h?.reps ?? '1',
    rest: '',
    sets: [{ weight: h?.weight ?? '', time: '', edge: '' }],
  }
}
