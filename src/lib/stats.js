// Aggregations for the stats dashboards (Phase 2). Pure functions over the
// session list; charts just render what these return.
import {
  startOfWeek,
  addWeeks,
  startOfMonth,
  addMonths,
  subDays,
  format,
  differenceInCalendarDays,
} from 'date-fns'
import { asDate } from './format'
import { normalizeHang } from './formState'

const WEEK_OPTS = { weekStartsOn: 1 }
const num = (v) => Number(v) || 0

export const RANGES = [
  { key: '4w', label: '4W', days: 28, grain: 'week' },
  { key: '3m', label: '3M', days: 91, grain: 'week' },
  { key: '6m', label: '6M', days: 182, grain: 'month' },
  { key: '1y', label: '1Y', days: 365, grain: 'month' },
  { key: 'all', label: 'All', days: null, grain: 'month' },
]

export function rangeConfig(key) {
  return RANGES.find((r) => r.key === key) || RANGES[1]
}

export function windowStart(key, sessions) {
  const cfg = rangeConfig(key)
  if (cfg.days == null) {
    // earliest session date (sessions are newest-first)
    const earliest = sessions.length ? sessions[sessions.length - 1].date : null
    return earliest ? asDate(earliest) : subDays(new Date(), 30)
  }
  return subDays(new Date(), cfg.days)
}

export function inWindow(sessions, start) {
  return sessions.filter((s) => asDate(s.date) >= start)
}

// ---- time bucketing --------------------------------------------------------
export function buckets(sessions, start, grain) {
  const end = new Date()
  const out = []
  if (grain === 'month') {
    let m = startOfMonth(start)
    while (m <= end) {
      out.push({ start: new Date(m), label: format(m, 'MMM'), sessions: [] })
      m = addMonths(m, 1)
    }
    const first = out[0]?.start
    for (const s of sessions) {
      const d = asDate(s.date)
      const idx = (d.getFullYear() - first.getFullYear()) * 12 + (d.getMonth() - first.getMonth())
      if (idx >= 0 && idx < out.length) out[idx].sessions.push(s)
    }
  } else {
    const first = startOfWeek(start, WEEK_OPTS)
    let w = first
    while (w <= end) {
      out.push({ start: new Date(w), label: format(w, 'd/M'), sessions: [] })
      w = addWeeks(w, 1)
    }
    for (const s of sessions) {
      const idx = Math.floor(differenceInCalendarDays(asDate(s.date), first) / 7)
      if (idx >= 0 && idx < out.length) out[idx].sessions.push(s)
    }
  }
  return out
}

// ---- per-array aggregates --------------------------------------------------
export const sumHours = (arr) => arr.reduce((a, s) => a + num(s.duration), 0) / 60
export const sumMinutes = (arr) => arr.reduce((a, s) => a + num(s.duration), 0)
export const sumDistance = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.distance_km), 0)
export const sumDistanceM = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.distance_m), 0)
export const sumElevation = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.elevation_m), 0)
export const sumLoad = (arr) => arr.reduce((a, s) => a + num(s.extra?.training_load), 0)

