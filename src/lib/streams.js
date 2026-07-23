// Per-activity analysis data from intervals.icu: the full activity record
// (zones, laps) plus its recorded streams, downsampled for the charts in
// ActivityAnalysis. Results are cached in IndexedDB - a finished activity
// never changes, so one fetch per activity is enough forever.
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { getSettings, hasCredentials, authHeader } from './intervals'
import { supabase } from './supabase'

const API_BASE = 'https://intervals.icu/api/v1'
// v5: values rounded to rendered precision (v4 stored raw 15-digit floats,
// ~4x the bytes for pixel-identical charts).
const CACHE_PREFIX = 'icu-analysis:v5:'
const MAX_POINTS = 420 // chart resolution after downsampling

// In-memory layer so re-opening the same session in one visit is instant.
const memory = new Map()
// Sessions whose shared copy was already written this app session.
const sharedThisSession = new Set()

// Note: no 'latlng' here - the streams endpoint doesn't serve GPS data. The
// track comes from GET /activity/{id}/map (MapData.latlngs) instead.
const STREAM_TYPES = [
  'time',
  'distance',
  'altitude',
  'velocity_smooth',
  'heartrate',
  'watts',
  'cadence',
]

async function apiGet(path, apiKey) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: authHeader(apiKey) },
    })
  } catch {
    throw new Error('Could not reach intervals.icu.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('intervals.icu rejected the key.')
  }
  if (res.status === 404) return null // e.g. no streams recorded
  if (!res.ok) throw new Error(`intervals.icu error (${res.status}).`)
  return res.json()
}

// Average the non-null values of arr[from..to) - null when all are null.
function bucketAvg(arr, from, to) {
  let sum = 0
  let n = 0
  for (let i = from; i < to; i += 1) {
    const v = arr[i]
    if (v != null && Number.isFinite(v)) {
      sum += v
      n += 1
    }
  }
  return n ? sum / n : null
}

const hasValues = (arr) => Array.isArray(arr) && arr.some((v) => v != null)

// Round to the precision the charts actually draw at. Bucket averages carry
// 15 significant digits otherwise, which nothing renders and every byte of
// which gets cached (and, for shared rides, stored and sent).
const round = (v, d) => (v == null ? null : Number(v.toFixed(d)))

// Reduce the raw 1 Hz streams to MAX_POINTS chart points. Numeric series are
// bucket-averaged; time/distance take the bucket's last sample so the x-axis
// keeps its true total.
function downsample(raw) {
  const time = raw.time || []
  const n = time.length
  if (!n) return null
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS))
  const out = { t: [], km: [], alt: [], speed: [], hr: [], watts: [], cad: [] }
  const dist = hasValues(raw.distance) ? raw.distance : null

  for (let from = 0; from < n; from += stride) {
    const to = Math.min(n, from + stride)
    out.t.push(time[to - 1] ?? 0)
    out.km.push(dist ? round((dist[to - 1] ?? 0) / 1000, 2) : null)
    out.alt.push(round(bucketAvg(raw.altitude || [], from, to), 0))
    const v = bucketAvg(raw.velocity_smooth || [], from, to)
    out.speed.push(v != null ? round(v * 3.6, 1) : null)
    out.hr.push(round(bucketAvg(raw.heartrate || [], from, to), 0))
    out.watts.push(round(bucketAvg(raw.watts || [], from, to), 0))
    out.cad.push(round(bucketAvg(raw.cadence || [], from, to), 0))
  }
  // Drop series with no data at all so the UI can simply map over what's left.
  for (const key of ['alt', 'speed', 'hr', 'watts', 'cad']) {
    if (!hasValues(out[key])) out[key] = null
  }
  if (!hasValues(out.km)) out.km = null
  out.n = out.t.length
  return out
}

// Exact avg/max/min over a full-resolution stream. The chart points are
// bucket-averaged (which flattens peaks), so header stats must come from the
// raw data - otherwise "max speed" disagrees with what Strava/intervals show.
function seriesStats(arr, scale = 1) {
  if (!hasValues(arr)) return null
  let sum = 0
  let n = 0
  let max = -Infinity
  let min = Infinity
  for (const v of arr) {
    if (v != null && Number.isFinite(v)) {
      sum += v
      n += 1
      if (v > max) max = v
      if (v < min) min = v
    }
  }
  if (!n) return null
  return { avg: (sum / n) * scale, max: max * scale, min: min * scale }
}

