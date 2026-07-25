// Training-coach signals (Settings → Training coach). Pure, client-side reads
// over logged data. It is an *awareness* tool, deliberately not a predictor: it
// never outputs an injury probability, because individual-level injury
// prediction is not achievable and a number would imply otherwise.
//
// Three rules the whole file obeys:
//   1. Every ratio compares disjoint windows. Comparing a window against one
//      that contains it is self-correlation, not information.
//   2. Every derived signal is gated until its baseline is real. "Not enough
//      data yet" beats a confident number computed from noise.
//   3. Absence of information is not information of absence. No profile means
//      no filtering; no history means "unknown", not "fresh".
import { differenceInCalendarDays, format, subDays, startOfWeek } from 'date-fns'
import { asDate, todayISO } from './format'
import { BOULDER_GRADES, ROUTE_GRADES, formatGrade } from './constants'
import { normalizeHang } from './formState'
import { fitnessSeries, sessionLoad } from './stats'
import { EXERCISE_MAP, availableExercises } from './exercises'
import { primaryGoal, daysUntil } from './coachProfile'
import { activeProblems } from './wellness'

const num = (v) => Number(v) || 0
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)

function stdev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length)
}

const MAX_GRADE_LOOKBACK_DAYS = 120

// A finger-strength test goes stale. Prescribing "80-90% of your max" off a
// number from last winter is prescribing a number nobody knows.
export const HANG_TEST_WARN_WEEKS = 8
export const HANG_TEST_STALE_WEEKS = 16

export function hangTestAge(profile) {
  if (!profile?.hang_tested_on) return { known: false }
  const days = differenceInCalendarDays(new Date(), asDate(profile.hang_tested_on))
  const weeks = Math.floor(days / 7)
  return {
    known: true,
    weeks,
    warn: weeks >= HANG_TEST_WARN_WEEKS,
    stale: weeks >= HANG_TEST_STALE_WEEKS,
  }
}

// Is the tested max usable as a reference right now?
function usableHangMax(profile) {
  const kg = num(profile?.hang_max_kg)
  if (!(kg > 0)) return null
  const age = hangTestAge(profile)
  // An untimed test is taken at face value; a clearly stale one is not.
  if (age.known && age.stale) return null
  return kg
}

// ---------------------------------------------------------------------------
// grades
// ---------------------------------------------------------------------------

export function gradeIndex(grade, subtype) {
  if (!grade) return -1
  const arr = subtype === 'bouldering' ? BOULDER_GRADES : ROUTE_GRADES
  return arr.indexOf(formatGrade(grade, subtype))
}

export function currentLimit(sessions, subtype, stated, location) {
  const today = new Date()
  let best = stated ? gradeIndex(stated, subtype) : -1
  for (const s of sessions) {
    if (s.sport !== 'climbing' || s.subtype !== subtype) continue
    // Indoor and outdoor grades are different scales in practice, so a limit
    // for one context is never inferred from sessions in the other.
    if (location && s.location !== location) continue
    if (differenceInCalendarDays(today, asDate(s.date)) > MAX_GRADE_LOOKBACK_DAYS) continue
    for (const r of s.routes || []) {
      const i = gradeIndex(r.grade, subtype)
      if (i > best) best = i
    }
  }
  if (best < 0) return null
  const arr = subtype === 'bouldering' ? BOULDER_GRADES : ROUTE_GRADES
  return { idx: best, grade: arr[best], subtype }
}

function statedLimit(grade, subtype) {
  const idx = grade ? gradeIndex(grade, subtype) : -1
  return idx >= 0 ? { idx, grade: formatGrade(grade, subtype), subtype } : null
}

export function buildLimits(sessions, profile) {
  const boulder = {
    outdoor: currentLimit(sessions, 'bouldering', profile?.max_boulder_outdoor, 'outdoor'),
    indoor: currentLimit(sessions, 'bouldering', profile?.max_boulder_indoor, 'indoor'),
    board: statedLimit(profile?.max_boulder_board, 'bouldering'),
  }
  const route = {
    outdoor:
      currentLimit(sessions, 'sport', profile?.max_route_outdoor, 'outdoor') ||
      currentLimit(sessions, 'trad', profile?.max_route_outdoor, 'outdoor'),
    indoor: currentLimit(sessions, 'sport', profile?.max_route_indoor, 'indoor'),
    board: null,
  }
  const pick = (c, fallbackStated, subtype) =>
    c.outdoor || c.indoor || c.board || statedLimit(fallbackStated, subtype)
  return {
    boulder: pick(boulder, profile?.max_boulder, 'bouldering'),
    route: pick(route, profile?.max_route, 'sport'),
    ctx: { boulder, route },
    boardType: profile?.board_type || null,
  }
}

function limitFor(limits, subtype, location) {
  const byCtx = subtype === 'bouldering' ? limits.ctx?.boulder : limits.ctx?.route
  const ctx = location === 'outdoor' ? 'outdoor' : 'indoor'
  return byCtx?.[ctx] || (subtype === 'bouldering' ? limits.boulder : limits.route) || null
}

// A grade `offset` steps from the limit. Clamped to the scale, and flagged when
// it hits the floor - "3" is not a meaningful prescription for a 6A climber, so
// the caller renders words instead of a grade.
export function gradeAt(limit, offset) {
  if (!limit) return null
  const arr = limit.subtype === 'bouldering' ? BOULDER_GRADES : ROUTE_GRADES
  const raw = limit.idx + offset
  const idx = clamp(raw, 0, arr.length - 1)
  return { grade: arr[idx], clamped: raw !== idx }
}

// ---------------------------------------------------------------------------
// finger dose
// ---------------------------------------------------------------------------
// The old model asked a yes/no question - "was this a max finger session?" -
// which threw away dose entirely: one token limit attempt scored the same as
// forty near-limit attempts. Everything below computes a continuous dose from
// the attempts and hangboard sets that are already logged, then buckets it into
// a tier that decides how long the tissue needs.

export const FINGER_TIERS = {
  maximal: { key: 'maximal', label: 'Maximal', recoveryDays: 3 },
  hard: { key: 'hard', label: 'Hard', recoveryDays: 2 },
  light: { key: 'light', label: 'Light', recoveryDays: 1 },
  none: { key: 'none', label: 'None', recoveryDays: 0 },
}

const TIER_ORDER = ['none', 'light', 'hard', 'maximal']
const higherTier = (a, b) => (TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b)

// Dose thresholds. Arbitrary units, calibrated so that a 4×10 s max-hang
// session and a session with several near-limit attempts both land in
// 'maximal'. Heuristic, and meant to be tuned.
const DOSE_MAXIMAL = 40
const DOSE_HARD = 15

function hangIntensity(set, profile) {
  const added = num(set.weight)
  const maxKg = usableHangMax(profile)
  if (maxKg) return clamp(added / maxKg, 0, 1.3)
  // No usable tested max: fall back to the edge as a coarse proxy rather than
  // treating "any added weight at all" as maximal, which +2 kg on 20 mm is not.
  const edge = num(set.edge)
  if (edge > 0 && edge <= 10) return 0.85
  if (edge > 0 && edge <= 13) return 0.7
  return added > 0 ? 0.6 : 0.45
}