export function avgFeeling(arr) {
  const vals = arr.map((s) => num(s.feeling)).filter(Boolean)
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export const bySport = (arr, sport) => arr.filter((s) => s.sport === sport)

// Minutes of strength work carved out of an indoor climb. The rest of the
// session's duration counts as climbing. (Clamped to the total.)
export function embeddedStrengthMinutes(s) {
  if (s.sport !== 'climbing') return 0
  return Math.min(num(s.duration), Math.max(0, num(s.extra?.strength_minutes)))
}

// Minutes of finger work carved out of an indoor climb, on top of any strength
// minutes. Clamped to whatever duration the strength block hasn't already used.
export function embeddedFingerMinutes(s) {
  if (s.sport !== 'climbing') return 0
  const remaining = Math.max(0, num(s.duration) - embeddedStrengthMinutes(s))
  return Math.min(remaining, Math.max(0, num(s.extra?.finger_minutes)))
}

// How a session's duration splits across sports. Usually a single entry; an
// indoor climb with strength/finger blocks splits into climbing + strength +
// finger. (sessionSports/sportHours drop the zero-minute parts.)
export function sportMinutes(s) {
  const total = num(s.duration)
  const strength = embeddedStrengthMinutes(s)
  const finger = embeddedFingerMinutes(s)
  if (strength > 0 || finger > 0) {
    return [
      { sport: 'climbing', minutes: total - strength - finger },
      { sport: 'strength', minutes: strength },
      { sport: 'finger', minutes: finger },
    ]
  }
  return [{ sport: s.sport, minutes: total }]
}

// Hours attributable to one sport across the array, honouring the split above.
export function sportHours(arr, sport) {
  let m = 0
  for (const s of arr) for (const p of sportMinutes(s)) if (p.sport === sport) m += p.minutes
  return m / 60
}

// Distinct sports a session represents — a climb with a strength block counts
// as both climbing and strength. Used for the calendar dots + week table.
export function sessionSports(s) {
  return sportMinutes(s)
    .filter((p) => p.minutes > 0)
    .map((p) => p.sport)
}

// ---- climbing breakdowns ---------------------------------------------------
export function disciplineSplit(climbing) {
  const m = { bouldering: 0, sport: 0, trad: 0 }
  for (const s of climbing) if (m[s.subtype] != null) m[s.subtype] += 1
  return m
}

export function locationSplit(climbing) {
  const m = { indoor: 0, outdoor: 0 }
  for (const s of climbing) if (s.location && m[s.location] != null) m[s.location] += 1
  return m
}

// Rank a French grade (route or boulder) so they order by difficulty across
// both scales — e.g. 5c < 6a < 6a+ < 6b.
function gradeRank(g) {
  const m = /^(\d+)\s*([abc])?\s*(\+)?$/i.exec(String(g).trim())
  if (!m) return 999
  const n = parseInt(m[1], 10)
  const letter = m[2] ? { a: 0, b: 1, c: 2 }[m[2].toLowerCase()] : -1
  return n * 10 + (letter + 1) * 2 + (m[3] ? 0.5 : 0)
}

// Grade pyramid built from the route log, ordered low→high.
export function gradePyramid(climbing) {
  const counts = {}
  for (const s of climbing) {
    for (const r of s.routes || []) {
      if (r.grade) counts[r.grade] = (counts[r.grade] || 0) + 1
    }
  }
  return Object.keys(counts)
    .sort((a, b) => gradeRank(a) - gradeRank(b))
    .map((grade) => ({ label: grade, value: counts[grade] }))
}

export function sendStats(climbing) {
  const m = { onsight: 0, flash: 0, redpoint: 0, attempt: 0 }
  for (const s of climbing) {
    for (const r of s.routes || []) if (m[r.send_type] != null) m[r.send_type] += 1
  }
  return m
}

// ---- general ---------------------------------------------------------------
export function currentStreak(sessions) {
  const days = new Set(sessions.map((s) => s.date))
  let streak = 0
  let d = new Date()
  while (days.has(format(d, 'yyyy-MM-dd'))) {
    streak += 1
    d = subDays(d, 1)
  }
  return streak
}

// Consecutive weeks (Mon-anchored) with at least one session, ending now. The
// current week is still "in progress": an empty current week doesn't break the
// streak — we count back from last week — but training this week extends it.
export function currentWeekStreak(sessions) {
  if (!sessions.length) return 0
  const weeks = new Set(
    sessions.map((s) => format(startOfWeek(asDate(s.date), WEEK_OPTS), 'yyyy-MM-dd')),
  )
  let w = startOfWeek(new Date(), WEEK_OPTS)
  if (!weeks.has(format(w, 'yyyy-MM-dd'))) w = addWeeks(w, -1)
  let streak = 0
  while (weeks.has(format(w, 'yyyy-MM-dd'))) {
    streak += 1
    w = addWeeks(w, -1)
  }
  return streak
}

export function restBalance(sessions, start) {
  const total = Math.max(1, differenceInCalendarDays(new Date(), start) + 1)
  const active = new Set(inWindow(sessions, start).map((s) => s.date)).size
  return { active, rest: Math.max(0, total - active), total }
}

export function longestRide(cycling) {
  return cycling.reduce((m, s) => Math.max(m, num(s.extra?.distance_km)), 0)
}

export function longestSwim(swimming) {
  return swimming.reduce((m, s) => Math.max(m, num(s.extra?.distance_m)), 0)
}

// ---- strength + finger -------------------------------------------------------
// Strength/finger data lives in extra and can ride on a standalone strength or
// finger session, an indoor climb, or (for legacy sessions) a combined strength
// session, so these scan extra rather than keying off sport.
const fmtShort = (d) => format(asDate(d), 'd/M')

function exerciseEntries(session, key) {
  return (session.extra?.strength || []).filter((ex) => ex.exercise === key)
}

export function hasFingerData(s) {
  const f = s.extra?.finger
  return Boolean(f && (f.campus || (f.hangboard || []).length > 0))
}

// Distinct exercise keys logged, in first-seen order.
export function exercisesLogged(sessions) {
  const seen = []
  for (const s of sessions)
    for (const ex of s.extra?.strength || [])
      if (ex.exercise && !seen.includes(ex.exercise)) seen.push(ex.exercise)
  return seen
}

// Total reps (Σ sets × reps) over all strength exercises in the array.
export function totalReps(arr) {
  let r = 0
  for (const s of arr) for (const ex of s.extra?.strength || []) r += num(ex.sets) * num(ex.reps)
  return r
}

// Sessions in the array that include logged lifts (the Strength tab).
export function liftSessionCount(arr) {
  return arr.filter((s) => (s.extra?.strength || []).length > 0).length
}

// Sessions in the array that include any finger work (the Finger tab).
export function fingerSessionCount(arr) {
  return arr.filter((s) => hasFingerData(s)).length
}

export function campusCount(sessions) {
  return sessions.filter((s) => s.extra?.finger?.campus).length
}

// Per-session series for one exercise, oldest→newest.
//   metric: 'weight' (heaviest kg) | 'reps' (best single set) | 'volume' (Σ sets×reps)
export function exerciseSeries(sessions, key, metric) {
  const rows = sessions
    .filter((s) => exerciseEntries(s, key).length > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  return rows.map((s) => {
    const entries = exerciseEntries(s, key)
    let value
    if (metric === 'reps') value = Math.max(0, ...entries.map((e) => num(e.reps)))
    else if (metric === 'volume') value = entries.reduce((a, e) => a + num(e.sets) * num(e.reps), 0)
    else value = Math.max(0, ...entries.map((e) => num(e.weight)))
    return { label: fmtShort(s.date), value: round1(value) }
  })
}

export function exerciseBest(sessions, key) {
  let maxWeight = 0
  let maxReps = 0
  let count = 0
  for (const s of sessions) {
    const entries = exerciseEntries(s, key)
    if (entries.length) count += 1
    for (const e of entries) {
      maxWeight = Math.max(maxWeight, num(e.weight))
      maxReps = Math.max(maxReps, num(e.reps))
    }
  }
  return { maxWeight, maxReps, sessions: count }
}

// Heaviest added weight across an exercise's sets (handles both data shapes).
function hangMaxWeight(h) {
  return Math.max(0, ...normalizeHang(h).sets.map((x) => num(x.weight)))
}

// Hangboard progression: heaviest two-hand added weight per session (oldest→newest).
export function hangboardSeries(sessions) {
  const isTwo = (h) => normalizeHang(h).hands === 'two'
  const rows = sessions
    .filter((s) => (s.extra?.finger?.hangboard || []).some(isTwo))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  return rows.map((s) => {
    const two = (s.extra.finger.hangboard || []).filter(isTwo)
    return { label: fmtShort(s.date), value: round1(Math.max(0, ...two.map(hangMaxWeight))) }
  })
}

export const round1 = (n) => Math.round(n * 10) / 10
