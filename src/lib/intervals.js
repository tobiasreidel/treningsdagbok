// intervals.icu integration. The PWA calls intervals.icu directly from the
// browser — the API supports CORS and HTTP Basic auth (username "API_KEY",
// password = your personal key), so no server proxy is needed.
import { supabase } from './supabase'
import { format, subDays } from 'date-fns'

const API_BASE = 'https://intervals.icu/api/v1'

async function userId() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// ---- credential storage (RLS-protected user_settings table) ----------------
export async function getSettings() {
  const { data, error } = await supabase
    .from('user_settings')
    .select('intervals_athlete_id, intervals_api_key')
    .maybeSingle()
  if (error) throw error
  return {
    athleteId: data?.intervals_athlete_id || '',
    apiKey: data?.intervals_api_key || '',
  }
}

export async function saveSettings({ athleteId, apiKey }) {
  const uid = await userId()
  if (!uid) throw new Error('Not signed in')
  const { error } = await supabase.from('user_settings').upsert({
    user_id: uid,
    intervals_athlete_id: athleteId?.trim() || '0',
    intervals_api_key: apiKey?.trim() || null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export function hasCredentials(settings) {
  return Boolean(settings?.apiKey)
}

// ---- intervals.icu API -----------------------------------------------------
function authHeader(apiKey) {
  // Basic auth: username is the literal "API_KEY", password is the key.
  return 'Basic ' + btoa(`API_KEY:${apiKey}`)
}

const CYCLING_TYPE = /ride/i // Ride, VirtualRide, GravelRide, MountainBikeRide, EBikeRide…

export function isCyclingActivity(a) {
  return CYCLING_TYPE.test(a.type || '')
}

// Fetch the athlete's activities in the last `sinceDays`, cycling only.
export async function fetchCyclingActivities({ athleteId, apiKey, sinceDays = 60 }) {
  const id = (athleteId || '0').trim() || '0'
  const oldest = format(subDays(new Date(), sinceDays), 'yyyy-MM-dd')
  const newest = format(new Date(), 'yyyy-MM-dd')
  const url = `${API_BASE}/athlete/${id}/activities?oldest=${oldest}&newest=${newest}`

  let res
  try {
    res = await fetch(url, { headers: { Authorization: authHeader(apiKey) } })
  } catch (e) {
    throw new Error('Could not reach intervals.icu — check your connection.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('intervals.icu rejected the key. Double-check your API key and athlete ID.')
  }
  if (!res.ok) {
    throw new Error(`intervals.icu error (${res.status}).`)
  }
  const all = await res.json()
  return (Array.isArray(all) ? all : []).filter(isCyclingActivity)
}

// ---- mapping ---------------------------------------------------------------
function round(n, dp = 0) {
  if (n == null || Number.isNaN(Number(n))) return null
  const f = 10 ** dp
  return Math.round(Number(n) * f) / f
}

function guessSubtype(type = '') {
  const t = type.toLowerCase()
  if (t.includes('gravel') || t.includes('mountain')) return 'gravel'
  return 'road'
}

// Turn an intervals.icu activity into our session-form shape, with the
// objective fields pre-filled. The user adds feeling/RPE/notes.
export function activityToForm(a) {
  const date = (a.start_date_local || '').slice(0, 10)
  return {
    date,
    sport: 'cycling',
    subtype: guessSubtype(a.type),
    location: null,
    feeling: null,
    rpe: null,
    duration: a.moving_time ? Math.round(a.moving_time / 60) : '',
    notes: '',
    extra: {
      distance_km: a.distance != null ? round(a.distance / 1000, 1) : null,
      elevation_m: round(a.total_elevation_gain),
      avg_speed: a.average_speed != null ? round(a.average_speed * 3.6, 1) : null,
      avg_hr: round(a.average_heartrate),
      avg_power: round(a.average_watts),
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

// A short human label for the import list.
export function activitySummary(a) {
  const km = a.distance != null ? `${round(a.distance / 1000, 1)} km` : null
  const elev = a.total_elevation_gain ? `${round(a.total_elevation_gain)} m` : null
  const mins = a.moving_time ? `${Math.round(a.moving_time / 60)} min` : null
  return [km, elev, mins].filter(Boolean).join(' · ')
}