// Everything a single session did to the fingers: a continuous dose plus the
// tier that dose (and any absolute trigger) puts it in.
export function fingerDose(s, limits, profile) {
  const f = s.extra?.finger
  let dose = 0
  let tier = 'none'
  const why = []

  // --- hangboard -----------------------------------------------------------
  for (const h of f?.hangboard || []) {
    const nh = normalizeHang(h)
    const reps = Math.max(1, num(nh.reps))
    for (const set of nh.sets) {
      const t = num(set.time) || 7
      const rel = hangIntensity(set, profile)
      dose += rel ** 2 * t * reps * 0.35
      if (nh.hands === 'one') {
        tier = higherTier(tier, 'maximal')
      } else if (rel >= 0.8) {
        tier = higherTier(tier, 'maximal')
      } else if (rel >= 0.55) {
        tier = higherTier(tier, 'hard')
      } else {
        tier = higherTier(tier, 'light')
      }
    }
  }
  if (f?.hangboard?.length) why.push('hangboard')

  // --- campus / pockets ----------------------------------------------------
  if (f?.campus === 'board' || f?.campus === true) {
    dose += 25
    tier = higherTier(tier, 'maximal')
    why.push('campus')
  } else if (f?.campus === 'spray') {
    dose += 15
    tier = higherTier(tier, 'hard')
    why.push('spray wall')
  }
  // Two-finger and pocket work carries pulley and lumbrical risk out of
  // proportion to how hard it feels.
  if (f?.pockets) {
    dose += 12
    tier = higherTier(tier, 'hard')
    why.push('pockets / two-finger')
  }

  // --- climbing attempts near the limit ------------------------------------
  if (s.sport === 'climbing') {
    const limit = limitFor(limits, s.subtype, s.location)
    let nearLimitAttempts = 0
    for (const r of s.routes || []) {
      const i = gradeIndex(r.grade, s.subtype)
      if (i < 0 || !limit || limit.idx < 0) continue
      const gap = limit.idx - i
      const attempts = Math.max(1, num(r.attempts))
      const w = gap <= 0 ? 4 : gap === 1 ? 2.5 : gap === 2 ? 1.2 : 0.3
      dose += w * attempts
      if (gap <= 1) nearLimitAttempts += attempts
    }
    if (nearLimitAttempts >= 3) {
      tier = higherTier(tier, 'maximal')
      why.push(`${nearLimitAttempts} near-limit attempts`)
    } else if (nearLimitAttempts >= 1) {
      tier = higherTier(tier, 'hard')
      why.push(`${nearLimitAttempts} near-limit attempt${nearLimitAttempts === 1 ? '' : 's'}`)
    }
  }

  // --- self-reported finger intensity --------------------------------------
  // A global read on the session. Taken as an alternative estimate of the same
  // thing rather than added on top, so it can't double-count the itemised dose.
  const rf = num(s.extra?.rpe_finger)
  if (rf > 0) {
    const mins = clamp(num(s.duration), 0, 180)
    dose = Math.max(dose, (rf / 10) ** 2 * (mins / 60) * 45)
    if (rf >= 8) {
      tier = higherTier(tier, 'maximal')
      why.push(`finger RPE ${rf}`)
    } else if (rf >= 6) {
      tier = higherTier(tier, 'hard')
      why.push(`finger RPE ${rf}`)
    } else if (rf >= 3) {
      tier = higherTier(tier, 'light')
    }
  }

  // Hard bouldering, but only when the fingers were actually the limiting
  // factor. Whole-body RPE alone would let a two-hour pumpy jug circuit block
  // finger work for three days.
  if (s.sport === 'climbing' && s.subtype === 'bouldering' && num(s.rpe) >= 8 && rf >= 6) {
    tier = higherTier(tier, 'maximal')
  }
  // Any climbing at all is at least light finger contact.
  if ((s.sport === 'climbing' || s.sport === 'finger') && tier === 'none') {
    tier = 'light'
    dose = Math.max(dose, 4)
  }

  // Dose can raise a tier the triggers missed (lots of sub-limit volume adds up).
  if (dose >= DOSE_MAXIMAL) tier = higherTier(tier, 'maximal')
  else if (dose >= DOSE_HARD) tier = higherTier(tier, 'hard')

  return { dose: Math.round(dose), tier, why }
}

// ---------------------------------------------------------------------------
// finger recovery
// ---------------------------------------------------------------------------
// Crimping strains pulleys and finger tendons, and collagen turns over across
// days: net loss over roughly the first 24-36 h, net synthesis at ~36-72 h.
// Pump is metabolic and clears in hours and is deliberately not consulted here.
//
// Caveat carried into the UI: days are counted as calendar days because that is
// all the session row stores. A Monday-evening session to Wednesday morning is
// 34 hours but counts as two days.

const RECOVERY_STATES = {
  unknown: {
    key: 'unknown', tone: 'ok', label: 'Not known yet',
    hint: 'No finger training logged yet, so there is nothing to judge recovery against. Starting easy is the safe assumption, not starting hard.',
  },
  fresh: {
    key: 'fresh', tone: 'good', label: 'Fresh',
    hint: 'No hard finger loading logged recently.',
  },
  loaded: {
    key: 'loaded', tone: 'warn', label: 'Loaded today',
    hint: 'Fingers loaded today. Connective tissue nets a loss for the first ~24–36 h before it rebuilds.',
  },
  recovering: {
    key: 'recovering', tone: 'warn', label: 'Recovering',
    hint: 'Still inside the rebuild window for the last session. Tendon and pulley tissue adapts slower than muscle does.',
  },
  ready: {
    key: 'ready', tone: 'good', label: 'Recovered',
    hint: 'Past the rebuild window for your last finger session.',
  },
}

// Distinct days in a window with at least the given tier, using a *disjoint*
// offset so acute and chronic windows never overlap.
function fingerDayStats(sessions, limits, profile, days, offset = 0) {
  const today = new Date()
  const dayTier = new Map()
  let dose = 0
  for (const s of sessions) {
    const ago = differenceInCalendarDays(today, asDate(s.date))
    if (ago < offset || ago >= days + offset) continue
    const d = fingerDose(s, limits, profile)
    if (d.tier === 'none') continue
    dose += d.dose
    const prev = dayTier.get(s.date) || 'none'
    dayTier.set(s.date, higherTier(prev, d.tier))
  }
  let hardDays = 0
  for (const t of dayTier.values()) if (t === 'maximal' || t === 'hard') hardDays += 1
  return { hardDays, dose, activeDays: dayTier.size }
}