// GPS track, thinned to ~600 points - plenty for a small route sketch.
// Entries arrive either as [lat, lng] pairs or as {lat, lng} objects
// (the intervals.icu JSON uses the latter), so normalise both.
function thinLatlng(latlng) {
  if (!Array.isArray(latlng)) return null
  const pts = []
  for (const p of latlng) {
    if (Array.isArray(p) && p[0] != null && p[1] != null) pts.push([p[0], p[1]])
    else if (p && typeof p === 'object' && p.lat != null && (p.lng ?? p.lon) != null) {
      pts.push([p.lat, p.lng ?? p.lon])
    }
  }
  if (pts.length < 2) return null
  const stride = Math.max(1, Math.ceil(pts.length / 600))
  const out = []
  // 5 decimals is ~1 m - far finer than a route sketch can show.
  const at = (p) => [round(p[0], 5), round(p[1], 5)]
  for (let i = 0; i < pts.length; i += stride) out.push(at(pts[i]))
  if (pts.length % stride !== 1) out.push(at(pts[pts.length - 1]))
  return out
}

// HR zones: seconds per zone + the zone's bpm ceiling (when provided).
function hrZones(activity) {
  const times = activity?.icu_hr_zone_times
  if (!Array.isArray(times) || !times.some((s) => s > 0)) return null
  const tops = Array.isArray(activity.icu_hr_zones) ? activity.icu_hr_zones : []
  return times.map((secs, i) => ({
    label: `Z${i + 1}`,
    secs: secs || 0,
    range:
      tops[i] != null
        ? i === times.length - 1
          ? tops[i - 1] != null
            ? `>${tops[i - 1]}`
            : ''
          : `≤${tops[i]}`
        : '',
  }))
}

// Power zones: [{id:'Z2',secs}] - keep the plain Z1..Z7 buckets (skip extras
// like sweet spot, which overlap and would double-count).
function powerZones(activity) {
  const rows = activity?.icu_zone_times
  if (!Array.isArray(rows)) return null
  const zones = rows
    .filter((z) => /^Z\d/i.test(z?.id || '') && !/^Z\d+[a-z]/i.test(z?.id || ''))
    .map((z) => ({ label: z.id, secs: z.secs || 0 }))
  return zones.some((z) => z.secs > 0) ? zones : null
}

// Laps / intervals as detected or planned on intervals.icu.
function laps(activity) {
  const rows = activity?.icu_intervals
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 60) return null
  return rows.map((r, i) => ({
    label: r.label || `Lap ${i + 1}`,
    type: r.type || null, // WORK | RECOVERY | ...
    secs: r.moving_time ?? r.elapsed_time ?? 0,
    km: r.distance != null ? r.distance / 1000 : null,
    watts: r.average_watts != null ? Math.round(r.average_watts) : null,
    hr: r.average_heartrate != null ? Math.round(r.average_heartrate) : null,
    speed: r.average_speed != null ? r.average_speed * 3.6 : null,
  }))
}

// ---- sharing ---------------------------------------------------------------
// Friends can't fetch each other's charts from intervals.icu: the activity
// belongs to its owner's account and only their API key can read it. So when
// you open one of your own rides, a compact copy of the chart data is stored
// on the session (session_streams, shared by the same rule as the session
// itself - see supabase/session_streams.sql). Friends then read that copy.
//
// The GPS track is deliberately NOT shared: a route sketch reveals where you
// live and ride, which is a bigger step than sharing pace and heart rate, and
// it is more than half the payload. Charts, zones and laps only.
//
// Zones are stored as they were computed for the owner, so a friend sees the
// owner's zone setup rather than their own preferences applied to a stranger's
// heart rate.
function sharePayload(analysis) {
  return {
    points: analysis.points,
    stats: analysis.stats,
    hrZones: analysis.hrZones,
    powerZones: analysis.powerZones,
    laps: analysis.laps,
  }
}

// Best-effort: a failed share must never break viewing your own activity.
async function storeSharedAnalysis(sessionId, analysis) {
  if (!sessionId || !analysis?.points) return
  try {
    await supabase
      .from('session_streams')
      .upsert({ session_id: sessionId, data: sharePayload(analysis) }, { onConflict: 'session_id' })
  } catch {
    // table missing (migration not run) or offline - charts still work for you
  }
}

