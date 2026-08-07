// intervals.icu integration. The PWA calls intervals.icu directly from the
// browser - the API supports CORS and HTTP Basic auth (username "API_KEY",
// password = your personal key), so no server proxy is needed.
import { supabase, currentUserId } from './supabase'
import { format, subDays } from 'date-fns'
import { fetchSessions, createSession } from './sessions'

const API_BASE = 'https://intervals.icu/api/v1'

// ---- credential storage (RLS-protected user_settings table) ----------------

// Held for the visit, keyed by user so signing in as someone else can never
// read the previous account's credentials. One boot asks for this row four
// times over (auto-import, the friend-share pass, the fitness fetch, the
// import screen) and it only changes on the settings screen, which clears it.
let settingsCache = null
let settingsCacheUser = null

export async function getSettings() {
  const uid = await currentUserId()
  if (settingsCache && settingsCacheUser === uid) return settingsCache
  const { data, error } = await supabase
    .from('user_settings')
    .select('intervals_athlete_id, intervals_api_key')
    .maybeSingle()
  if (error) throw error
  settingsCache = {
    athleteId: data?.intervals_athlete_id || '',
    apiKey: data?.intervals_api_key || '',
  }
  settingsCacheUser = uid
  return settingsCache
}

export function forgetSettings() {
  settingsCache = null
  settingsCacheUser = null
}