export function fingerRecovery(sessions, limits, profile) {
  const today = todayISO()
  let last = null
  let everLoaded = false
  for (const s of sessions) {
    if (s.date > today) continue
    const d = fingerDose(s, limits, profile)
    if (d.tier === 'none') continue
    everLoaded = true
    if (d.tier === 'light') continue
    if (!last || s.date > last.date) last = { date: s.date, ...d }
  }

  // Acute vs chronic finger exposure, on disjoint windows: this week against
  // the four weeks *before* it.
  const acute = fingerDayStats(sessions, limits, profile, 7, 0)
  const chronic = fingerDayStats(sessions, limits, profile, 28, 7)
  const chronicWeekly = chronic.hardDays / 4
  const rampFlag = acute.hardDays >= 2 && acute.hardDays > 1.5 * chronicWeekly

  // Absolute ceiling, not just a ramp. Two hard finger days every week forever
  // never trips a ramp flag - the baseline is equally high - and that is a
  // plausible route to tendinopathy that a relative measure cannot see.
  const load28 = fingerDayStats(sessions, limits, profile, 28, 0)
  const load56 = fingerDayStats(sessions, limits, profile, 56, 0)
  let chronicLevel = 'ok'
  if (load28.hardDays >= 12) chronicLevel = 'very-high'
  else if (load28.hardDays >= 9) {
    chronicLevel = load56.hardDays >= 18 ? 'very-high' : 'high'
  }

  // Rate alone misses the real pattern. Two hard finger days every single week
  // is a defensible rate - and doing it for twenty weeks without a lighter week
  // is not. A relative ramp can never see this (the baseline is equally high)
  // and a 28-day count sits just under any sane threshold, so count the
  // unbroken run of weeks instead.
  let sustainedWeeks = 0
  for (let w = 0; w < 26; w += 1) {
    const wk = fingerDayStats(sessions, limits, profile, 7, w * 7)
    if (wk.hardDays >= 2) sustainedWeeks += 1
    else break
  }

  const base = {
    days7: acute.hardDays,
    days28: load28.hardDays,
    dose28: load28.dose,
    rampFlag,
    chronicLevel,
    sustainedWeeks,
    everLoaded,
  }

  if (!everLoaded) {
    return { ...RECOVERY_STATES.unknown, daysSinceMax: null, required: null, lastTier: null, ...base }
  }
  if (!last) {
    return { ...RECOVERY_STATES.fresh, daysSinceMax: null, required: null, lastTier: null, ...base }
  }

  const daysSinceMax = differenceInCalendarDays(asDate(today), asDate(last.date))
  const required = FINGER_TIERS[last.tier].recoveryDays
  let state
  if (daysSinceMax >= required + 14) state = RECOVERY_STATES.fresh
  else if (daysSinceMax <= 0) state = RECOVERY_STATES.loaded
  else if (daysSinceMax < required) state = RECOVERY_STATES.recovering
  else state = RECOVERY_STATES.ready

  const tierWord = FINGER_TIERS[last.tier].label.toLowerCase()
  const hint =
    state.key === 'recovering' || state.key === 'loaded'
      ? `${state.hint} That session was ${tierWord} on the fingers, so it wants about ${required * 24} h.`
      : state.hint

  return {
    ...state,
    hint,
    daysSinceMax,
    required,
    lastTier: last.tier,
    lastDose: last.dose,
    lastWhy: last.why,
    ...base,
  }
}

// ---------------------------------------------------------------------------
// whole-body load
// ---------------------------------------------------------------------------

function dailyLoadWindow(sessions, days, offset = 0) {
  const map = new Map()
  for (const s of sessions) {
    const l = sessionLoad(s)
    if (l > 0) map.set(s.date, (map.get(s.date) || 0) + l)
  }
  const out = []
  for (let i = days - 1 + offset; i >= offset; i -= 1) {
    const iso = format(subDays(new Date(), i), 'yyyy-MM-dd')
    out.push({ date: iso, load: map.get(iso) || 0 })
  }
  return out
}

const TREND_LEVELS = [
  {
    min: 1.5, key: 'sharp', tone: 'warn', label: 'Well above your normal',
    hint: 'A big jump on what you have been doing. Not a verdict — just worth easing in rather than stacking another big week.',
  },
  {
    min: 1.3, key: 'up', tone: 'ok', label: 'Above your normal',
    hint: 'Training a fair bit more than usual. Fine if it is deliberate.',
  },
  {
    min: 0.8, key: 'steady', tone: 'good', label: 'Steady',
    hint: 'This week is in line with the four weeks before it.',
  },
  {
    min: -Infinity, key: 'easing', tone: 'ok', label: 'Below your normal',
    hint: 'Lighter than usual — a deload, a break, or life getting in the way.',
  },
]

// A baseline has to exist before a ratio against it means anything.
const MIN_CHRONIC_ACTIVE_DAYS = 8
const MIN_CHRONIC_DAILY_LOAD = 15

// This week's training against the four weeks before it. Both sides are plain
// arithmetic means over *disjoint* windows.
//
// Deliberately not called an acute:chronic workload ratio, and no "danger
// zone": the framework that name comes from has not held up, and the arithmetic
// is more honest described as what it is - this week versus your recent normal.
export function loadTrend(sessions) {
  const acuteDays = dailyLoadWindow(sessions, 7, 0)
  const chronicDays = dailyLoadWindow(sessions, 28, 7)
  const chronic = mean(chronicDays.map((d) => d.load))
  const activeDays = chronicDays.filter((d) => d.load > 0).length
  if (chronic < MIN_CHRONIC_DAILY_LOAD || activeDays < MIN_CHRONIC_ACTIVE_DAYS) {
    return { enough: false, reason: 'baseline' }
  }
  const acute = mean(acuteDays.map((d) => d.load))
  const ratio = acute / chronic
  const pct = Math.round(ratio * 100)
  const level = TREND_LEVELS.find((l) => ratio >= l.min)
  return {
    enough: true,
    acute,
    chronic,
    ratio,
    pct,
    pctLabel: pct > 300 ? '300%+' : `${pct}%`,
    ...level,
  }
}

// Foster's monotony (mean daily load / SD over 7 days) and strain.
export function monotonyStrain(sessions) {
  const days = dailyLoadWindow(sessions, 7, 0)
  const loads = days.map((d) => d.load)
  const weeklyLoad = loads.reduce((a, b) => a + b, 0)
  if (weeklyLoad <= 0 || loads.filter((l) => l > 0).length < 3) {
    return { enough: false, reason: 'sparse' }
  }
  const m = mean(loads)
  const sd = stdev(loads)
  const monotony = sd > 0 ? m / sd : null
  return {
    enough: true,
    weeklyLoad,
    monotony,
    strain: monotony != null ? weeklyLoad * monotony : null,
    flag: monotony == null || monotony > 2,
  }
}

// ---------------------------------------------------------------------------
// readiness
// ---------------------------------------------------------------------------

const BASELINE_DAYS = 60
const MIN_BASELINE_DAYS = 21
const MIN_RECENT_WELLNESS = 4 // entries needed in the last 7 days