// The shared copy of someone else's activity, or null when they haven't
// opened it since sharing existed (nothing to show, no error either).
export async function fetchSharedAnalysis(sessionId) {
  if (!sessionId) return null
  try {
    const { data, error } = await supabase
      .from('session_streams')
      .select('data')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (error || !data?.data) return null
    return { ...data.data, latlng: null, shared: true }
  } catch {
    return null
  }
}

// Fetch (or serve cached) analysis for one imported activity. Returns
//   { points, latlng, hrZones, powerZones, laps, hasStreams }
// Streams and the GPS track never change once an activity is done, so those
// stay cached forever. Zones and laps follow the athlete's *current*
// intervals.icu settings (switching 7→5 zones, a new max HR, edited laps),
// so that small record is re-fetched on every open and merged over the
// cache - falling back to the cached copy when offline.
// Pass the session's id to also keep the shared copy friends read up to date
// (once per app session - the payload only changes when zones do).
// Throws with .code = 'no-creds' when intervals.icu isn't connected and
// nothing is cached.
export async function fetchActivityAnalysis(intervalsId, { sessionId } = {}) {
  const id = String(intervalsId)
  const cacheKey = CACHE_PREFIX + id
  const share = (analysis) => {
    if (!sessionId || sharedThisSession.has(sessionId)) return
    sharedThisSession.add(sessionId)
    storeSharedAnalysis(sessionId, analysis) // fire and forget
  }

  let cached = memory.get(id)
  if (!cached) {
    try {
      cached = await idbGet(cacheKey)
    } catch {
      // idb unavailable (private mode) - just fetch
    }
    if (cached) memory.set(id, cached)
  }

  const settings = await getSettings()
  if (!hasCredentials(settings)) {
    if (cached) return cached
    const err = new Error('intervals.icu is not connected')
    err.code = 'no-creds'
    throw err
  }

  if (cached) {
    try {
      const activity = await apiGet(`/activity/${id}?intervals=true`, settings.apiKey)
      const fresh = {
        ...cached,
        hrZones: hrZones(activity),
        powerZones: powerZones(activity),
        laps: laps(activity),
      }
      memory.set(id, fresh)
      try {
        await idbSet(cacheKey, fresh)
      } catch {
        // best-effort cache
      }
      share(fresh)
      return fresh
    } catch {
      return cached // offline or API hiccup: stale zones beat no analysis
    }
  }

  const typesQ = `types=${STREAM_TYPES.join(',')}`
  const [activity, streamsFirst, mapData] = await Promise.all([
    apiGet(`/activity/${id}?intervals=true`, settings.apiKey),
    apiGet(`/activity/${id}/streams.json?${typesQ}`, settings.apiKey),
    // GPS track for the route sketch. Missing (indoor rides) is fine.
    apiGet(`/activity/${id}/map`, settings.apiKey).catch(() => null),
  ])
  // Some deployments are picky about the {ext} path suffix - retry bare.
  let streams = streamsFirst
  if (!Array.isArray(streams) || streams.length === 0) {
    streams = await apiGet(`/activity/${id}/streams?${typesQ}`, settings.apiKey).catch(() => null)
  }

  const byType = {}
  for (const s of Array.isArray(streams) ? streams : []) {
    if (s?.type && Array.isArray(s.data) && !s.allNull) byType[s.type] = s.data
  }
  const points = downsample(byType)

  const result = {
    points,
    // Keyed like points' series so the chart headers can look them up.
    stats: {
      alt: seriesStats(byType.altitude),
      speed: seriesStats(byType.velocity_smooth, 3.6),
      hr: seriesStats(byType.heartrate),
      watts: seriesStats(byType.watts),
      cad: seriesStats(byType.cadence),
    },
    latlng: thinLatlng(mapData?.latlngs) || thinLatlng(byType.latlng),
    hrZones: hrZones(activity),
    powerZones: powerZones(activity),
    laps: laps(activity),
    hasStreams: Boolean(points),
  }

  memory.set(id, result)
  try {
    await idbSet(cacheKey, result)
  } catch {
    // best-effort cache
  }
  share(result)
  return result
}
