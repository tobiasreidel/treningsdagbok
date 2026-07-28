// Aggregations for the stats dashboards (Phase 2). Pure functions over the
// session list; charts just render what these return.
import {
  startOfWeek,
  addWeeks,
  startOfMonth,
  addMonths,
  addDays,
  subDays,
  format,
  differenceInCalendarDays,
} from 'date-fns'
import { asDate } from './format'
import { normaliseSession } from './sessionShape'
import { getBodyweight } from './prefs'
import { formatGrade } from './constants'

const WEEK_OPTS = { weekStartsOn: 1 }
const num = (v) => Number(v) || 0

// Ranges are defined by a whole number of periods (not raw days) so the chart
// comes out to exactly that many bars - e.g. 4W is 4 weekly bars, not 4-and-a-
// bit. 'all' spans from the first session.
export const RANGES = [
  { key: '4w', label: '4W', weeks: 4, grain: 'week' },
  { key: '3m', label: '3M', weeks: 13, grain: 'week' },
  { key: '6m', label: '6M', months: 6, grain: 'month' },
  { key: '1y', label: '1Y', months: 12, grain: 'month' },
  { key: 'all', label: 'All', grain: 'month' },
]

export function rangeConfig(key) {
  return RANGES.find((r) => r.key === key) || RANGES[1]
}

// Start of the window, aligned to a week/month boundary so buckets() yields
// exactly N periods with no stray partial one at the front.
export function windowStart(key, sessions) {
  const cfg = rangeConfig(key)
  const today = new Date()
  if (cfg.grain === 'week') {
    return addWeeks(startOfWeek(today, WEEK_OPTS), -(cfg.weeks - 1))
  }
  if (cfg.months) {
    return addMonths(startOfMonth(today), -(cfg.months - 1))
  }
  // 'all' - from the earliest session (sessions are newest-first).
  const earliest = sessions.length ? sessions[sessions.length - 1].date : null
  return earliest ? asDate(earliest) : subDays(today, 30)
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
export const sumDistance = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.distance_km), 0)
export const sumDistanceM = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.distance_m), 0)
export const sumElevation = (arr) =>
  arr.reduce((a, s) => a + num(s.extra?.elevation_m), 0)