// z of this week against a baseline that EXCLUDES it.
//
// Two things this has to get right, and both are easy to get wrong:
//
//   * The windows must be disjoint. Scoring the last 7 days against a 60-day
//     baseline that contains them is comparing a window with itself.
//   * The yardstick must be like-for-like. The recent value is a 7-day mean, so
//     the spread it is judged against has to be the spread of 7-day means, not
//     of single days - a weekly average varies far less than one day does, and
//     using the daily SD inflates every z-score several-fold. (Smoothing the
//     baseline instead makes this worse, not better: it shrinks the SD.)
function rollingMeans(sorted, window) {
  const out = []
  for (let i = window - 1; i < sorted.length; i += 1) {
    out.push(mean(sorted.slice(i - window + 1, i + 1).map((p) => p.value)))
  }
  return out
}

function signalZ(points, recentDays = 7, minRecent = 1) {
  if (points.length < 8) return null
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const cut = format(subDays(new Date(), recentDays - 1), 'yyyy-MM-dd')
  const recent = sorted.filter((p) => p.date >= cut)
  const baseline = sorted.filter((p) => p.date < cut)
  if (recent.length < minRecent || baseline.length < 14) return null

  const window = Math.min(recentDays, baseline.length)
  const baseMeans = rollingMeans(baseline, window)
  if (baseMeans.length < 4) return null
  const sd = stdev(baseMeans)
  if (!(sd > 0)) return null
  const z = (mean(recent.map((p) => p.value)) - mean(baseMeans)) / sd
  // Guard against a degenerate baseline (a run of near-identical weeks) turning
  // a normal week into a z of 12.
  return clamp(z, -3, 3)
}

const WELLNESS_SIGNALS = [
  { key: 'sleep', label: 'Sleep', weight: 0.125, invert: false },
  { key: 'fatigue', label: 'Fatigue', weight: 0.125, invert: true },
  { key: 'soreness', label: 'Soreness', weight: 0.125, invert: true },
  { key: 'stress', label: 'Stress', weight: 0.125, invert: true },
]

// Readiness against your own normal, 0-100 (50 = normal).
//
// The subjective items come from daily check-ins rather than from session rows.
// Wellness sampled only on training days is selected in the flattering
// direction - people skip sessions when they feel wrecked - so a session-based
// score is blindest exactly when it should be loudest.
export function readiness(sessions, wellnessRows, icuWellness) {
  const today = new Date()
  let earliest = null
  for (const s of sessions) if (!earliest || s.date < earliest) earliest = s.date
  const historyDays = earliest ? differenceInCalendarDays(today, asDate(earliest)) : 0
  if (historyDays < MIN_BASELINE_DAYS) {
    return { enough: false, reason: 'history', historyDays, needDays: MIN_BASELINE_DAYS }
  }

  const rows = (wellnessRows || []).filter(
    (r) => differenceInCalendarDays(today, asDate(r.date)) < BASELINE_DAYS,
  )
  const wellPoints = (key) =>
    rows.filter((r) => r[key] != null).map((r) => ({ date: r.date, value: Number(r[key]) }))

  const icu = (icuWellness || []).filter(
    (r) => differenceInCalendarDays(today, asDate(r.date)) < BASELINE_DAYS,
  )
  const icuPoints = (key) =>
    icu.filter((r) => r[key] != null).map((r) => ({ date: r.date, value: Number(r[key]) }))

  // Form from the app's own unified load series, which includes climbing.
  // intervals.icu's TSB only knows about what is pushed to it, so it can read
  // "fresh" straight through a heavy climbing block.
  const formSeries = fitnessSeries(sessions, subDays(today, BASELINE_DAYS + 7))
  const formPoints = formSeries.map((p) => ({ date: p.date, value: p.form }))

  const signals = [
    ...WELLNESS_SIGNALS.map((s) => ({
      ...s,
      z: signalZ(wellPoints(s.key), 7, MIN_RECENT_WELLNESS),
    })),
    { key: 'hrv', label: 'HRV', weight: 0.2, invert: false, z: signalZ(icuPoints('hrv')) },
    { key: 'rhr', label: 'Resting HR', weight: 0.1, invert: true, z: signalZ(icuPoints('restingHR')) },
    { key: 'form', label: 'Form', weight: 0.2, invert: false, z: signalZ(formPoints) },
  ].map((s) => ({ ...s, z: s.z == null ? null : s.invert ? -s.z : s.z }))

  const available = signals.filter((s) => s.z != null)
  if (!available.length) {
    return { enough: false, reason: 'signals', historyDays, needDays: MIN_BASELINE_DAYS }
  }

  const totalWeight = available.reduce((a, s) => a + s.weight, 0)
  const composite = available.reduce((a, s) => a + s.z * s.weight, 0) / totalWeight
  // 10 points per SD, not 15: on ordinal 1-5 items a single bad day moves a
  // z-score a long way, and tighter scaling produced constant false "Low".
  const index = Math.round(clamp(50 + 10 * composite, 0, 100))

  let label = 'Normal'
  let tone = 'good'
  if (index < 38) {
    label = 'Low'
    tone = 'warn'
  } else if (index < 46) {
    label = 'Below normal'
    tone = 'ok'
  } else if (index > 58) {
    label = 'High'
    tone = 'good'
  }
  const subjective = signals.filter((s) => WELLNESS_SIGNALS.some((w) => w.key === s.key))
  return {
    enough: true,
    index,
    label,
    tone,
    signals,
    historyDays,
    // Surfaced so the UI can say the score is running on objective data alone.
    subjectiveMissing: subjective.every((s) => s.z == null),
  }
}

// ---------------------------------------------------------------------------
// session types
// ---------------------------------------------------------------------------
// `effort` is a subjective description, not a percentage of anything measured -
// the grade offsets below are the prescribable currency and the two used to
// contradict each other.

