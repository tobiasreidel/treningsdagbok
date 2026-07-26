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
import { addDays, differenceInCalendarDays, format, subDays, startOfWeek } from 'date-fns'
import { asDate, todayISO } from './format'
import { BOULDER_GRADES, ROUTE_GRADES, formatGrade } from './constants'
import { normalizeHang } from './formState'
import { fitnessSeries, sessionLoad } from './stats'
import { EXERCISE_MAP, availableExercises, exercisesAt } from './exercises'
import { primaryGoal, daysUntil } from './coachProfile'
import { activeProblems } from './wellness'
import { setIntensity, usableMaxTotal, maxTotalFor, prescribeHang } from './fingerLoad'
import { painAborts, asymmetries } from './fingerTests'

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
// experience
// ---------------------------------------------------------------------------
// How hard the plan should be pitched, and how much chronic loading the tissue
// can be assumed to tolerate. These are two different questions and are
// deliberately answered from two different inputs:
//
//   * What you can do now  -> your grade. A 8B climber needs sessions that are
//     actually hard; prescribing technique drills and easy mileage to someone
//     operating at that level wastes the week.
//   * What your tendons tolerate -> years under load. Collagen turnover and
//     tendon stiffening happen over years, not seasons, and they do not care
//     what grade you climb. A three-year 8A climber has strong fingers and
//     young connective tissue, and the ceiling should follow the tissue.
//
// Collapsing both into one "level" is what makes a plan either patronising or
// reckless, depending on which input it happened to pick.

const LEVEL_ORDER = ['new', 'intermediate', 'advanced', 'elite']

const LEVELS = {
  new: { key: 'new', label: 'Building a base' },
  intermediate: { key: 'intermediate', label: 'Intermediate' },
  advanced: { key: 'advanced', label: 'Advanced' },
  elite: { key: 'elite', label: 'Elite' },
}

// Grade thresholds, as indices into the scales in constants.js.
const BOULDER_LEVEL = [
  { min: 17, key: 'elite' },        // 8A+ and up
  { min: 13, key: 'advanced' },     // 7B+ .. 8A
  { min: 8, key: 'intermediate' },  // 6C .. 7B
  { min: 0, key: 'new' },
]
const ROUTE_LEVEL = [
  { min: 19, key: 'elite' },        // 8a+ and up
  { min: 15, key: 'advanced' },     // 7b+ .. 8a
  { min: 10, key: 'intermediate' }, // 6c .. 7b
  { min: 0, key: 'new' },
]

function levelFromYears(years) {
  if (years == null) return null
  if (years >= 10) return 'elite'
  if (years >= 5) return 'advanced'
  if (years >= 2) return 'intermediate'
  return 'new'
}

function bestGradeLevel(profile) {
  const boulder = Math.max(
    gradeIndex(profile?.max_boulder_outdoor, 'bouldering'),
    gradeIndex(profile?.max_boulder_indoor, 'bouldering'),
    gradeIndex(profile?.max_boulder_board, 'bouldering'),
    gradeIndex(profile?.max_boulder, 'bouldering'),
  )
  const route = Math.max(
    gradeIndex(profile?.max_route_outdoor, 'sport'),
    gradeIndex(profile?.max_route_indoor, 'sport'),
    gradeIndex(profile?.max_route, 'sport'),
  )
  const keys = []
  if (boulder >= 0) keys.push(BOULDER_LEVEL.find((l) => boulder >= l.min).key)
  if (route >= 0) keys.push(ROUTE_LEVEL.find((l) => route >= l.min).key)
  if (!keys.length) return null
  // Your hardest discipline is the honest read on what you can be given.
  return keys.reduce((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a))
}

export function experienceLevel(profile) {
  const years = profile?.climbing_since
    ? Math.max(0, new Date().getFullYear() - Number(profile.climbing_since))
    : null
  const byYears = levelFromYears(years)
  const byGrade = bestGradeLevel(profile)
  // Unknown on either side falls back to the other; unknown on both means a
  // middle-of-the-road plan rather than a guess in either direction.
  const key = byGrade || byYears || 'intermediate'
  return {
    ...LEVELS[key],
    years,
    // The tissue ceiling never runs ahead of the years actually trained.
    tissueKey: byYears || 'intermediate',
    known: !!(byGrade || byYears),
    hard: key === 'advanced' || key === 'elite',
  }
}