export function avgFeeling(arr) {
  const vals = arr.map((s) => num(s.feeling)).filter(Boolean)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export const bySport = (arr, sport) => arr.filter((s) => s.sport === sport)

// Minutes of strength work carved out of another session (an indoor climb, or
// a finger session with a strength block). The rest of the duration stays with
// the session's own sport. (Clamped to the total.)
export function embeddedStrengthMinutes(s) {
  if (s.sport !== 'climbing' && s.sport !== 'finger') return 0
  return Math.min(num(s.duration), Math.max(0, num(s.extra?.strength_minutes)))
}

// Minutes of finger work carved out of another session (an indoor climb, or a
// strength session with a finger block), on top of any strength minutes.
// Clamped to whatever duration the strength block hasn't already used.
export function embeddedFingerMinutes(s) {
  if (s.sport !== 'climbing' && s.sport !== 'strength') return 0
  const remaining = Math.max(0, num(s.duration) - embeddedStrengthMinutes(s))
  return Math.min(remaining, Math.max(0, num(s.extra?.finger_minutes)))
}

// How a session's duration splits across sports. Usually a single entry; a
// session with embedded strength/finger blocks (indoor climb, or a combined
// strength+finger workout) splits accordingly. (sessionSports/sportHours drop
// the zero-minute parts.)
export function sportMinutes(s) {
  const total = num(s.duration)
  const strength = embeddedStrengthMinutes(s)
  const finger = embeddedFingerMinutes(s)
  if (strength > 0 || finger > 0) {
    return [
      { sport: s.sport, minutes: total - strength - finger },
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

// Distinct sports a session represents - a climb with a strength block counts
// as both climbing and strength. Used for the calendar dots + week table.
export function sessionSports(s) {
  return sportMinutes(s)
    .filter((p) => p.minutes > 0)
    .map((p) => p.sport)
}

// Is this session the indoor form of its sport? Trainer rides, gym climbs,
// treadmill runs and pool swims count as "indoor"; anything else (including
// unknown) as outdoor.
export function isIndoorSession(s) {
  if (s.sport === 'cycling') return Boolean(s.extra?.indoor)
  if (s.sport === 'climbing') return s.location === 'indoor'
  if (s.sport === 'running') return s.subtype === 'treadmill'
  if (s.sport === 'swimming') return s.subtype === 'pool'
  return false
}

// Hours for one sport split into its indoor/outdoor forms, honouring the
// embedded strength/finger split like sportHours does.
export function sportHoursSplit(arr, sport) {
  let indoor = 0
  let outdoor = 0
  for (const s of arr) {
    for (const p of sportMinutes(s)) {
      if (p.sport !== sport) continue
      if (isIndoorSession(s)) indoor += p.minutes
      else outdoor += p.minutes
    }
  }
  return { indoor: indoor / 60, outdoor: outdoor / 60 }
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
// both scales - e.g. 5c < 6a < 6a+ < 6b.
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
      if (r.grade) {
        const label = formatGrade(r.grade, s.subtype)
        counts[label] = (counts[label] || 0) + 1
      }
    }
  }
  return Object.keys(counts)
    .sort((a, b) => gradeRank(a) - gradeRank(b))
    .map((grade) => ({ label: grade, value: counts[grade] }))
}

export function sendStats(climbing) {
  const m = { onsight: 0, flash: 0, redpoint: 0, secondgo: 0, attempt: 0 }
  for (const s of climbing) {
    for (const r of s.routes || []) if (m[r.send_type] != null) m[r.send_type] += 1
  }
  return m
}

// ---- general ---------------------------------------------------------------
// Consecutive weeks (Mon-anchored) with at least one session, ending now. The
// current week is still "in progress": an empty current week doesn't break the
// streak - we count back from last week - but training this week extends it.
export function currentWeekStreak(sessions) {
  if (!sessions.length) return 0
  // Broken once you've gone more than 7 days without training, even if that gap
  // straddles two calendar weeks.
  const last = sessions.reduce((m, s) => {
    const d = asDate(s.date)
    return d > m ? d : m
  }, asDate(sessions[0].date))
  if (differenceInCalendarDays(new Date(), last) > 7) return 0
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

// Longest single-session distance (km) - used for both rides and runs.
export function longestDistanceKm(arr) {
  return arr.reduce((m, s) => Math.max(m, num(s.extra?.distance_km)), 0)
}

export function longestSwim(swimming) {
  return swimming.reduce((m, s) => Math.max(m, num(s.extra?.distance_m)), 0)
}

// Biggest single value of one extra.* field (records tiles).
export function maxExtra(arr, key) {
  return arr.reduce((m, s) => Math.max(m, num(s.extra?.[key])), 0)
}

// ---- training load + fitness/form (intervals.icu-style) --------------------
// Load for one session: the stored intervals.icu training load when present,
// otherwise an RPE-derived estimate on the same scale (1 h at RPE 10 ≈ 100,
// i.e. IF ≈ rpe/10). Sessions with neither contribute nothing.
//
// NOTE: this is a TSS-analogue heuristic, NOT Foster's session-RPE. Foster's is
// linear (RPE × minutes); this squares the intensity term so the number is
// commensurable with imported TSS. The side effect is that easy sessions count
// for very little - an hour at RPE 4 is 16% of an hour at RPE 10 - so volume
// days build less chronic load here than they do in Foster's units, which
// inflates any ratio measured against that baseline.
export function sessionLoad(s) {
  const stored = num(s.extra?.training_load)
  if (stored > 0) return stored
  const mins = num(s.duration)
  const rpe = num(s.rpe)
  if (mins > 0 && rpe > 0) return (mins / 60) * (rpe / 10) ** 2 * 100
  return 0
}

export const sumLoadEst = (arr) => arr.reduce((a, s) => a + sessionLoad(s), 0)

// Total load per ISO day.
export function dailyLoads(sessions) {
  const m = new Map()
  for (const s of sessions) {
    const l = sessionLoad(s)
    if (l > 0) m.set(s.date, (m.get(s.date) || 0) + l)
  }
  return m
}

// Fitness (CTL, 42-day EW avg), Fatigue (ATL, 7-day) and Form (CTL − ATL),
// one point per day from `start` through today, computed from a per-day load
// map. The rolling averages are seeded from all available history before the
// window (capped) so the lines don't ramp up from zero at the left edge.
export function fitnessFromLoads(loads, start) {
  const get = (iso) => (loads instanceof Map ? loads.get(iso) : loads[iso]) || 0
  const keys = loads instanceof Map ? [...loads.keys()] : Object.keys(loads)
  if (!keys.length) return []
  // Seed from the earliest recorded load (or 90 days out, whichever is
  // older), capped so a stray ancient date can't run the loop away.
  const earliest = keys.reduce((m, k) => (k < m ? k : m), keys[0])
  let d = subDays(start, 90)
  const earliestDate = asDate(earliest)
  if (earliestDate < d) d = earliestDate
  const cap = asDate(format(subDays(start, 500), 'yyyy-MM-dd'))
  if (d < cap) d = cap
  const today = new Date()
  let ctl = 0
  let atl = 0
  const out = []
  // Hard cap the loop (seed + a few years of window) as a safety net.
  for (let i = 0; i < 2000 && d <= today; i += 1) {
    const load = get(format(d, 'yyyy-MM-dd'))
    ctl += (load - ctl) / 42
    atl += (load - atl) / 7
    if (d >= start) {
      out.push({
        date: format(d, 'yyyy-MM-dd'),
        label: format(d, 'd/M'),
        ctl: round1(ctl),
        atl: round1(atl),
        form: round1(ctl - atl),
      })
    }
    d = addDays(d, 1)
  }
  return out
}

export function fitnessSeries(sessions, start) {
  return fitnessFromLoads(dailyLoads(sessions), start)
}

// intervals.icu's own daily fitness/fatigue rows mapped into the same series
// shape - used as-is so the numbers match intervals.icu exactly.
export function wellnessSeries(rows, start) {
  const first = format(start, 'yyyy-MM-dd')
  return (rows || [])
    .filter((r) => r.date >= first)
    .map((r) => ({
      date: r.date,
      label: format(asDate(r.date), 'd/M'),
      ctl: round1(r.ctl),
      atl: round1(r.atl),
      form: round1(r.ctl - r.atl),
    }))
}

// Reading of a day's form (TSB), using intervals.icu's zones and vocabulary.
export const FORM_ZONES = [
  { min: 20, label: 'Transition', color: 'var(--cycling)' }, // detraining risk
  { min: 5, label: 'Fresh', color: 'var(--swimming)' },
  { min: -10, label: 'Grey zone', color: 'var(--text-muted)' },
  { min: -30, label: 'Optimal training', color: 'var(--both)' },
  { min: -Infinity, label: 'High risk', color: 'var(--danger)' },
]

export function formStatus(form) {
  return FORM_ZONES.find((z) => form >= z.min)
}

// Eddington number: the largest E where you've done E rides of at least E km.
export function eddington(cycling) {
  const dists = cycling
    .map((s) => num(s.extra?.distance_km))
    .filter((d) => d > 0)
    .sort((a, b) => b - a)
  let e = 0
  for (let i = 0; i < dists.length; i += 1) {
    if (dists[i] >= i + 1) e = i + 1
    else break
  }
  return e
}

// Fastest average pace (decimal min/km) across runs of at least `minKm`.
export function bestRunPace(running, minKm = 2) {
  let best = null
  for (const s of running) {
    const d = num(s.extra?.distance_km)
    const mins = num(s.duration)
    if (d >= minKm && mins > 0) {
      const p = mins / d
      if (best == null || p < best) best = p
    }
  }
  return best
}

// Fastest average pace (decimal min/100m) across swims of at least `minM`.
export function bestSwimPace(swimming, minM = 200) {
  let best = null
  for (const s of swimming) {
    const d = num(s.extra?.distance_m)
    const mins = num(s.duration)
    if (d >= minM && mins > 0) {
      const p = mins / (d / 100)
      if (best == null || p < best) best = p
    }
  }
  return best
}

// Decimal minutes -> "m:ss" (pace labels).
export function fmtPaceMin(p) {
  if (p == null || !Number.isFinite(p) || p <= 0) return '–'
  const m = Math.floor(p)
  const s = Math.round((p - m) * 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

// Per-bucket average of an extra.* field over one sport's sessions (null when
// a bucket has no data - the Line chart leaves a gap).
export function bucketAvgExtra(buckets, sport, key) {
  return buckets.map((b) => {
    const rows = bySport(b.sessions, sport).filter((s) => num(s.extra?.[key]) > 0)
    const avg = rows.length ? rows.reduce((a, s) => a + num(s.extra[key]), 0) / rows.length : null
    return { label: b.label, value: avg != null ? round1(avg) : null }
  })
}

// Per-bucket average pace: running -> min/km, swimming -> min/100m. Uses each
// bucket's total distance and time so short jogs don't skew it.
export function bucketAvgPace(buckets, sport) {
  return buckets.map((b) => {
    const rows = bySport(b.sessions, sport).filter(
      (s) => num(s.duration) > 0 && num(sport === 'swimming' ? s.extra?.distance_m : s.extra?.distance_km) > 0,
    )
    if (!rows.length) return { label: b.label, value: null }
    const mins = rows.reduce((a, s) => a + num(s.duration), 0)
    const dist =
      sport === 'swimming'
        ? rows.reduce((a, s) => a + num(s.extra.distance_m), 0) / 100
        : rows.reduce((a, s) => a + num(s.extra.distance_km), 0)
    return { label: b.label, value: dist > 0 ? round1(mins / dist) : null }
  })
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
  return normaliseSession(s).hasFingerWork
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

// Campus board only. `campus` is an enum whose 'spray' member is also truthy,
// so a plain truthiness test counted spray-wall sessions as campus sessions.
export function campusCount(sessions) {
  return sessions.filter((s) => normaliseSession(s).campus === 'board').length
}

export function sprayCount(sessions) {
  return sessions.filter((s) => normaliseSession(s).campus === 'spray').length
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

// Hangboard progression: heaviest two-hand TOTAL load per session, oldest to
// newest. Nulls for sessions whose sets cannot be read without a bodyweight, so
// they show as a gap instead of a zero.
//
// This read `set.weight`, which v4 rows never write, so the chart and the "best
// hang" tile silently showed 0 kg for every session logged after the total-load
// migration. It is also the reason the card said "kg added": both were left
// behind by the migration.
export function hangboardSeries(sessions, bodyweight = getBodyweight()) {
  const shaped = sessions.map((s) => ({ s, n: normaliseSession(s, { bodyweight }) }))
  const rows = shaped
    .filter(({ n }) => n.hangboard.some((h) => h.hands === 'two'))
    .sort((a, b) => a.s.date.localeCompare(b.s.date))
  return rows.map(({ s, n }) => {
    const kgs = n.hangboard
      .filter((h) => h.hands === 'two')
      .flatMap((h) => h.sets.map((x) => x.kg))
      .filter((kg) => kg != null && kg > 0)
    return { label: fmtShort(s.date), value: kgs.length ? round1(Math.max(...kgs)) : null }
  })
}

// Where the load series changes definition. `sessionLoad` prefers imported TSS
// and estimates from duration and RPE otherwise, and the two are only roughly
// on the same scale. Connecting or disconnecting intervals.icu therefore
// redefines every affected session, and CTL takes 42 days to forget it, so form
// (a fifth of readiness) drifts for six weeks with no explanation. Cheaper and
// more honest to say the window is mixed than to pretend it is one unit.
export function loadUnitMix(sessions) {
  let imported = 0
  let estimated = 0
  for (const s of sessions) {
    if (num(s.extra?.training_load) > 0) imported += 1
    else if (sessionLoad(s) > 0) estimated += 1
  }
  return { imported, estimated, mixed: imported > 0 && estimated > 0 }
}

// Null-passing so "no data" stays a chart gap instead of becoming a 0.
export const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)