export const SESSION_TYPES = {
  limit: {
    key: 'limit', label: 'Limit / performance', emoji: '🎯',
    goal: 'Max recruitment — projecting', effort: 'At your limit',
    volume: '4–8 hard problems, few attempts each', rest: '3–5 min between attempts',
    rpe: '8–10', fingerCost: 'high', grades: [-1, 0],
  },
  compSim: {
    key: 'compSim', label: 'Competition simulation', emoji: '🏆',
    goal: 'Perform cold, on unseen climbing, against a clock', effort: 'Near your limit',
    volume: '4–5 unseen problems, or 1–2 unseen routes',
    rest: 'Equal to the time on the wall',
    rpe: '8–10', fingerCost: 'high', grades: [-2, 0],
  },
  fingerStrength: {
    key: 'fingerStrength', label: 'Finger strength', emoji: '🤏',
    goal: 'Max finger force — hangboard', effort: 'Maximal, but low volume',
    volume: '3–5 hangs per grip, 5–10 s each', rest: '3–5 min between hangs',
    rpe: '7–9 local', fingerCost: 'high', grades: null,
  },
  fingerMaintenance: {
    key: 'fingerMaintenance', label: 'Finger maintenance', emoji: '🪝',
    goal: 'Keep the fingers stimulated without a hard day',
    effort: 'Easy — never near failure',
    volume: '6 × 10 s no-hangs, or a light repeater set', rest: '50 s between reps',
    rpe: '4–6 local', fingerCost: 'low', grades: null,
  },
  power: {
    key: 'power', label: 'Power', emoji: '⚡',
    goal: 'Explosive movement', effort: 'Hard, but fast and fresh',
    volume: '6–12 problems', rest: '2–4 min',
    rpe: '7–9', fingerCost: 'high', grades: [-3, -1],
  },
  powerEndurance: {
    key: 'powerEndurance', label: 'Power-endurance', emoji: '🔥',
    goal: 'Sustain hard moves — circuits, 4×4s', effort: 'Sustained and pumpy',
    volume: 'Linked moves, circuits', rest: 'Roughly 1:1 work to rest',
    rpe: '7–9', fingerCost: 'medium', grades: [-5, -3],
  },
  volume: {
    key: 'volume', label: 'Volume / capacity', emoji: '🧱',
    goal: 'Work capacity and mileage', effort: 'Comfortably hard',
    volume: 'Many problems or laps', rest: 'Short',
    rpe: '5–7', fingerCost: 'medium', grades: [-6, -4],
  },
  aerobic: {
    key: 'aerobic', label: 'Aerobic / ARC', emoji: '🫁',
    goal: 'Local endurance', effort: 'Easy and continuous',
    volume: 'Continuous 20–40 min', rest: 'Continuous, minimal',
    rpe: '3–5', fingerCost: 'low', grades: [-8, -6],
  },
  technique: {
    key: 'technique', label: 'Technique', emoji: '🎨',
    goal: 'Skill and movement quality', effort: 'Easy on the body, hard on the brain',
    volume: 'Focused drills', rest: 'As needed',
    rpe: '3–6', fingerCost: 'low', grades: [-6, -4],
  },
  antagonist: {
    key: 'antagonist', label: 'Antagonist & prehab', emoji: '🧰',
    goal: 'Push, shoulder external rotation, wrist extensors',
    effort: 'Light', volume: '2–3 sets each', rest: 'As needed',
    rpe: '4–6', fingerCost: 'none', grades: null,
  },
  mobility: {
    key: 'mobility', label: 'Mobility & rehab', emoji: '🧘',
    goal: 'Move, without loading what hurts',
    effort: 'Easy', volume: 'Stretching and easy movement', rest: '—',
    rpe: '≤3', fingerCost: 'none', grades: null,
  },
  deload: {
    key: 'deload', label: 'Deload / rest', emoji: '🌱',
    goal: 'Planned recovery', effort: 'Minimal or nothing',
    volume: 'Minimal', rest: '—', rpe: '≤4', fingerCost: 'none', grades: null,
  },
}

const LOW_FINGER_TYPES = ['technique', 'aerobic', 'antagonist']

export const COACH_MODELS = [
  {
    key: 'undulating', label: 'Undulating',
    desc: 'Vary the stimulus within each week. Suits year-round climbing and a schedule that moves around.',
  },
  {
    key: 'linear', label: 'Linear',
    desc: 'Work through blocks: capacity → strength → power, then deload. Suits building toward one objective.',
  },
]

const LINEAR_BLOCK = [
  { key: 'capacity', label: 'Capacity', hard: 'volume', easy: 'technique' },
  { key: 'strength', label: 'Strength', hard: 'fingerStrength', easy: 'volume' },
  { key: 'power', label: 'Power', hard: 'limit', easy: 'powerEndurance' },
  { key: 'deload', label: 'Deload', hard: 'deload', easy: 'deload' },
]

export const GOAL_PHASES = [
  {
    key: 'base', label: 'Base', minWeeks: 12,
    hard: 'volume', easy: 'technique',
    rope: { hard: 'volume', easy: 'aerobic' },
    note: 'Far out — build capacity and work on weaknesses.',
    ropeNote: 'Far out — build mileage and aerobic capacity on the wall.',
  },
  {
    key: 'strength', label: 'Strength', minWeeks: 8,
    hard: 'fingerStrength', easy: 'volume',
    rope: { hard: 'fingerStrength', easy: 'powerEndurance' },
    note: 'Convert capacity into strength.',
    ropeNote: 'Build finger strength while keeping a base of sustained climbing.',
  },
  {
    key: 'power', label: 'Power', minWeeks: 4,
    hard: 'power', easy: 'powerEndurance',
    rope: { hard: 'powerEndurance', easy: 'volume' },
    comp: { easy: 'compSim' },
    note: 'Convert strength into power and sustained hard moves.',
    ropeNote: 'Convert strength into staying power — linked hard moves and pump tolerance.',
    compNote: 'Convert strength into power, and start rehearsing it under competition conditions.',
  },
  {
    key: 'peak', label: 'Peak', minWeeks: 2,
    hard: 'limit', easy: 'technique',
    // Not ARC: aerobic work is a base quality and does nothing useful in a peak
    // week. Keep the easy day specific and sharp instead.
    rope: { hard: 'limit', easy: 'powerEndurance' },
    comp: { hard: 'compSim' },
    note: 'Performance work — climb at your limit, keep the volume down.',
    ropeNote: 'Route performance — onsight and redpoint near your limit, keep the volume down.',
    compNote: 'Rehearse competing, not climbing: unseen problems, on the clock, first go. Keep the volume down.',
  },
  {
    key: 'taper', label: 'Taper', minWeeks: 0,
    hard: 'technique', easy: 'deload',
    rope: { hard: 'technique', easy: 'deload' },
    note: 'Stay sharp, arrive fresh. Nothing you do now makes you fitter; plenty can make you tired.',
    ropeNote: 'Stay sharp, arrive fresh. Nothing you do now makes you fitter; plenty can make you tired.',
  },
]

export function phaseFor(phase, discipline, style) {
  const rope = discipline === 'rope'
  let hard = rope ? phase.rope.hard : phase.hard
  let easy = rope ? phase.rope.easy : phase.easy
  let note = rope ? phase.ropeNote : phase.note
  if (style === 'comp' && phase.comp) {
    hard = phase.comp.hard || hard
    easy = phase.comp.easy || easy
    note = phase.compNote || note
  }
  return { hard, easy, note }
}

// The plan for one session in the week, at index `i`.
//
// 'both' is a real answer, not a missing one: combined Boulder & Lead is an
// actual competition format, and treating it as "boulder" silently gives a
// combined athlete no rope work at all. So the disciplines alternate in
// two-session blocks while hard/easy alternates every session - that way each
// discipline gets both a hard and an easy day rather than bouldering taking all
// the hard days and rope all the easy ones.
export function phasePlanAt(phase, discipline, style, i) {
  if (discipline === 'both') {
    const d = Math.floor(i / 2) % 2 === 0 ? null : 'rope'
    const p = phaseFor(phase, d, style)
    return { ...p, key: i % 2 === 0 ? p.hard : p.easy, discipline: d || 'boulder' }
  }
  const p = phaseFor(phase, discipline, style)
  return { ...p, key: i % 2 === 0 ? p.hard : p.easy, discipline: discipline || 'boulder' }
}