// Chronic finger-day ceilings, scaled by years under load. The guard stays for
// everyone - two hard finger days every week for twenty weeks is a route to
// tendinopathy at any level - but the number of days that means is not the
// same for a fourteen-year climber as for a two-year one, and pinning it to
// the beginner's figure made the plan constantly flag its own prescriptions.
const CHRONIC_CEILING = {
  new: { high: 8, veryHigh: 11 },
  intermediate: { high: 9, veryHigh: 12 },
  advanced: { high: 11, veryHigh: 14 },
  elite: { high: 12, veryHigh: 15 },
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

// Relative intensity of one hangboard set, 0..1.3.
//
// TOTAL load against a TOTAL-load max. Using added-weight on either side makes
// every percentage a percentage of the wrong denominator — see fingerLoad.js.
function hangIntensity(set, profile, tests, grip) {
  const maxTotal = usableMaxTotal(profile, tests, grip)
  const bw = num(profile?.bodyweight_kg)
  if (maxTotal) {
    const rel = setIntensity(set, maxTotal, bw)
    if (rel != null) return rel
  }
  // No usable max (or a set we can't read): fall back to the edge as a coarse
  // proxy rather than treating "any added weight at all" as maximal, which
  // +2 kg on 20 mm is not.
  const edge = num(set.edge)
  if (edge > 0 && edge <= 10) return 0.85
  if (edge > 0 && edge <= 13) return 0.7
  const added = num(set.weight) || num(set.load_total_kg) - bw
  return added > 0 ? 0.6 : 0.45
}

// Everything a single session did to the fingers: a continuous dose plus the
// tier that dose (and any absolute trigger) puts it in.
export function fingerDose(s, limits, profile, tests = []) {
  const f = s.extra?.finger
  let dose = 0
  let tier = 'none'
  const why = []
  // Peak relative intensity anywhere in the session. Carried alongside the
  // cumulative dose because they are different injury mechanisms: pulleys fail
  // on a single peak, tendinopathy accumulates over time under tension.
  let peakRel = 0

  // --- hangboard -----------------------------------------------------------
  for (const h of f?.hangboard || []) {
    const nh = normalizeHang(h)
    const reps = Math.max(1, num(nh.reps))
    for (const set of nh.sets) {
      const t = num(set.time) || 7
      const rel = hangIntensity(set, profile, tests, nh.grip)
      if (rel > peakRel) peakRel = rel
      // Intensity exponent is 3, not 2: peak force drives pulley injury, and a
      // squared term scored a long repeater session ~3.5x a max-hang session -
      // the wrong way round for the mechanism this window exists to respect.
      dose += rel ** 3 * t * reps * 0.5
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

  // --- the session named from the plan --------------------------------------
  // Logging "this was B5 / F1 / K4" is a direct statement of what the session
  // was. Like finger RPE below it acts as a floor, never an addition, so it
  // can't double-count the itemised dose. The truly maximal library entries
  // are the youth-restricted ones (max hangs, campus) - the rest of the
  // high-cost list is "hard" until the RPE says otherwise.
  const named = EXERCISE_MAP[s.extra?.coach?.exercise]
  if (named) {
    if (named.fingerCost === 'high') {
      tier = higherTier(tier, named.youthRestricted ? 'maximal' : 'hard')
      dose = Math.max(dose, named.youthRestricted ? 30 : 20)
      why.push(`${named.id} · ${named.name}`)
    } else if (named.fingerCost === 'medium') {
      tier = higherTier(tier, 'light')
      dose = Math.max(dose, 8)
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

  return { dose: Math.round(dose), tier, why, peakRel: Math.round(peakRel * 100) / 100 }
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
function fingerDayStats(sessions, limits, profile, days, offset = 0, tests = []) {
  const today = new Date()
  const dayTier = new Map()
  let dose = 0
  for (const s of sessions) {
    const ago = differenceInCalendarDays(today, asDate(s.date))
    if (ago < offset || ago >= days + offset) continue
    const d = fingerDose(s, limits, profile, tests)
    if (d.tier === 'none') continue
    dose += d.dose
    const prev = dayTier.get(s.date) || 'none'
    dayTier.set(s.date, higherTier(prev, d.tier))
  }
  let hardDays = 0
  for (const t of dayTier.values()) if (t === 'maximal' || t === 'hard') hardDays += 1
  return { hardDays, dose, activeDays: dayTier.size }
}

export function fingerRecovery(sessions, limits, profile, tests = []) {
  const today = todayISO()
  let last = null
  let everLoaded = false
  for (const s of sessions) {
    if (s.date > today) continue
    const d = fingerDose(s, limits, profile, tests)
    if (d.tier === 'none') continue
    everLoaded = true
    if (d.tier === 'light') continue
    if (!last || s.date > last.date) last = { date: s.date, ...d }
  }

  // Acute vs chronic finger exposure, on disjoint windows: this week against
  // the four weeks *before* it.
  const acute = fingerDayStats(sessions, limits, profile, 7, 0, tests)
  const chronic = fingerDayStats(sessions, limits, profile, 28, 7, tests)
  const chronicWeekly = chronic.hardDays / 4
  const rampFlag = acute.hardDays >= 2 && acute.hardDays > 1.5 * chronicWeekly

  // Absolute ceiling, not just a ramp. Two hard finger days every week forever
  // never trips a ramp flag - the baseline is equally high - and that is a
  // plausible route to tendinopathy that a relative measure cannot see.
  const load28 = fingerDayStats(sessions, limits, profile, 28, 0, tests)
  const load56 = fingerDayStats(sessions, limits, profile, 56, 0, tests)
  const ceiling = CHRONIC_CEILING[experienceLevel(profile).tissueKey]
  let chronicLevel = 'ok'
  if (load28.hardDays >= ceiling.veryHigh) chronicLevel = 'very-high'
  else if (load28.hardDays >= ceiling.high) {
    chronicLevel = load56.hardDays >= ceiling.high * 2 ? 'very-high' : 'high'
  }

  // Rate alone misses the real pattern. Two hard finger days every single week
  // is a defensible rate - and doing it for twenty weeks without a lighter week
  // is not. A relative ramp can never see this (the baseline is equally high)
  // and a 28-day count sits just under any sane threshold, so count the
  // unbroken run of weeks instead.
  let sustainedWeeks = 0
  for (let w = 0; w < 26; w += 1) {
    const wk = fingerDayStats(sessions, limits, profile, 7, w * 7, tests)
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
// signal history
// ---------------------------------------------------------------------------
// The evolution behind each headline number, for the signal detail views.
// Ascending series; null = "not computable that day" (a gap, not a zero), the
// same gating the live signals apply.

// Daily finger dose, with the day's highest tier.
export function fingerDoseSeries(sessions, limits, profile, days = 28, tests = []) {
  const today = new Date()
  const byDate = new Map()
  for (const s of sessions) {
    const ago = differenceInCalendarDays(today, asDate(s.date))
    if (ago < 0 || ago >= days) continue
    const d = fingerDose(s, limits, profile, tests)
    if (d.tier === 'none') continue
    const prev = byDate.get(s.date) || { dose: 0, tier: 'none' }
    byDate.set(s.date, {
      dose: prev.dose + d.dose,
      tier: higherTier(prev.tier, d.tier),
    })
  }
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const iso = format(subDays(today, i), 'yyyy-MM-dd')
    const v = byDate.get(iso)
    out.push({ date: iso, dose: v?.dose || 0, tier: v?.tier || 'none' })
  }
  return out
}

// Daily whole-body load (all sports), ascending.
export function dailyLoadSeries(sessions, days = 28) {
  return dailyLoadWindow(sessions, days, 0)
}

// The load-trend ratio (this week vs the four before it) evaluated for each of
// the last `days` days, with the same baseline gate as the live number.
export function trendSeries(sessions, days = 42) {
  const total = days + 35
  const loads = dailyLoadWindow(sessions, total, 0)
  const out = []
  for (let i = 0; i < days; i += 1) {
    const end = total - days + i
    const date = loads[end].date
    const chronicDays = loads.slice(end - 34, end - 6)
    const chronic = mean(chronicDays.map((d) => d.load))
    const active = chronicDays.filter((d) => d.load > 0).length
    if (chronic < MIN_CHRONIC_DAILY_LOAD || active < MIN_CHRONIC_ACTIVE_DAYS) {
      out.push({ date, pct: null })
    } else {
      const acute = mean(loads.slice(end - 6, end + 1).map((d) => d.load))
      out.push({ date, pct: Math.min(300, Math.round((acute / chronic) * 100)) })
    }
  }
  return out
}

// Foster monotony over the trailing 7 days, for each of the last `days` days.
// A flat week with zero SD is shown capped rather than as a gap - "off the
// scale" is the finding, not missing data.
export function monotonySeries(sessions, days = 42) {
  const total = days + 7
  const loads = dailyLoadWindow(sessions, total, 0)
  const out = []
  for (let i = 0; i < days; i += 1) {
    const end = total - days + i
    const date = loads[end].date
    const wk = loads.slice(end - 6, end + 1).map((d) => d.load)
    const weekly = wk.reduce((a, b) => a + b, 0)
    if (weekly <= 0 || wk.filter((l) => l > 0).length < 3) {
      out.push({ date, monotony: null })
    } else {
      const sd = stdev(wk)
      out.push({ date, monotony: sd > 0 ? Math.min(4, mean(wk) / sd) : 4 })
    }
  }
  return out
}

// Readiness re-evaluated for each of the last `days` days. Each point uses
// only data up to that day, so this is what the score actually said (or would
// have said) at the time.
export function readinessSeries(sessions, wellnessRows, icuWellness, days = 42) {
  const today = new Date()
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const asOf = subDays(today, i)
    const r = readiness(sessions, wellnessRows, icuWellness, asOf)
    out.push({ date: format(asOf, 'yyyy-MM-dd'), index: r.enough ? r.index : null })
  }
  return out
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

function signalZ(points, recentDays = 7, minRecent = 1, asOf = new Date()) {
  const asOfISO = format(asOf, 'yyyy-MM-dd')
  const sorted = points
    .filter((p) => p.date <= asOfISO)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 8) return null
  const cut = format(subDays(asOf, recentDays - 1), 'yyyy-MM-dd')
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
export function readiness(sessions, wellnessRows, icuWellness, asOf = new Date()) {
  const today = asOf
  let earliest = null
  for (const s of sessions) if (!earliest || s.date < earliest) earliest = s.date
  const historyDays = earliest ? differenceInCalendarDays(today, asDate(earliest)) : 0
  if (historyDays < MIN_BASELINE_DAYS) {
    return { enough: false, reason: 'history', historyDays, needDays: MIN_BASELINE_DAYS }
  }

  const inWindow = (r) => {
    const ago = differenceInCalendarDays(today, asDate(r.date))
    return ago >= 0 && ago < BASELINE_DAYS
  }
  const rows = (wellnessRows || []).filter(inWindow)
  const wellPoints = (key) =>
    rows.filter((r) => r[key] != null).map((r) => ({ date: r.date, value: Number(r[key]) }))

  const icu = (icuWellness || []).filter(inWindow)
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
      z: signalZ(wellPoints(s.key), 7, MIN_RECENT_WELLNESS, asOf),
    })),
    { key: 'hrv', label: 'HRV', weight: 0.2, invert: false, z: signalZ(icuPoints('hrv'), 7, 1, asOf) },
    { key: 'rhr', label: 'Resting HR', weight: 0.1, invert: true, z: signalZ(icuPoints('restingHR'), 7, 1, asOf) },
    { key: 'form', label: 'Form', weight: 0.2, invert: false, z: signalZ(formPoints, 7, 1, asOf) },
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
  // Zero physical load, real training value. This is what the plan has left to
  // offer when injury, a substantial problem or a collapsed readiness score
  // rules out everything that touches a hold.
  mental: {
    key: 'mental', label: 'Mental training', emoji: '🧠',
    goal: 'Train the part that decides competitions',
    effort: 'None physically', volume: '5–20 min', rest: '—',
    rpe: '—', fingerCost: 'none', grades: null,
  },
  // The easy slot of a deload week - not the whole week. A deload cuts volume
  // and keeps quality; a week of stretching is a week of detraining, and for a
  // strong climber it is simply a wasted week.
  deload: {
    key: 'deload', label: 'Easy movement', emoji: '🌱',
    goal: 'Move well, add no fatigue', effort: 'Easy throughout — never near failure',
    volume: 'Short: ~30–40 min on the wall, plus mobility', rest: 'As needed',
    rpe: '≤4', fingerCost: 'low', grades: [-6, -4],
  },
}

// Fraction of the week's training days a deload keeps. Reduced volume with
// unchanged intensity is the version of a deload with actual support behind
// it: intensity preserves the adaptation, volume generates the fatigue you are
// trying to shed. (The "about half the volume" instruction *within* each kept
// session is UI copy, not arithmetic - the app never sees your set count.)
const DELOAD_DAYS_FRACTION = 0.6

// The keys for a deload week: the phase's own hard session kept (at roughly
// half the usual volume - see `reduced` on the day), one easy movement day,
// and the remaining slots given back as rest.
function deloadKeys(hardKey, trainingDays) {
  const days = clamp(Math.round(trainingDays * DELOAD_DAYS_FRACTION), 2, 4)
  const out = Array.from({ length: trainingDays }, () => null)
  const slots = [...spreadPositions(trainingDays, days)].sort((a, b) => a - b)
  slots.forEach((slot, i) => {
    if (i === 0) out[slot] = hardKey
    else if (i === slots.length - 1) out[slot] = 'mobility'
    else out[slot] = 'deload'
  })
  return out
}

// The hard session a deload week should keep, given where the plan is.
function deloadHardKey(gp, model, blockWeek) {
  if (gp) return phaseFor(gp.phase, gp.discipline === 'both' ? null : gp.discipline, gp.style).hard
  // In the repeating cycle the deload is week 4, so the quality to preserve is
  // the block that just finished, not the deload block itself.
  if (model === 'linear') return LINEAR_BLOCK[((blockWeek - 1) + 4) % 4].hard
  return 'limit'
}

// The bridge from the v3 one-dimensional session types onto the (category,
// tier) grid the library now carries. Session types remain the vocabulary the
// plan is written in; the grid is what a prescription resolves to, and it is
// what lets "tired fingers" mean *one tier down* instead of a different
// session entirely.
export const TYPE_GRID = {
  limit: { cat: { boulder: 'hardBoulder', rope: 'hardRope' }, tier: 5 },
  compSim: { cat: { boulder: 'hardBoulder', rope: 'hardRope' }, tier: 5 },
  power: { cat: { boulder: 'hardBoulder', rope: 'hardBoulder' }, tier: 4 },
  powerEndurance: { cat: { boulder: 'pump', rope: 'pump' }, tier: 4 },
  volume: { cat: { boulder: 'volumeBoulder', rope: 'volumeRope' }, tier: 3 },
  aerobic: { cat: { boulder: 'pump', rope: 'volumeRope' }, tier: 2 },
  technique: { cat: { boulder: 'lowIntBoulder', rope: 'lowIntBoulder' }, tier: 2 },
  fingerStrength: { cat: { boulder: 'fingerStrength', rope: 'fingerStrength' }, tier: 5 },
  fingerMaintenance: { cat: { boulder: 'fingerStrength', rope: 'fingerStrength' }, tier: 1 },
  antagonist: { cat: { boulder: 'strength', rope: 'strength' }, tier: 2 },
  mobility: { cat: { boulder: 'mobility', rope: 'mobility' }, tier: 1 },
  mental: { cat: { boulder: 'mental', rope: 'mental' }, tier: 1 },
  deload: { cat: { boulder: 'lowIntBoulder', rope: 'lowIntBoulder' }, tier: 2 },
}

export function gridFor(typeKey, discipline) {
  const g = TYPE_GRID[typeKey] || TYPE_GRID.volume
  const d = discipline === 'rope' || discipline === 'route' ? 'rope' : 'boulder'
  return { sessionCat: g.cat[d], tier: g.tier }
}

// Zero-finger-cost fallbacks, in rotation. Mental work belongs here precisely
// because it costs nothing physically: it is the only real content available
// on a day when everything else is contraindicated.
const LOW_FINGER_TYPES = ['technique', 'mental', 'aerobic', 'antagonist']

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
    // A taper is HALF THE VOLUME AT THE SAME INTENSITY, not a fortnight of
    // technique drills. The meta-analytic picture is volume down ~40-60% with
    // intensity and frequency maintained; v3's technique/deload taper cut the
    // intensity and kept the time, which is the one combination that
    // detrains you and calls itself a taper. The phase now keeps the Peak
    // session types and leans entirely on durationMultiplier below.
    key: 'taper', label: 'Taper', minWeeks: 0,
    hard: 'limit', easy: 'technique',
    rope: { hard: 'limit', easy: 'powerEndurance' },
    comp: { hard: 'compSim' },
    note: 'Same sessions, half the time. Nothing you do now makes you fitter; plenty can make you tired.',
    ropeNote: 'Same sessions, half the time. Nothing you do now makes you fitter; plenty can make you tired.',
    compNote: 'Short, sharp rehearsals of competing. Same intensity, half the volume.',
  },
]

// How long a session should run in a given phase, as a multiple of the
// exercise's own durationTarget_min. Duration is the volume lever because it
// is the one an athlete can actually obey mid-session, unlike a set count they
// will drift past.
export const PHASE_DURATION = { taper: 0.5, deload: 0.6 }

export function durationFor(exercise, { taper = false, deload = false } = {}) {
  const base = exercise?.durationTarget_min || null
  if (!base) return null
  const mult = taper ? PHASE_DURATION.taper : deload ? PHASE_DURATION.deload : 1
  return { minutes: Math.round(base * mult), reduced: mult < 1, mult }
}

// A deload exists to shed the fatigue built by the weeks before it. A goal set
// when it was already close has no such weeks behind it: dropping a recovery
// week into a five-week run-up costs a fifth of the whole preparation and
// banks rest that was never earned. A goal you have been building toward for
// months has earned it, so there the 4-week rhythm stands.
const MIN_COUNTDOWN_WEEKS_BEFORE_DELOAD = 3

export function isGoalDeloadWeek(goal, weeksOut) {
  if (!(weeksOut >= 4 && weeksOut % 4 === 0)) return false
  const created = goal?.created_at ? asDate(String(goal.created_at).slice(0, 10)) : null
  if (!created) return true
  const deloadDate = subDays(asDate(goal.target_date), weeksOut * 7)
  return differenceInCalendarDays(deloadDate, created) / 7 >= MIN_COUNTDOWN_WEEKS_BEFORE_DELOAD
}

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
  // Deloads land at 4-week boundaries counting back from the date, never
  // inside the peak or taper, and never before the countdown has built any
  // fatigue worth shedding.
  const isDeloadWeek = isGoalDeloadWeek(goal, weeks)
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

// The same weeks for someone who has been climbing hard for years. The filler
// is what changes: technique drills and easy mileage are how you build a base
// you do not yet have, and are not what makes an already-strong climber
// stronger. The count of maximal finger days is what the recovery model
// polices, so the harder week earns its intensity from the *other* days.
const UNDULATING_WEEK_HARD = {
  2: ['limit', 'fingerStrength'],
  3: ['limit', 'fingerStrength', 'powerEndurance'],
  4: ['limit', 'fingerStrength', 'power', 'powerEndurance'],
  5: ['limit', 'fingerStrength', 'power', 'powerEndurance', 'volume'],
  6: ['limit', 'fingerStrength', 'power', 'powerEndurance', 'volume', 'technique'],
}

// Easy days that are only easy because the athlete is assumed to be new. For
// an experienced climber the same slot is better spent on real work.
const HARDER_EASY = { technique: 'volume', aerobic: 'powerEndurance' }

function undulatingWeek(trainingDays, level) {
  const table = level?.hard ? UNDULATING_WEEK_HARD : UNDULATING_WEEK
  return table[trainingDays] || table[3]
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

function plannedType(sessions, model, daysPerWeek, goals, level) {
  const pos = cyclePosition(sessions)
  const gp = goalPhase(goals)
  const done = sessionsThisWeek(sessions)
  const emphasis = gp ? null : goalEmphasis(goals)
  const trainingDays = Math.min(
    clamp(daysPerWeek, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK),
    MAX_TRAINING_DAYS,
  )
  const harder = (k) => (level?.hard ? HARDER_EASY[k] || k : k)

  if (gp && gp.phase.key === 'taper') {
    const at = phasePlanAt(gp.phase, gp.discipline, gp.style, done)
    return { key: at.key, pos, gp, discipline: at.discipline }
  }
  // A deload week still trains - it keeps the phase's quality session and
  // sheds volume - so it must resolve to the same keys the week view shows.
  if (isDeloadWeek(pos, gp)) {
    const keys = deloadKeys(deloadHardKey(gp, model, pos.blockWeek), trainingDays).filter(Boolean)
    return { key: keys[done % keys.length] || 'deload', pos, gp, deload: true }
  }
  if (gp) {
    const at = phasePlanAt(gp.phase, gp.discipline, gp.style, done)
    return { key: harder(at.key), pos, gp, discipline: at.discipline }
  }
  if (emphasis) return { key: done % 2 === 0 ? emphasis.key : 'volume', pos, gp, emphasis }
  if (model === 'linear') {
    return { key: harder(done % 2 === 0 ? pos.block.hard : pos.block.easy), pos, gp }
  }
  const pattern = undulatingWeek(trainingDays, level)
  return { key: harder(pattern[done % pattern.length]), pos, gp }
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

// The plan's session keys for the week `wk` weeks after the current one, hard
// days spread across the training slots. Deload and phase are computed per
// week - next Monday can be a different phase than today, and the plan should
// show that instead of pretending the current week repeats forever.
function weekKeys(pos, goal, emphasis, model, trainingDays, wk, level) {
  let gp = null
  if (goal) {
    const days = daysUntil(goal) - wk * 7
    if (days >= 0) {
      const weeks = Math.floor(days / 7)
      const phase =
        GOAL_PHASES.find((p) => weeks >= p.minWeeks) || GOAL_PHASES[GOAL_PHASES.length - 1]
      gp = {
        phase,
        weeks,
        discipline: goal.discipline || null,
        style: goal.style || null,
        isDeloadWeek: isGoalDeloadWeek(goal, weeks),
      }
    }
  }
  const blockWeek = (((pos.blockWeek + wk) % 4) + 4) % 4
  const deload = gp ? gp.isDeloadWeek : blockWeek === 3
  const alternate = (hard, easy) =>
    Array.from({ length: trainingDays }, (_, i) => (i % 2 === 0 ? hard : easy))

  // A deload week is a reduction, not a week off: keep the phase's own quality
  // session, give back the rest of the days.
  if (deload) {
    return {
      keys: deloadKeys(deloadHardKey(gp, model, blockWeek), trainingDays),
      disciplines: null,
      deload: true,
      phaseLabel: gp ? gp.phase.label : LINEAR_BLOCK[blockWeek].label,
      gp,
    }
  }

  let keys
  let disciplines = null
  if (gp) {
    const plans = Array.from({ length: trainingDays }, (_, i) =>
      phasePlanAt(gp.phase, gp.discipline, gp.style, i),
    )
    keys = plans.map((x) => x.key)
    disciplines = plans.map((x) => x.discipline)
  } else if (emphasis) keys = alternate(emphasis.key, 'volume')
  else if (model === 'linear') {
    const block = LINEAR_BLOCK[blockWeek]
    keys = alternate(block.hard, block.easy)
  } else keys = undulatingWeek(trainingDays, level).slice(0, trainingDays)

  // Experienced climbers don't get the base-building filler.
  if (level?.hard) keys = keys.map((k) => HARDER_EASY[k] || k)

  // Finger strength otherwise disappears for months at a time: Base can run 12+
  // weeks with no finger stimulus at all, and it vanishes again through Power
  // and Peak. Keep a finger dose in any week that has none - a maintenance one
  // if the base is still being built, a real one if it is long since built.
  const hasFingerWork = keys.some((k) => k === 'fingerStrength' || k === 'fingerMaintenance')
  if (!hasFingerWork && keys.length >= 2 && gp?.phase.key !== 'taper') {
    const slot = keys.findIndex((k) => SESSION_TYPES[k].fingerCost !== 'high')
    if (slot >= 0) keys[slot] = level?.hard ? 'fingerStrength' : 'fingerMaintenance'
  }

  // Hard sessions on the best-spaced slots rather than just first.
  const hardKeys = keys.filter((k) => SESSION_TYPES[k].fingerCost === 'high')
  const easyKeys = keys.filter((k) => SESSION_TYPES[k].fingerCost !== 'high')
  const hardSlots = spreadPositions(trainingDays, hardKeys.length)
  const ordered = []
  let hi = 0
  let ei = 0
  for (let i = 0; i < trainingDays; i += 1) {
    ordered.push(
      hardSlots.has(i) && hi < hardKeys.length
        ? hardKeys[hi++]
        : easyKeys[ei++] || hardKeys[hi++] || 'technique',
    )
  }

  return {
    keys: ordered,
    disciplines,
    deload,
    taper: gp?.phase.key === 'taper',
    phaseLabel: gp ? gp.phase.label : LINEAR_BLOCK[blockWeek].label,
    gp,
  }
}

// The next 7 days as an actual plan: real dates, sessions on the days you
// train, rest days where they fall - and next week's phase visible the moment
// it is inside the window. Logged sessions tick their day off, and today's
// slot follows the live suggestion (which reacts to recovery, readiness and
// check-ins) rather than the raw template.
export function rollingPlan(sessions, model, sessionsPerWeek, goals, profile, suggestion = null) {
  const level = experienceLevel(profile)
  const n = clamp(sessionsPerWeek, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)
  const trainingDays = Math.min(n, MAX_TRAINING_DAYS)
  const doubles = n - trainingDays
  const pos = cyclePosition(sessions)
  const goal = primaryGoal(goals)
  const emphasis = goalPhase(goals) ? null : goalEmphasis(goals)

  // Which weekdays are training days. Stated days win; otherwise the sessions
  // are spread evenly across the week so the plan still lands on real dates.
  const prefs = Array.isArray(profile?.preferred_days)
    ? [...new Set(profile.preferred_days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b)
    : null
  const weekdaysKnown = !!(prefs && prefs.length >= trainingDays)
  const daySlots = weekdaysKnown
    ? prefs.slice(0, trainingDays)
    : [...spreadPositions(7, trainingDays)].sort((a, b) => a - b).map((i) => i + 1)

  const doubleSlots = [...spreadPositions(trainingDays, doubles)].sort((a, b) => a - b)

  // Sessions logged in the window, by date.
  const today = todayISO()
  const byDate = new Map()
  for (const s of sessions) {
    if (s.date < today) continue
    if (!byDate.has(s.date)) byDate.set(s.date, [])
    byDate.get(s.date).push(s)
  }

  const weekCache = new Map()
  const weekOf = (wk) => {
    if (!weekCache.has(wk)) {
      weekCache.set(wk, weekKeys(pos, goal, emphasis, model, trainingDays, wk, level))
    }
    return weekCache.get(wk)
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = []
  let nextMarked = false
  for (let off = 0; off < 7; off += 1) {
    const d = addDays(new Date(), off)
    const iso = format(d, 'yyyy-MM-dd')
    const weekday = ((d.getDay() + 6) % 7) + 1 // ISO 1..7
    const wk = Math.floor(differenceInCalendarDays(d, weekStart) / 7)
    const week = weekOf(wk)
    const slotIdx = daySlots.indexOf(weekday)
    // A deload week hands some of its training slots back as rest, so a slot
    // with no key is a rest day even though it is one of your training days.
    const slotKey = slotIdx >= 0 ? week.keys[slotIdx] : null
    const isTraining = !!slotKey
    const logged = byDate.get(iso) || []
    const isToday = off === 0

    // Today shows what the coach actually says today, not the raw template -
    // that is where check-ins and recovery bend the plan.
    let key = slotKey
    let adjusted = false
    if (isToday && isTraining && suggestion && !logged.length) {
      adjusted = suggestion.key !== key
      key = suggestion.key
    }

    const di = doubleSlots.indexOf(slotIdx)
    // No doubles in a deload or taper week - both cut total work, and a taper
    // that keeps its doubles is not a taper.
    const secondKey =
      isTraining && di >= 0 && !week.deload && !week.taper
        ? SECOND_SESSION_TYPES[di % SECOND_SESSION_TYPES.length]
        : null

    const next = !nextMarked && isTraining && !logged.length
    if (next) nextMarked = true

    days.push({
      date: iso,
      weekday,
      isToday,
      rest: !isTraining,
      key,
      type: key ? SESSION_TYPES[key] : null,
      adjusted,
      discipline: isTraining && week.disciplines ? week.disciplines[slotIdx] : null,
      second: secondKey ? { key: secondKey, type: SESSION_TYPES[secondKey] } : null,
      logged,
      next,
      deload: week.deload,
      taper: week.taper,
      // A real session at reduced volume: same intensity, less of it. True in
      // a taper week (every session) and in a deload week for the quality
      // session it keeps. The mobility/easy slots are already light.
      reduced:
        (week.taper || week.deload) && !!key && key !== 'mobility' && key !== 'deload',
      durationMult: week.taper
        ? PHASE_DURATION.taper
        : week.deload
          ? PHASE_DURATION.deload
          : 1,
      phaseLabel: week.phaseLabel,
      // What the week reads as on a timeline. A deload week keeps its phase
      // label (weeks-to-goal still says "Power") but must not be treated as
      // the same block - comparing phase labels alone is how a deload week
      // once appeared with no divider and no explanation at all.
      blockLabel: week.deload ? 'Deload' : week.phaseLabel,
    })
  }

  // Smallest gap between consecutive hard finger days inside the window.
  let minHardGap = null
  const hardIdx = days
    .map((d, i) => (d.type?.fingerCost === 'high' ? i : -1))
    .filter((i) => i >= 0)
  if (hardIdx.length >= 2) {
    minHardGap = Math.min(...hardIdx.slice(1).map((v, i) => v - hardIdx[i]))
  }

  // Where the block changes inside the window, for a divider row in the UI.
  const phaseChange = days.find((d, i) => i > 0 && d.blockLabel !== days[0].blockLabel) || null

  return Object.assign(days, {
    trainingDays,
    restDays: 7 - trainingDays,
    doubles,
    sessions: n,
    weekdaysKnown,
    minHardGap,
    deloadNow: days[0]?.deload || false,
    phaseChange,
  })
}

// ---------------------------------------------------------------------------
// exercise selection
// ---------------------------------------------------------------------------

const TYPE_EXERCISES = {
  compSim: ['C1', 'C4', 'C3', 'C5', 'C6', 'C2'],
  limit: ['B8', 'B5', 'K1'],
  fingerStrength: ['F1', 'F6', 'F2', 'F7'],
  fingerMaintenance: ['F4', 'F7'],
  power: ['B10', 'F3', 'B5', 'B12'],
  powerEndurance: ['B3', 'B4', 'B1', 'B2', 'K4', 'K5', 'K6'],
  volume: ['B9', 'B11', 'C2', 'K7', 'B2'],
  aerobic: ['K2', 'B6'],
  technique: ['B7', 'B13', 'B14', 'B12', 'W1', 'B6', 'K2'],
  antagonist: ['S12', 'S15', 'S10', 'S5', 'S6'],
  mobility: ['T1', 'T2', 'T3', 'T4', 'T5'],
  mental: ['M1', 'M3', 'M2', 'M4', 'K8'],
  // Easy movement, not a stretching session: enough climbing to stay sharp,
  // nowhere near enough to add fatigue.
  deload: ['B6', 'B13', 'K2', 'B7'],
}

// Under-18 variety rule. NKF's restriction for youth is against a *one-sided
// focus*, not against intensity, so the enforceable version is a cap on how
// often the same kind of session recurs. Two of any one session category in a
// rolling 7 days is the cap.
const YOUTH_CATEGORY_CAP = 2

function categoryOverused(sessions, typeKey, discipline) {
  const { sessionCat } = gridFor(typeKey, discipline)
  const today = new Date()
  let n = 0
  for (const s of sessions) {
    const ago = differenceInCalendarDays(today, asDate(s.date))
    if (ago < 0 || ago >= 7) continue
    const ex = EXERCISE_MAP[s.extra?.coach?.exercise]
    if (ex?.sessionCat === sessionCat) n += 1
  }
  return n >= YOUTH_CATEGORY_CAP
}

// "80-90% of max" as kilos on a hangboard today, including the assisted case.
function hangPrescription(exercise, profile, tests) {
  const int = exercise?.intensity
  if (!int || int.anchor !== 'pctMaxTotal') return null
  const grip = int.grip && int.grip !== 'rotating' ? int.grip : 'halfcrimp'
  const max = maxTotalFor(profile, tests, grip)
  if (!max.kg) {
    return { blocked: true, reason: max.reason || 'no-test', pct: int }
  }
  if (max.stale) return { blocked: true, reason: 'stale', weeks: max.weeks, pct: int }
  const p = prescribeHang(int, max.kg, Number(profile?.bodyweight_kg) || 0)
  return p ? { ...p, grip, edge_mm: int.edge_mm ?? max.edge_mm, derived: max.derived } : null
}

export function pickExercises(typeKey, profile, rotate = 0, discipline = null, style = null, ctx = {}) {
  const {
    age = null, yearsClimbing = null, injuredRegions = [],
    tier = null, sessionCat = null,
  } = ctx
  // Prefer the grid cell when one is given, falling back to the type's own
  // curated ordering. The grid is what makes a tier reduction possible at all.
  let list = sessionCat ? exercisesAt(sessionCat, tier ?? 3) : []
  if (!list.length) {
    const ids = TYPE_EXERCISES[typeKey] || []
    list = ids.map((id) => EXERCISE_MAP[id]).filter(Boolean)
  }
  list = availableExercises(list, profile, discipline)

  // Cap at the requested tier - but never to nothing. Some categories have no
  // low-tier members at all (everything in hardBoulder is tier 4-5, because a
  // hard-moves session is hard by definition), and an empty prescription is
  // worse than one the caller has to caveat. When the cap empties the list,
  // fall back to the gentlest thing the category actually has.
  if (tier != null) {
    const capped = list.filter((e) => e.tier <= tier + 1)
    if (capped.length) {
      list = capped
    } else if (list.length) {
      const floor = Math.min(...list.map((e) => e.tier))
      list = list.filter((e) => e.tier === floor)
    }
  }

  // Rule 0a: enough years under load, at any age. Campus and maximal finger
  // loading both carry a minimum; tendon adaptation is measured in years.
  if (yearsClimbing != null) {
    const enough = list.filter((e) => yearsClimbing >= (e.minYearsClimbing || 0))
    if (enough.length) list = enough
  }

  // Rules 0b/0c: gate on what the exercise actually does, not on the session
  // type it sits under - campus work surfaces under several type keys. 'blocked'
  // is removed outright; 'allowed_reduced' stays and is prescribed at reduced
  // parameters (see youthAdjust).
  if (age != null && age < 18) list = list.filter((e) => e.youth !== 'blocked')

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
  if (typeKey === 'mobility') return list

  const start = rotate % list.length
  let ordered = [...list.slice(start), ...list.slice(0, start)]
  if (style) {
    const rank = (e) => (e.style === style ? 0 : !e.style ? 1 : 2)
    ordered = [...ordered].sort((a, b) => rank(a) - rank(b))
  }
  // Tier fit wins over rotation. Rotating for variety is right, but it must not
  // reorder a tier-1 maintenance session ahead of the tier-5 session that was
  // actually prescribed - JS sort is stable, so this keeps the rotation as the
  // tie-break within equally-appropriate exercises.
  if (tier != null) {
    ordered = [...ordered].sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))
  }
  // Rule 0c: an 'allowed_reduced' exercise is prescribed, but capped.
  if (age != null && age < 18) ordered = ordered.map(youthAdjust)
  return ordered.slice(0, 3)
}

// Rule 0c. NKF: controlled finger training within a sensible programme is the
// safer option for a growing climber, begun on large holds and increased
// gradually. So it is prescribed - at 80% of max rather than 90%, and a set
// short.
export function youthAdjust(ex) {
  if (ex.youth !== 'allowed_reduced') return ex
  const out = { ...ex, youthReduced: true }
  if (ex.intensity?.anchor === 'pctMaxTotal') {
    out.intensity = { ...ex.intensity, hi: Math.min(ex.intensity.hi, 0.8) }
    out.load = `${Math.round((ex.intensity.lo || 0.7) * 100)}–80% of max total load (under-18 cap)`
  }
  const sets = Number(String(ex.sets ?? '').match(/\d+/)?.[0])
  if (Number.isFinite(sets) && sets > 1) out.sets = String(sets - 1)
  return out
}

const CONTEXT_LABEL = { outdoor: 'outdoor', indoor: 'indoor', board: 'on the board' }
const BOARD_LABEL = {
  kilter: 'on the Kilter', moon: 'on the Moonboard', tension: 'on the Tension board',
  spray: 'on the spray wall', other: 'on the board',
}

export function gradeRange(typeKey, limits, exercise, tierDrop = 0) {
  const type = SESSION_TYPES[typeKey]
  if (!type?.grades) return null
  // A soft tier reduction has to move the grades too, or the card says
  // "easier" while still quoting limit-grade problems.
  const shift = -Math.max(0, tierDrop)

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
  const low = gradeAt(limit, lo + shift)
  const high = gradeAt(limit, hi + shift)
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
// the block timeline
// ---------------------------------------------------------------------------
// Where you are and what comes next, as consecutive blocks. With a dated goal
// this walks every week from now to the date - including the deloads that
// interrupt a phase at 4-week boundaries, which is exactly the part that looks
// like a bug when you can't see it coming. Without a goal it is the 4-week
// cycle. Dates are ISO; `current` marks the block containing today.
export function phaseTimeline(goals, sessions, model) {
  const gp = goalPhase(goals)
  const today = todayISO()

  if (gp) {
    // Walk calendar (ISO) weeks, judging each by the days remaining at today
    // + wk*7 - the exact arithmetic the weekly plan uses. Anchoring blocks to
    // the goal date instead put block boundaries mid-week, so the timeline
    // said "deload from Sunday" while the plan trained that Sunday.
    const goalISO = gp.goal.target_date
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const blocks = []
    for (let wk = 0; ; wk += 1) {
      const from = format(addDays(weekStart, wk * 7), 'yyyy-MM-dd')
      if (from > goalISO) break
      const days = gp.days - wk * 7
      const weeks = Math.max(0, Math.floor(days / 7))
      const phase =
        GOAL_PHASES.find((p) => weeks >= p.minWeeks) || GOAL_PHASES[GOAL_PHASES.length - 1]
      const deload = isGoalDeloadWeek(gp.goal, weeks)
      const label = deload ? 'Deload' : phase.label
      const weekEnd = format(addDays(weekStart, wk * 7 + 6), 'yyyy-MM-dd')
      const to = weekEnd < goalISO ? weekEnd : goalISO
      const prev = blocks[blocks.length - 1]
      if (prev && prev.label === label) {
        prev.to = to
        prev.weeks += 1
      } else {
        blocks.push({
          key: deload ? 'deload' : phase.key,
          label,
          deload,
          emoji: deload ? SESSION_TYPES.deload.emoji : SESSION_TYPES[phase.hard].emoji,
          note: deload ? 'Planned recovery before the next block.' : phase.note,
          from,
          to,
          weeks: 1,
        })
      }
    }
    for (const b of blocks) {
      b.current = b.from <= today && today <= b.to
      b.past = b.to < today
    }
    return { mode: 'goal', goal: gp.goal, blocks }
  }

  // No dated goal: the repeating 4-week cycle, current week marked.
  const pos = cyclePosition(sessions)
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const blocks = []
  for (let w = 0; w < 4; w += 1) {
    const from = format(addDays(weekStart, (w - pos.blockWeek) * 7), 'yyyy-MM-dd')
    const to = format(addDays(weekStart, (w - pos.blockWeek) * 7 + 6), 'yyyy-MM-dd')
    const deload = w === 3
    const block = LINEAR_BLOCK[w]
    blocks.push({
      key: deload ? 'deload' : block.key,
      label:
        model === 'linear' ? block.label : deload ? 'Deload' : `Mixed week ${w + 1}`,
      deload,
      emoji: deload ? SESSION_TYPES.deload.emoji : SESSION_TYPES[block.hard].emoji,
      note: null,
      from,
      to,
      weeks: 1,
      current: w === pos.blockWeek,
      past: w < pos.blockWeek,
    })
  }
  return { mode: 'cycle', goal: null, blocks }
}

// ---------------------------------------------------------------------------
// the daily decision
// ---------------------------------------------------------------------------

export function suggestSession(sessions, ctx) {
  const {
    recovery, readinessState, trend, monotony, injuries, problems, limits,
    model, daysPerWeek, goals, profile, level, fingerTests = [], pick = null,
  } = ctx
  const plan = plannedType(sessions, model, daysPerWeek, goals, level)
  const planned = SESSION_TYPES[plan.key]
  const reasons = []
  let key = plan.key
  let tone = 'go'
  let headline = 'Following the plan'
  // Soft rules reduce the tier of the same session rather than swapping it for
  // a different one. They stack, and floor at 1. This is the single change
  // that stops the plan contradicting itself: a power-endurance day on tired
  // fingers becomes *easier power-endurance*, not volume bouldering.
  let tierDrop = 0
  const softReasons = []

  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null
  const youth = age != null && age < 18
  // 18 is a chronological proxy for skeletal maturity, and late maturers can
  // still have open growth plates past it. 18-20 is a note, not a restriction.
  const youthWatch = age != null && age >= 18 && age <= 20
  const yearsClimbing = profile?.climbing_since
    ? Math.max(0, new Date().getFullYear() - Number(profile.climbing_since))
    : null

  const openInjuries = (injuries || []).filter((i) => !i.ended)
  const injuredRegions = [
    ...new Set([
      ...openInjuries.map((i) => i.region).filter(Boolean),
      ...(problems || []).map((p) => p.area),
    ]),
  ]
  const substantial = (problems || []).filter((p) => p.substantial)

  // --- rule 0: youth ------------------------------------------------------
  // NOT a blanket block on fingerStrength/power/limit. The Norwegian Climbing
  // Federation's current position is that *controlled* finger training loads
  // the fingers less than finger-heavy bouldering does, and it no longer
  // advises against dead-hangs for growing athletes; what it does still advise
  // against is campus training and a one-sided focus. Blocking limit and
  // finger strength outright refused a competition junior essentially their
  // whole programme and offered volume bouldering during a championship
  // build-up. Gating happens per *exercise* (see pickExercises) on
  // `youth`/`minYearsClimbing`, plus the variety rule below.
  const varietyCapped = youth && categoryOverused(sessions, plan.key, plan.discipline)
  if (varietyCapped) {
    key = 'technique'
    reasons.push('Under 18 — varying the stimulus (max 2 of a kind per week)')
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
  } else if (fingersBusy && cost === 'high') {
    // Still inside the rebuild window and the plan wants a maximal finger day:
    // that is a category change, not a tier change.
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
  } else if (plan.deload) {
    // Not an easy day - a lighter *week*. The session itself keeps its
    // intensity, which is what stops a deload from being a detraining week.
    tone = 'moderate'
    headline = 'Deload week'
    reasons.push(plan.gp ? 'Scheduled in the countdown' : 'Week 4 of the cycle')
    reasons.push('Half the volume, same intensity')
  } else {
    // --- soft rules: same session, lower tier. They stack. ----------------
    if (fingersBusy && anyFingerCost) {
      tierDrop += 2
      softReasons.push(
        recovery.daysSinceMax === 0
          ? 'Fingers loaded today'
          : `Fingers loaded ${recovery.daysSinceMax}d ago`,
      )
      tone = 'moderate'
    }
    if (recovery.rampFlag && anyFingerCost) {
      tierDrop += 1
      softReasons.push(`${recovery.days7} hard finger days this week`)
      tone = 'moderate'
    }
    if (recovery.chronicLevel === 'high' && anyFingerCost) {
      tierDrop += 1
      softReasons.push(`${recovery.days28} hard finger days in 28d`)
      tone = 'moderate'
    }
    if (trend?.enough && trend.key === 'sharp' && anyFingerCost) {
      tierDrop += 1
      softReasons.push(`Load ${trend.pctLabel} of normal`)
      tone = 'moderate'
    }

    if (tierDrop > 0) {
      headline = 'Same session, easier'
      reasons.push(...softReasons)
    } else {
      if (recovery.key === 'unknown') {
        reasons.push('No finger history yet')
      } else if (recovery.daysSinceMax != null) {
        reasons.push(`Fingers recovered · ${recovery.daysSinceMax}d`)
      } else {
        reasons.push('Fingers fresh')
      }
    }
    if (readinessState?.enough) reasons.push(`Readiness ${readinessState.index}`)
  }

  if (monotony?.enough && monotony.flag && key !== 'deload') {
    reasons.push('Monotony high — vary the stimulus')
  }

  const discipline = plan.discipline || plan.emphasis?.goal?.discipline || null
  const style = plan.gp?.style || plan.emphasis?.goal?.style || null

  // Resolve to a grid cell, then apply the accumulated soft reduction.
  const base = gridFor(key, discipline)
  const tier = clamp(base.tier - tierDrop, 1, 5)
  const offered = pickExercises(key, profile, plan.pos.week, discipline, style, {
    age,
    yearsClimbing,
    injuredRegions,
    tier,
    sessionCat: base.sessionCat,
  })

  // You can promote one of the alternatives to today's pick. It only reorders
  // the list the rules already produced - everything downstream (grades, the
  // hang prescription, the dashboard card, the log form) reads position 0, so
  // a swap stays consistent without a second notion of "the session".
  const at = pick ? offered.findIndex((e) => e.id === pick) : -1
  const exercises = at > 0 ? [offered[at], ...offered.filter((_, i) => i !== at)] : offered

  return {
    type: SESSION_TYPES[key],
    key,
    sessionCat: base.sessionCat,
    tier,
    tierDrop,
    plannedTier: base.tier,
    tone,
    headline,
    reasons,
    grades: gradeRange(key, limits, exercises[0], tierDrop),
    exercises,
    // Whose choice is on top, so the UI can offer to hand it back.
    pickedByYou: at > 0,
    coachPick: offered[0]?.id || null,
    // What "80-90% of max" actually means today, in kilos, including the
    // assisted case. Null when there is no usable max or no bodyweight.
    hang: hangPrescription(exercises[0], profile, fingerTests),
    emphasis: plan.emphasis || null,
    plannedKey: plan.key,
    plannedLabel: planned.label,
    adjusted: key !== plan.key,
    deloadWeek: !!plan.deload,
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
    wellness = [], ostrc = [], fingerTests = [], physicalTests = [], pick = null,
  } = opts
  const daysPerWeek = profile?.sessions_week
    ? clamp(profile.sessions_week, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)
    : clamp(opts.daysPerWeek || 3, MIN_SESSIONS_WEEK, MAX_SESSIONS_WEEK)

  const limits = buildLimits(sessions, profile)
  const level = experienceLevel(profile)
  const recovery = fingerRecovery(sessions, limits, profile, fingerTests)
  const trend = loadTrend(sessions)
  const monotony = monotonyStrain(sessions)
  const readinessState = readiness(sessions, wellness, icuWellness)
  const form = currentForm(sessions)
  // A test stopped because of pain is an event, not a missing value. It enters
  // the problem list like any reported problem rather than sitting in the
  // database as a blank cell - it is the single most informative thing the
  // battery can produce and the schema used to lose it.
  const aborts = painAborts(fingerTests, physicalTests, 14).map((t) => ({
    area: t.area,
    severity: 25,
    substantial: true,
    fromTest: t.label,
    week_start: t.tested_on,
  }))
  const problems = [...activeProblems(ostrc), ...aborts]

  const suggestion = suggestSession(sessions, {
    recovery, readinessState, trend, monotony, injuries, problems, limits,
    model, daysPerWeek, goals, profile, level, fingerTests, pick,
  })

  return {
    recovery, trend, monotony, readiness: readinessState, form, suggestion, limits,
    problems, daysPerWeek, level, goalPhase: suggestion.goalPhase,
    hangTest: hangTestAge(profile),
    maxTotal: maxTotalFor(profile, fingerTests),
    asymmetry: asymmetries(fingerTests, physicalTests),
  }
}
