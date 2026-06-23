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

// The strength + finger-training module is shown for standalone strength
// sessions and (optionally) for indoor climbing sessions.
export function usesStrengthModule(form) {
  return form.sport === 'strength' || (form.sport === 'climbing' && form.location === 'indoor')
}

export function emptyRoute() {
  return { name: '', grade: null, send_type: null, attempts: '' }
}

export function emptyExercise() {
  return { exercise: 'pullups', sets: '', reps: '', weight: '' }
}

// A hangboard hang: one or two hands. One-hand weight may be negative
// (assisted via pulley); two-hand weight is added weight only.
export function emptyHang() {
  return { hands: 'two', weight: '' }
}