// Where you are in the countdown, and whether this is a deload week.
//
// The 4:1 rhythm is anchored to the *goal* when there is one. Anchoring it to
// the first logged session instead let a deload land inside the two-week peak
// and gut it.
export function goalPhase(goals) {
  const goal = primaryGoal(goals)
  if (!goal) return null
  const days = daysUntil(goal)
  if (days == null || days < 0) return null
  const weeks = Math.floor(days / 7)
  const phase = GOAL_PHASES.find((p) => weeks >= p.minWeeks) || GOAL_PHASES[GOAL_PHASES.length - 1]
  // 'both' is kept as a real value rather than collapsed to null: a combined
  // event trains both disciplines, and nulling it here is what made "both"
  // silently mean "boulder".
  const discipline = goal.discipline || null
  const style = goal.style || null
  // Deloads land at 4-week boundaries counting back from the date, and never
  // inside the peak or taper.
  const isDeloadWeek = weeks >= 4 && weeks % 4 === 0
  return {
    goal, days, weeks, phase, discipline, style, isDeloadWeek,
    combined: discipline === 'both',
    plan: phaseFor(phase, discipline === 'both' ? null : discipline, style),
  }
}

const EMPHASIS_BY_KIND = { strength: 'fingerStrength', grade: 'limit' }

export function goalEmphasis(goals) {
  for (const g of goals || []) {
    if (g.achieved || g.target_date) continue
    const key = EMPHASIS_BY_KIND[g.kind]
    if (key) return { key, goal: g, label: SESSION_TYPES[key].label }
  }
  return null
}

// ---------------------------------------------------------------------------
// weekly structure
// ---------------------------------------------------------------------------

const UNDULATING_WEEK = {
  2: ['limit', 'volume'],
  3: ['limit', 'powerEndurance', 'volume'],
  4: ['limit', 'powerEndurance', 'volume', 'power'],
  5: ['limit', 'powerEndurance', 'technique', 'power', 'volume'],
  6: ['limit', 'powerEndurance', 'technique', 'power', 'volume', 'aerobic'],
}

export const MAX_TRAINING_DAYS = 6
export const MAX_SESSIONS_WEEK = 8
export const MIN_SESSIONS_WEEK = 2

const SECOND_SESSION_TYPES = ['antagonist', 'mobility', 'fingerMaintenance']

export function cyclePosition(sessions) {
  let earliest = null
  for (const s of sessions) if (!earliest || s.date < earliest) earliest = s.date
  if (!earliest) return { week: 0, blockWeek: 0, block: LINEAR_BLOCK[0] }
  const weeks = Math.floor(
    differenceInCalendarDays(
      startOfWeek(new Date(), { weekStartsOn: 1 }),
      startOfWeek(asDate(earliest), { weekStartsOn: 1 }),
    ) / 7,
  )
  const blockWeek = ((weeks % 4) + 4) % 4
  return { week: weeks, blockWeek, block: LINEAR_BLOCK[blockWeek] }
}

function sessionsThisWeek(sessions) {
  const from = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const today = todayISO()
  const days = new Set()
  for (const s of sessions) if (s.date >= from && s.date <= today) days.add(s.date)
  return days.size
}

// Is this a deload week? With a dated goal the countdown decides; otherwise the
// 4:1 rhythm runs from the first logged session.
function isDeloadWeek(pos, gp) {
  if (gp) return gp.isDeloadWeek
  return pos.blockWeek === 3
}

function plannedType(sessions, model, daysPerWeek, goals) {
  const pos = cyclePosition(sessions)
  const gp = goalPhase(goals)
  const done = sessionsThisWeek(sessions)
  const emphasis = gp ? null : goalEmphasis(goals)

  if (gp && gp.phase.key === 'taper') {
    const at = phasePlanAt(gp.phase, gp.discipline, gp.style, done)
    return { key: at.key, pos, gp, discipline: at.discipline }
  }
  if (isDeloadWeek(pos, gp)) return { key: 'deload', pos, gp }
  if (gp) {
    const at = phasePlanAt(gp.phase, gp.discipline, gp.style, done)
    return { key: at.key, pos, gp, discipline: at.discipline }
  }
  if (emphasis) return { key: done % 2 === 0 ? emphasis.key : 'volume', pos, gp, emphasis }
  if (model === 'linear') {
    return { key: done % 2 === 0 ? pos.block.hard : pos.block.easy, pos, gp }
  }
  const trainingDays = Math.min(clamp(daysPerWeek, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK), MAX_TRAINING_DAYS)
  const pattern = UNDULATING_WEEK[trainingDays] || UNDULATING_WEEK[3]
  return { key: pattern[done % pattern.length], pos, gp }
}

// Spread `count` hard days as evenly as possible across `n` slots.
function spreadPositions(n, count) {
  const out = new Set()
  if (count <= 0 || n <= 0) return out
  for (let i = 0; i < count; i += 1) out.add(Math.round((i * n) / count) % n)
  // Rounding collisions on small n: fill forward.
  let j = 0
  while (out.size < Math.min(count, n)) {
    if (!out.has(j)) out.add(j)
    j += 1
  }
  return out
}