export async function saveSettings({ athleteId, apiKey }) {
  const uid = await currentUserId()
  if (!uid) throw new Error('Not signed in')
  const { error } = await supabase.from('user_settings').upsert({
    user_id: uid,
    intervals_athlete_id: athleteId?.trim() || '0',
    intervals_api_key: apiKey?.trim() || null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  forgetSettings()
}

export function hasCredentials(settings) {
  return Boolean(settings?.apiKey)
}

// ---- intervals.icu API -----------------------------------------------------
// Basic auth: username is the literal "API_KEY", password is the key.
// (Also used by streams.js for the per-activity analysis fetches.)
export function authHeader(apiKey) {
  return 'Basic ' + btoa(`API_KEY:${apiKey}`)
}

const CYCLING_TYPE = /ride/i // Ride, VirtualRide, GravelRide, MountainBikeRide, EBikeRide…
const EBIKE_TYPE = /^e-?(bike|mtb|mountainbike)/i // EBikeRide, EMountainBikeRide
const CLIMBING_TYPE = /climb|boulder/i // RockClimbing, Climbing, IndoorClimbing, Bouldering…
const RUNNING_TYPE = /run/i // Run, VirtualRun, TrailRun, TreadmillRun…
const SWIMMING_TYPE = /swim/i // Swim, OpenWaterSwim, LapSwimming…

export function isCyclingActivity(a) {
  return CYCLING_TYPE.test(a.type || '')
}

// A motor-assisted ride. Checked inside cycling so a stray type starting with
// an E (Elliptical and friends) can never fall in here.
export function isEbikeActivity(a) {
  return isCyclingActivity(a) && EBIKE_TYPE.test(a.type || '')
}

export function isClimbingActivity(a) {
  return CLIMBING_TYPE.test(a.type || '')
}

export function isRunningActivity(a) {
  return RUNNING_TYPE.test(a.type || '')
}

export function isSwimmingActivity(a) {
  return SWIMMING_TYPE.test(a.type || '')
}

// Activities we know how to turn into a session.
export function isImportableActivity(a) {
  return (
    isCyclingActivity(a) ||
    isClimbingActivity(a) ||
    isRunningActivity(a) ||
    isSwimmingActivity(a)
  )
}

// Which sport an importable activity maps to (checked in precedence order).
export function activitySport(a) {
  if (isClimbingActivity(a)) return 'climbing'
  if (isSwimmingActivity(a)) return 'swimming'
  if (isRunningActivity(a)) return 'running'
  return 'cycling'
}

// Fetch the athlete's importable activities (rides + climbs) in the last
// `sinceDays`.
export async function fetchActivities({ athleteId, apiKey, sinceDays = 60 }) {
  const id = (athleteId || '0').trim() || '0'
  const oldest = format(subDays(new Date(), sinceDays), 'yyyy-MM-dd')
  const newest = format(new Date(), 'yyyy-MM-dd')
  const url = `${API_BASE}/athlete/${id}/activities?oldest=${oldest}&newest=${newest}`

  let res
  try {
    res = await fetch(url, { headers: { Authorization: authHeader(apiKey) } })
  } catch (e) {
    throw new Error('Could not reach intervals.icu. Check your connection.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('intervals.icu rejected the key. Double-check your API key and athlete ID.')
  }
  if (!res.ok) {
    throw new Error(`intervals.icu error (${res.status}).`)
  }
  const all = await res.json()
  return (Array.isArray(all) ? all : []).filter(isImportableActivity)
}

// ---- mapping ---------------------------------------------------------------
function round(n, dp = 0) {
  if (n == null || Number.isNaN(Number(n))) return null
  const f = 10 ** dp
  return Math.round(Number(n) * f) / f
}

// E-bike first: an EMountainBikeRide is an e-bike before it is a gravel ride,
// and the motor is the distinction worth keeping.
function guessCyclingSubtype(a) {
  if (isEbikeActivity(a)) return 'ebike'
  const t = (a.type || '').toLowerCase()
  if (t.includes('gravel') || t.includes('mountain')) return 'gravel'
  return 'road'
}

function guessRunningSubtype(a) {
  const t = (a.type || '').toLowerCase()
  if (t.includes('trail')) return 'trail'
  if (t.includes('treadmill') || /virtual/.test(t) || a.trainer === true) return 'treadmill'
  return 'road'
}

function guessSwimmingSubtype(type = '') {
  return /open/i.test(type) ? 'openwater' : 'pool'
}

// Bouldering vs roped - that's all the type tells us; the user refines later.
function guessClimbingSubtype(type = '') {
  return /boulder/i.test(type) ? 'bouldering' : null
}

// Indoor/outdoor from the trainer flag and any hints in the type/name.
function guessClimbingLocation(a) {
  const hint = `${a.type || ''} ${a.name || ''}`.toLowerCase()
  if (a.trainer === true || /indoor|gym/.test(hint)) return 'indoor'
  if (/outdoor|crag|rock\b/.test(hint)) return 'outdoor'
  return null
}

const durationMin = (a) => {
  const secs = a.moving_time || a.elapsed_time
  return secs ? Math.round(secs / 60) : ''
}

// Garmin's post-ride self-evaluation syncs to intervals.icu as `feel` (1-5,
// but 1 = strong there) and `icu_rpe` (1-10). Map them onto our scales so
// imported sessions arrive with feeling/RPE already filled in.
function importedFeeling(a) {
  const f = Number(a.feel)
  return f >= 1 && f <= 5 ? 6 - f : null // flip: ours is 5 = strong
}

function importedRpe(a) {
  const r = Number(a.icu_rpe ?? a.perceived_exertion)
  if (!Number.isFinite(r) || r <= 0) return null
  return Math.max(1, Math.min(10, Math.round(r)))
}

// Turn an intervals.icu ride into our session-form shape, with the objective
// fields pre-filled. The user adds feeling/RPE/notes.
function cyclingActivityToForm(a) {
  const date = (a.start_date_local || '').slice(0, 10)
  return {
    date,
    sport: 'cycling',
    subtype: guessCyclingSubtype(a),
    location: null,
    feeling: importedFeeling(a),
    rpe: importedRpe(a),
    duration: a.moving_time ? Math.round(a.moving_time / 60) : '',
    notes: '',
    extra: {
      distance_km: a.distance != null ? round(a.distance / 1000, 1) : null,
      elevation_m: round(a.total_elevation_gain),
      avg_speed: a.average_speed != null ? round(a.average_speed * 3.6, 1) : null,
      max_speed: a.max_speed != null ? round(a.max_speed * 3.6, 1) : null,
      avg_hr: round(a.average_heartrate),
      max_hr: round(a.max_heartrate),
      avg_power: round(a.average_watts ?? a.icu_average_watts),
      norm_power: round(a.icu_weighted_avg_watts ?? a.weighted_average_watts),
      cadence: round(a.average_cadence),
      training_load: round(a.icu_training_load),
      if_factor: round(a.icu_intensity, 2),
      work_kj: a.icu_joules != null ? round(a.icu_joules / 1000) : round(a.kilojoules),
      calories: round(a.calories),
      indoor: a.trainer === true || /virtual/i.test(a.type || ''),
      intervals_id: String(a.id),
      intervals_name: a.name || null,
      intervals_type: a.type || null,
    },
    routes: [],
    photoFile: null,
    photoUrl: null,
    removePhoto: false,
  }
}

// Turn an intervals.icu climb (e.g. a watch-recorded session) into our
// session-form shape. Grades/sends are added by the user afterwards.
function climbingActivityToForm(a) {
  const date = (a.start_date_local || '').slice(0, 10)
  return {
    date,
    sport: 'climbing',
    subtype: guessClimbingSubtype(a.type),
    location: guessClimbingLocation(a),
    feeling: importedFeeling(a),
    rpe: importedRpe(a),
    duration: durationMin(a),
    notes: '',
    extra: {
      avg_hr: round(a.average_heartrate),
      max_hr: round(a.max_heartrate),
      calories: round(a.calories),
      training_load: round(a.icu_training_load),
      intervals_id: String(a.id),
      intervals_name: a.name || null,
      intervals_type: a.type || null,
    },
    routes: [],
    photoFile: null,
    photoUrl: null,
    removePhoto: false,
  }
}

// Turn an intervals.icu run into our session-form shape. Distance/elevation in
// km/m like cycling, so the shared stats helpers work; pace is derived later.
function runningActivityToForm(a) {
  const date = (a.start_date_local || '').slice(0, 10)
  return {
    date,
    sport: 'running',
    subtype: guessRunningSubtype(a),
    location: null,
    feeling: importedFeeling(a),
    rpe: importedRpe(a),
    duration: durationMin(a),
    notes: '',
    extra: {
      distance_km: a.distance != null ? round(a.distance / 1000, 2) : null,
      elevation_m: round(a.total_elevation_gain),
      avg_speed: a.average_speed != null ? round(a.average_speed * 3.6, 1) : null,
      avg_hr: round(a.average_heartrate),
      max_hr: round(a.max_heartrate),
      cadence: round(a.average_cadence),
      training_load: round(a.icu_training_load),
      calories: round(a.calories),
      intervals_id: String(a.id),
      intervals_name: a.name || null,
      intervals_type: a.type || null,
    },
    routes: [],
    photoFile: null,
    photoUrl: null,
    removePhoto: false,
  }
}

// Turn an intervals.icu swim into our session-form shape. Swim distance stays
// in metres (extra.distance_m), which is how swimmers think about it.
function swimmingActivityToForm(a) {
  const date = (a.start_date_local || '').slice(0, 10)
  return {
    date,
    sport: 'swimming',
    subtype: guessSwimmingSubtype(a.type),
    location: null,
    feeling: importedFeeling(a),
    rpe: importedRpe(a),
    duration: durationMin(a),
    notes: '',
    extra: {
      distance_m: round(a.distance),
      avg_hr: round(a.average_heartrate),
      max_hr: round(a.max_heartrate),
      training_load: round(a.icu_training_load),
      calories: round(a.calories),
      intervals_id: String(a.id),
      intervals_name: a.name || null,
      intervals_type: a.type || null,
    },
    routes: [],
    photoFile: null,
    photoUrl: null,
    removePhoto: false,
  }
}

// Map any importable activity to a session form, picking the sport by type.
export function activityToForm(a) {
  switch (activitySport(a)) {
    case 'climbing':
      return climbingActivityToForm(a)
    case 'running':
      return runningActivityToForm(a)
    case 'swimming':
      return swimmingActivityToForm(a)
    default:
      return cyclingActivityToForm(a)
  }
}

// Coalesce concurrent auto-imports into one run. Without this, two overlapping
// calls (e.g. React StrictMode mounting the effect twice, or an 'online' event
// firing mid-import) each read the existing sessions before either inserts the
// new activity, so the intervals_id de-dupe misses and the activity is imported
// twice. Sharing one in-flight promise makes the de-dupe reliable.
let importInFlight = null

export function autoImportNewActivities(opts = {}) {
  if (!importInFlight) {
    importInFlight = runAutoImport(opts).finally(() => {
      importInFlight = null
    })
  }
  return importInFlight
}

// Best-effort background import, run on app open so activities show up without
// a trip to the import screen. Silently adds any ride or climb not already
// logged (matched by intervals_id) and returns how many were added.
async function runAutoImport({ sinceDays = 60 } = {}) {
  const settings = await getSettings()
  if (!hasCredentials(settings)) return 0

  const [activities, sessions] = await Promise.all([
    fetchActivities({ ...settings, sinceDays }),
    fetchSessions().catch(() => []),
  ])
  const importedIds = new Set(
    sessions.map((s) => s.extra?.intervals_id).filter(Boolean),
  )

  let added = 0
  for (const a of activities) {
    if (importedIds.has(String(a.id))) continue
    importedIds.add(String(a.id)) // guard against the same id twice in one run
    try {
      const res = await createSession(activityToForm(a))
      if (!res?.duplicate) added += 1
    } catch {
      // Skip a single bad activity rather than aborting the whole batch.
    }
  }
  return added
}

// A short human label for the import list - metrics that fit the sport.
export function activitySummary(a) {
  const mins = durationMin(a) ? `${durationMin(a)} min` : null
  const hr = a.average_heartrate ? `${round(a.average_heartrate)} bpm` : null
  const sport = activitySport(a)

  if (sport === 'climbing') {
    const cal = a.calories ? `${round(a.calories)} kcal` : null
    return [mins, hr, cal].filter(Boolean).join(' · ')
  }
  if (sport === 'swimming') {
    const m = a.distance != null ? `${round(a.distance)} m` : null
    return [m, mins, hr].filter(Boolean).join(' · ')
  }
  if (sport === 'running') {
    const km = a.distance != null ? `${round(a.distance / 1000, 1)} km` : null
    const elev = a.total_elevation_gain ? `${round(a.total_elevation_gain)} m` : null
    return [km, elev, mins, hr].filter(Boolean).join(' · ')
  }
  const km = a.distance != null ? `${round(a.distance / 1000, 1)} km` : null
  const elev = a.total_elevation_gain ? `${round(a.total_elevation_gain)} m` : null
  const power = a.average_watts ?? a.icu_average_watts
  const w = power ? `${round(power)} W` : null
  return [km, elev, mins, w].filter(Boolean).join(' · ')
}