// This week as days, with weekday placement when the athlete has told us which
// days they train. Without that the plan can only order sessions, not space
// them - and hard/easy alternation is meaningless for someone training
// Fri/Sat/Sun.
export function weekPlan(sessions, model, sessionsPerWeek, goals, profile) {
  const n = clamp(sessionsPerWeek, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)
  const trainingDays = Math.min(n, MAX_TRAINING_DAYS)
  const doubles = n - trainingDays
  const pos = cyclePosition(sessions)
  const done = sessionsThisWeek(sessions)
  const gp = goalPhase(goals)
  const emphasis = gp ? null : goalEmphasis(goals)
  const alternate = (hard, easy) =>
    Array.from({ length: trainingDays }, (_, i) => (i % 2 === 0 ? hard : easy))

  let keys
  let dayDisciplines = null
  if (gp && !isDeloadWeek(pos, gp)) {
    const plans = Array.from({ length: trainingDays }, (_, i) =>
      phasePlanAt(gp.phase, gp.discipline, gp.style, i),
    )
    keys = plans.map((x) => x.key)
    dayDisciplines = plans.map((x) => x.discipline)
  } else if (isDeloadWeek(pos, gp)) keys = Array.from({ length: trainingDays }, () => 'deload')
  else if (emphasis) keys = alternate(emphasis.key, 'volume')
  else if (model === 'linear') keys = alternate(pos.block.hard, pos.block.easy)
  else keys = (UNDULATING_WEEK[trainingDays] || UNDULATING_WEEK[3]).slice(0, trainingDays)

  // Finger strength otherwise disappears for months at a time: Base can run 12+
  // weeks with no finger stimulus at all, and it vanishes again through Power
  // and Peak. Keep one low-cost maintenance dose in any week that has none.
  const hasFingerWork = keys.some((k) => k === 'fingerStrength' || k === 'fingerMaintenance')
  if (!hasFingerWork && keys.length >= 2 && !isDeloadWeek(pos, gp) && gp?.phase.key !== 'taper') {
    const slot = keys.findIndex((k) => SESSION_TYPES[k].fingerCost !== 'high')
    if (slot >= 0) keys[slot] = 'fingerMaintenance'
  }

  const doubleDays = spreadPositions(trainingDays, doubles)
  let sIdx = 0

  // Weekday placement.
  const prefs = Array.isArray(profile?.preferred_days)
    ? [...new Set(profile.preferred_days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b)
    : null
  const weekdays = prefs && prefs.length >= trainingDays ? prefs.slice(0, trainingDays) : null

  // With real weekdays, put the hard sessions on the best-spaced days rather
  // than just first.
  let orderedKeys = keys
  if (weekdays) {
    const hardKeys = keys.filter((k) => SESSION_TYPES[k].fingerCost === 'high')
    const easyKeys = keys.filter((k) => SESSION_TYPES[k].fingerCost !== 'high')
    const hardSlots = spreadPositions(trainingDays, hardKeys.length)
    orderedKeys = []
    let hi = 0
    let ei = 0
    for (let i = 0; i < trainingDays; i += 1) {
      orderedKeys.push(hardSlots.has(i) && hi < hardKeys.length ? hardKeys[hi++] : easyKeys[ei++])
    }
    // Any leftovers (rounding) go on the end.
    for (let i = 0; i < orderedKeys.length; i += 1) {
      if (!orderedKeys[i]) orderedKeys[i] = hardKeys[hi++] || easyKeys[ei++] || 'technique'
    }
  }

  const days = orderedKeys.map((key, i) => {
    const second = doubleDays.has(i)
      ? SECOND_SESSION_TYPES[sIdx++ % SECOND_SESSION_TYPES.length]
      : null
    return {
      key,
      type: SESSION_TYPES[key],
      discipline: dayDisciplines ? dayDisciplines[i] : null,
      weekday: weekdays ? weekdays[i] : null,
      second: second ? { key: second, type: SESSION_TYPES[second] } : null,
      done: i < done,
      next: i === done,
    }
  })

  // Smallest gap between consecutive hard days, in calendar days (wrapping the
  // week). Only meaningful when weekdays are known.
  let minHardGap = null
  if (weekdays) {
    const hardDays = days.filter((d) => d.type.fingerCost === 'high').map((d) => d.weekday)
    if (hardDays.length >= 2) {
      minHardGap = Math.min(
        ...hardDays.map((d, i) => {
          const nxt = hardDays[(i + 1) % hardDays.length]
          return ((nxt - d + 7 - 1) % 7) + 1
        }),
      )
    }
  }

  return Object.assign(days, {
    trainingDays,
    restDays: 7 - trainingDays,
    doubles,
    sessions: n,
    weekdaysKnown: !!weekdays,
    minHardGap,
  })
}

// ---------------------------------------------------------------------------
// exercise selection
// ---------------------------------------------------------------------------

const TYPE_EXERCISES = {
  compSim: ['C1', 'C3', 'C2'],
  limit: ['B8', 'B5', 'K1'],
  fingerStrength: ['F1', 'F2'],
  fingerMaintenance: ['F4', 'F2'],
  power: ['B10', 'F3', 'B5'],
  powerEndurance: ['B3', 'B4', 'B1', 'B2', 'K4', 'K5', 'K6'],
  volume: ['B9', 'B11', 'C2', 'K7', 'B2'],
  aerobic: ['K2', 'B6'],
  technique: ['B7', 'W1', 'B6', 'K2'],
  antagonist: ['S12', 'S15', 'S10', 'S5', 'S6'],
  mobility: ['T1', 'T2', 'T3', 'T4', 'T5'],
  deload: ['T1', 'T2', 'T3', 'T4', 'T5'],
}

export function pickExercises(typeKey, profile, rotate = 0, discipline = null, style = null, ctx = {}) {
  const { age = null, injuredRegions = [] } = ctx
  const ids = TYPE_EXERCISES[typeKey] || []
  let list = ids.map((id) => EXERCISE_MAP[id]).filter(Boolean)
  list = availableExercises(list, profile, discipline)

  // Under-18s: gate on what the exercise actually does, not on the session type
  // it happens to sit under. Campus boards and added-weight finger loading are
  // the specific mechanisms behind growth-plate stress injuries, and they can
  // surface under several type keys.
  if (age != null && age < 18) list = list.filter((e) => !e.youthRestricted)

  // Route around an active problem: drop anything that loads the affected
  // region, but keep exercises that are rehab *for* it.
  if (injuredRegions.length) {
    const safe = list.filter(
      (e) =>
        (e.rehabFor || []).some((r) => injuredRegions.includes(r)) ||
        !(e.loads || []).some((r) => injuredRegions.includes(r)),
    )
    if (safe.length) list = safe
  }

  const want = discipline || profile?.focus
  if (want === 'boulder' || want === 'route' || want === 'rope') {
    const cat = want === 'boulder' ? 'boulder' : 'rope'
    const preferred = list.filter((e) => e.category === cat || e.category === 'finger')
    if (preferred.length) list = preferred
  }
  if (!list.length) return []
  if (typeKey === 'deload' || typeKey === 'mobility') return list

  const start = rotate % list.length
  let ordered = [...list.slice(start), ...list.slice(0, start)]
  if (style) {
    const rank = (e) => (e.style === style ? 0 : !e.style ? 1 : 2)
    ordered = [...ordered].sort((a, b) => rank(a) - rank(b))
  }
  return ordered.slice(0, 3)
}

const CONTEXT_LABEL = { outdoor: 'outdoor', indoor: 'indoor', board: 'on the board' }
const BOARD_LABEL = {
  kilter: 'on the Kilter', moon: 'on the Moonboard', tension: 'on the Tension board',
  spray: 'on the spray wall', other: 'on the board',
}

function gradeRange(typeKey, limits, exercise) {
  const type = SESSION_TYPES[typeKey]
  if (!type?.grades) return null

  const wanted = exercise?.gradeContext || null
  const family = exercise?.category === 'rope' ? 'route' : 'boulder'
  let limit = wanted ? limits.ctx?.[family]?.[wanted] : null
  let context = wanted
  if (!limit) {
    limit = limits[family] || limits.boulder || limits.route
    context = null
  }
  if (!limit) return null

  const [lo, hi] = type.grades
  const low = gradeAt(limit, lo)
  const high = gradeAt(limit, hi)
  const label =
    context === 'board'
      ? BOARD_LABEL[limits.boardType] || CONTEXT_LABEL.board
      : context
        ? CONTEXT_LABEL[context]
        : null
  // Both ends clamped to the bottom of the scale means the offset ran off the
  // end - for a 6A climber "8 grades below your limit" is not a grade.
  if (low.clamped && high.clamped) {
    return { text: 'well below your limit', context, label, offScale: true }
  }
  return {
    low: low.grade,
    high: high.grade,
    context,
    label,
    text: low.grade === high.grade ? low.grade : `${low.grade}–${high.grade}`,
  }
}

// ---------------------------------------------------------------------------
// the daily decision
// ---------------------------------------------------------------------------

export function suggestSession(sessions, ctx) {
  const {
    recovery, readinessState, trend, monotony, injuries, problems, limits,
    model, daysPerWeek, goals, profile,
  } = ctx
  const plan = plannedType(sessions, model, daysPerWeek, goals)
  const planned = SESSION_TYPES[plan.key]
  const reasons = []
  let key = plan.key
  let tone = 'go'
  let headline = 'Following the plan'

  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null
  const youth = age != null && age < 18
  // 18 is a chronological proxy for skeletal maturity, and late maturers can
  // still have open growth plates past it. Under 18 is a hard block; 18-20 is a
  // note, not a restriction.
  const youthWatch = age != null && age >= 18 && age <= 20

  const openInjuries = (injuries || []).filter((i) => !i.ended)
  const injuredRegions = [
    ...new Set([
      ...openInjuries.map((i) => i.region).filter(Boolean),
      ...(problems || []).map((p) => p.area),
    ]),
  ]
  const substantial = (problems || []).filter((p) => p.substantial)

  if (youth && (key === 'fingerStrength' || key === 'power' || key === 'limit')) {
    key = 'volume'
    reasons.push('Under 18 — no maximal finger loading')
  }

  const cost = SESSION_TYPES[key].fingerCost
  const costly = cost === 'high'
  const anyFingerCost = cost === 'high' || cost === 'medium'
  const fingersBusy = recovery.key === 'loaded' || recovery.key === 'recovering'

  if (substantial.length) {
    // A developing overuse problem, caught by the weekly questionnaire before
    // it becomes a declared injury.
    key = 'mobility'
    tone = 'caution'
    headline = 'Back off — something is brewing'
    reasons.push(`${substantial.map((p) => p.area).join(', ')} — substantial problem this week`)
  } else if (openInjuries.length) {
    // Mobility, not antagonist work: antagonist is largely shoulder and push,
    // which is the worst possible answer to a shoulder injury.
    key = 'mobility'
    tone = 'caution'
    headline = 'Rehab or easy day'
    const regions = openInjuries.map((i) => i.region).filter(Boolean)
    reasons.push(regions.length ? `Open injury — ${regions.join(', ')}` : 'Open injury in your log')
  } else if (recovery.key === 'unknown' && costly) {
    key = 'fingerMaintenance'
    tone = 'moderate'
    headline = 'Start easy'
    reasons.push('No finger history yet')
  } else if (fingersBusy && anyFingerCost) {
    key = LOW_FINGER_TYPES[plan.pos.week % LOW_FINGER_TYPES.length]
    tone = 'easy'
    headline = 'Spare the fingers'
    reasons.push(
      recovery.daysSinceMax === 0
        ? 'Fingers loaded today'
        : `Fingers loaded ${recovery.daysSinceMax}d ago · needs ${recovery.required}d`,
    )
  } else if (recovery.sustainedWeeks >= 8 && anyFingerCost) {
    // Months of hard finger loading with no lighter week. Nothing else in the
    // model can see this, because every relative measure has adapted to it.
    key = 'fingerMaintenance'
    tone = 'caution'
    headline = 'Time for an easy finger week'
    reasons.push(`${recovery.sustainedWeeks} weeks straight of hard finger days`)
  } else if (recovery.chronicLevel === 'very-high' && anyFingerCost) {
    key = 'technique'
    tone = 'caution'
    headline = 'Too many hard finger days'
    reasons.push(`${recovery.days28} hard finger days in 28d`)
  } else if (readinessState?.enough && readinessState.index < 38) {
    key = 'deload'
    tone = 'easy'
    headline = 'Recovery day'
    reasons.push(`Readiness ${readinessState.index}`)
  } else if (key === 'deload') {
    tone = 'easy'
    headline = 'Deload week'
    reasons.push(plan.gp ? 'Scheduled in the countdown' : 'Week 4 of the cycle')
  } else if (recovery.rampFlag && costly) {
    key = 'powerEndurance'
    tone = 'moderate'
    headline = 'Ease in'
    reasons.push(`${recovery.days7} hard finger days this week`)
  } else if (recovery.chronicLevel === 'high' && costly) {
    key = 'powerEndurance'
    tone = 'moderate'
    headline = 'Ease in'
    reasons.push(`${recovery.days28} hard finger days in 28d`)
  } else if (trend?.enough && trend.key === 'sharp' && costly) {
    key = 'volume'
    tone = 'moderate'
    headline = 'Ease in'
    reasons.push(`Load ${trend.pctLabel} of normal`)
  } else {
    if (fingersBusy) {
      reasons.push(
        recovery.daysSinceMax === 0 ? 'Fingers loaded today' : `Fingers loaded ${recovery.daysSinceMax}d ago`,
      )
      tone = 'moderate'
    } else if (recovery.key === 'unknown') {
      reasons.push('No finger history yet')
    } else if (recovery.daysSinceMax != null) {
      reasons.push(`Fingers recovered · ${recovery.daysSinceMax}d`)
    } else {
      reasons.push('Fingers fresh')
    }
    if (readinessState?.enough) reasons.push(`Readiness ${readinessState.index}`)
  }

  if (monotony?.enough && monotony.flag && key !== 'deload') {
    reasons.push('Monotony high — vary the stimulus')
  }

  const discipline = plan.discipline || plan.emphasis?.goal?.discipline || null
  const style = plan.gp?.style || plan.emphasis?.goal?.style || null
  const exercises = pickExercises(key, profile, plan.pos.week, discipline, style, {
    age,
    injuredRegions,
  })

  return {
    type: SESSION_TYPES[key],
    key,
    tone,
    headline,
    reasons,
    grades: gradeRange(key, limits, exercises[0]),
    exercises,
    emphasis: plan.emphasis || null,
    plannedKey: plan.key,
    plannedLabel: planned.label,
    adjusted: key !== plan.key,
    cycle: plan.pos,
    goalPhase: plan.gp,
    youth,
    youthWatch,
    injuredRegions,
  }
}

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

// Today's form from the app's own unified load series.
export function currentForm(sessions) {
  const series = fitnessSeries(sessions, subDays(new Date(), 45))
  if (!series.length) return null
  return series[series.length - 1].form
}

export function coachReadout(sessions, injuries, icuWellness, opts = {}) {
  const {
    model = 'undulating', profile = null, goals = [],
    wellness = [], ostrc = [],
  } = opts
  const daysPerWeek = profile?.sessions_week
    ? clamp(profile.sessions_week, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)
    : clamp(opts.daysPerWeek || 3, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)

  const limits = buildLimits(sessions, profile)
  const recovery = fingerRecovery(sessions, limits, profile)
  const trend = loadTrend(sessions)
  const monotony = monotonyStrain(sessions)
  const readinessState = readiness(sessions, wellness, icuWellness)
  const form = currentForm(sessions)
  const problems = activeProblems(ostrc)

  const suggestion = suggestSession(sessions, {
    recovery, readinessState, trend, monotony, injuries, problems, limits,
    model, daysPerWeek, goals, profile,
  })

  return {
    recovery, trend, monotony, readiness: readinessState, form, suggestion, limits,
    problems, daysPerWeek, goalPhase: suggestion.goalPhase,
    hangTest: hangTestAge(profile),
  }
}
