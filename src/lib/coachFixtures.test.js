import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'
import {
  coachReadout,
  fingerDose,
  buildLimits,
  readiness,
  readinessSeries,
  readinessGateHint,
  MIN_EFFECTIVE_WEIGHT,
  monotonyStrain,
  skippedWeekdays,
} from './coach'
import { ALL_EXERCISES } from './exercises'

// Golden fixtures: whole synthetic athletes, snapshotted end to end.
//
// Every bug in the last review round was found by writing a document about the
// app rather than by running it, which is an expensive way to find bugs and
// does not repeat. The engine is a pure function from (sessions, profile,
// wellness, tests) to (signals, prescription), so a fixture per athlete turns
// "did that constant change anything" into a diff.
//
// Snapshots are deliberately a *summary* of the readout, not the whole object:
// a snapshot nobody can read is a snapshot nobody checks.

const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

const hangSet = (kg, seconds = 10, edge = 20) => ({
  load_total_kg: kg,
  time: seconds,
  edge,
})

// A hangboard session: `sets` sets of `reps` reps at `kg` total.
function hangSession(date, { kg = 85, sets = 4, reps = 1, seconds = 10, grip = 'halfcrimp', hands = 'two' } = {}) {
  return {
    date,
    sport: 'finger',
    duration: 40,
    rpe: 6,
    extra: {
      schema_version: 4,
      finger: {
        hangboard: [
          { grip, hands, reps, sets: Array.from({ length: sets }, () => hangSet(kg, seconds)) },
        ],
      },
    },
  }
}

// An ordinary indoor bouldering session. `fingerRpe` 6 is the app's own anchor
// for "small holds, working hard", which is what most sessions are.
function indoorBoulder(date, { fingerRpe = 6, rpe = 7, duration = 90, grades = [], attempts = null } = {}) {
  return {
    date,
    sport: 'climbing',
    subtype: 'bouldering',
    location: 'indoor',
    duration,
    rpe,
    extra: {
      schema_version: 4,
      rpe_finger: fingerRpe,
      pump: 3,
      grades,
      ...(attempts == null ? {} : { near_limit_attempts: attempts }),
    },
  }
}

function outdoorBoulder(date, routes) {
  return {
    date,
    sport: 'climbing',
    subtype: 'bouldering',
    location: 'outdoor',
    duration: 180,
    rpe: 8,
    extra: { schema_version: 4, rpe_finger: 8 },
    routes,
  }
}

function ropeSession(date, { rpe = 7, fingerRpe = 5 } = {}) {
  return {
    date,
    sport: 'climbing',
    subtype: 'sport',
    location: 'indoor',
    duration: 120,
    rpe,
    extra: { schema_version: 4, rpe_finger: fingerRpe, pump: 4 },
  }
}

// A legacy hangboard row: added weight, no total, no schema version.
function legacyHangSession(date, added = 20) {
  return {
    date,
    sport: 'finger',
    duration: 35,
    rpe: 6,
    extra: { finger: { hangboard: [{ hands: 'two', reps: 1, sets: [{ weight: added, time: 10, edge: 20 }] }] } },
  }
}

const maxHangTest = (weeksAgo = 2, value = 100) => ({
  protocol: 'total_load',
  grip: 'halfcrimp',
  hands: 'two',
  value,
  tested_on: iso(weeksAgo * 7),
})

// Wellness rows for the last `days` days around a fixed level.
//
// The wobble is not decoration. Answering an identical 3 every day gives a
// baseline with no spread, every z-score comes back null, and the whole fixture
// suite quietly stopped exercising readiness at all. Its period is deliberately
// coprime with 7 so that consecutive weeks are not identical either.
const WOBBLE = [0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1]
const lvl = (v, w) => Math.max(1, Math.min(5, v + w))

function wellness(days, { sleep = 3, fatigue = 3, soreness = 3, stress = 3, every = 1, flat = false } = {}) {
  const out = []
  for (let d = days - 1; d >= 0; d -= 1) {
    if (d % every !== 0) continue
    const w = flat ? 0 : WOBBLE[d % WOBBLE.length]
    out.push({
      date: iso(d),
      sleep: lvl(sleep, w),
      fatigue: lvl(fatigue, w),
      // Opposite sign, so soreness and fatigue are not the same column twice.
      soreness: lvl(soreness, -w),
      stress: lvl(stress, w),
    })
  }
  return out
}

// Sessions on a weekly pattern of ISO weekdays, for `weeks` back.
function weekly(weekdays, weeks, make) {
  const out = []
  for (let w = 0; w < weeks; w += 1) {
    for (const wd of weekdays) {
      const daysAgo = w * 7 + ((new Date().getDay() + 6) % 7) - (wd - 1)
      if (daysAgo < 0) continue
      out.push(make(iso(daysAgo), w, wd))
    }
  }
  return out
}

// What we snapshot. Small enough to read in a diff, wide enough to catch a
// constant change anywhere in the engine.
function summarise(readout) {
  const s = readout.suggestion
  return {
    session: `${s.key} · tier ${s.tier}${s.tierDrop ? ` (eased ${s.tierDrop})` : ''}`,
    headline: s.headline,
    tone: s.tone,
    planned: s.plannedKey,
    grades: s.grades?.text ?? null,
    hangKg: s.hang?.totalText ?? (s.hang?.blocked ? `blocked: ${s.hang.reason}` : null),
    exercises: s.exercises.map((e) => e.id),
    reasons: s.reasons.map((r) => `${r.changed ? '*' : '-'} ${r.text}`),
    recovery: {
      state: readout.recovery.key,
      days7: readout.recovery.days7,
      days28: readout.recovery.days28,
      chronic: readout.recovery.chronicLevel,
      sustainedWeeks: readout.recovery.sustainedWeeks,
    },
    readiness: readout.readiness.enough
      ? { index: readout.readiness.index, label: readout.readiness.label, sustained: readout.readiness.sustained.map((x) => x.key) }
      : { gated: readout.readiness.reason },
    trend: readout.trend.enough ? readout.trend.key : `gated: ${readout.trend.reason}`,
    monotony: readout.monotony.enough
      ? { value: Math.round(readout.monotony.monotony * 10) / 10, flag: readout.monotony.flag }
      : { gated: readout.monotony.reason },
    level: readout.level.label,
  }
}

const PROFILES = {
  indoor3: {
    sessions_week: 3,
    max_boulder_indoor: '7A',
    flash_boulder: '6C',
    has_hangboard: true,
    has_gym: true,
    bodyweight_kg: 70,
    climbing_since: new Date().getFullYear() - 6,
    preferred_days: [1, 3, 6],
  },
  junior: {
    sessions_week: 4,
    max_boulder_indoor: '7B',
    has_hangboard: true,
    has_spraywall: true,
    has_gym: true,
    bodyweight_kg: 55,
    birth_year: new Date().getFullYear() - 16,
    climbing_since: new Date().getFullYear() - 4,
    focus: 'boulder',
  },
  roper: {
    sessions_week: 4,
    max_route_indoor: '7b',
    max_route_outdoor: '7a+',
    has_hangboard: true,
    has_gym: true,
    bodyweight_kg: 65,
    climbing_since: new Date().getFullYear() - 9,
    focus: 'route',
  },
  elite: {
    sessions_week: 6,
    max_boulder_outdoor: '8B',
    max_boulder_board: '8A+',
    board_type: 'kilter',
    has_hangboard: true,
    has_campus: true,
    has_spraywall: true,
    has_gym: true,
    bodyweight_kg: 72,
    climbing_since: new Date().getFullYear() - 14,
  },
}

const FIXTURES = [
  {
    name: 'three sessions a week indoors, ordinary finger RPE',
    sessions: weekly([1, 3, 6], 10, (d) => indoorBoulder(d, { grades: ['6C', '7A'] })),
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'same climber, but every session is genuinely hard on the fingers',
    sessions: weekly([1, 3, 6], 10, (d) => indoorBoulder(d, { fingerRpe: 8, rpe: 8 })),
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'hangboard twice a week plus climbing, tested max',
    sessions: [
      ...weekly([1, 4], 8, (d) => hangSession(d)),
      ...weekly([2, 6], 8, (d) => indoorBoulder(d)),
    ],
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'maximal hangboard session yesterday',
    sessions: [hangSession(iso(1), { kg: 95 }), ...weekly([3, 6], 6, (d) => indoorBoulder(d))],
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'junior in a competition build-up',
    sessions: weekly([1, 2, 4, 6], 8, (d, w, wd) =>
      wd % 2 === 0 ? indoorBoulder(d, { fingerRpe: 7 }) : hangSession(d, { kg: 45 }),
    ),
    profile: PROFILES.junior,
    goals: [
      {
        id: 'g1',
        title: 'NM boulder',
        kind: 'competition',
        discipline: 'boulder',
        style: 'comp',
        target_date: iso(-42),
        created_at: iso(120),
      },
    ],
    wellness: wellness(60),
    tests: [maxHangTest(3, 60)],
  },
  {
    name: 'rope climber with a trip in ten weeks',
    sessions: weekly([1, 3, 5, 6], 10, (d) => ropeSession(d)),
    profile: PROFILES.roper,
    goals: [
      {
        id: 'g2',
        title: 'Rodellar',
        kind: 'trip',
        discipline: 'rope',
        style: 'outdoor',
        target_date: iso(-70),
        created_at: iso(200),
      },
    ],
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'no profile at all',
    sessions: weekly([2, 5], 6, (d) => indoorBoulder(d)),
    profile: null,
    wellness: [],
    tests: [],
  },
  {
    name: 'profile but no finger test',
    sessions: weekly([1, 4], 6, (d) => hangSession(d)),
    profile: { ...PROFILES.indoor3, bodyweight_kg: null },
    wellness: wellness(60),
    tests: [],
  },
  {
    name: 'legacy added-weight sets and no bodyweight',
    sessions: weekly([1, 4], 6, (d) => legacyHangSession(d)),
    profile: { ...PROFILES.indoor3, bodyweight_kg: null },
    wellness: wellness(60),
    tests: [],
  },
  {
    name: 'legacy added-weight sets with a bodyweight',
    sessions: weekly([1, 4], 6, (d) => legacyHangSession(d)),
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [],
  },
  {
    name: 'one wellness entry ever',
    sessions: weekly([1, 3, 6], 8, (d) => indoorBoulder(d)),
    profile: PROFILES.indoor3,
    wellness: [{ date: iso(0), sleep: 2, fatigue: 4, soreness: 4, stress: 4 }],
    tests: [maxHangTest()],
  },
  {
    name: 'two months of poor sleep and high stress',
    sessions: weekly([1, 3, 6], 10, (d) => indoorBoulder(d)),
    profile: PROFILES.indoor3,
    wellness: wellness(60, { sleep: 2, fatigue: 4, soreness: 4, stress: 4 }),
    tests: [maxHangTest()],
  },
  {
    name: 'substantial OSTRC finger problem this week',
    sessions: weekly([1, 3, 6], 8, (d) => indoorBoulder(d)),
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    ostrc: [{ week_start: format(subDays(new Date(), new Date().getDay() === 0 ? 6 : new Date().getDay() - 1), 'yyyy-MM-dd'), area: 'fingers', q1: 17, q2: 13, q3: 13, q4: 13 }],
    tests: [maxHangTest()],
  },
  {
    name: 'open shoulder injury',
    sessions: weekly([1, 3, 6], 8, (d) => indoorBoulder(d)),
    profile: PROFILES.indoor3,
    injuries: [{ id: 'i1', region: 'shoulder', started: iso(20), ended: null }],
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'test stopped because of pain last week',
    sessions: weekly([1, 3, 6], 8, (d) => indoorBoulder(d)),
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest(), { protocol: 'total_load', grip: 'halfcrimp', hands: 'one', value: null, aborted_reason: 'pain', tested_on: iso(5) }],
  },
  {
    name: 'elite boulderer, six days a week, campus available',
    sessions: weekly([1, 2, 3, 4, 5, 6], 10, (d, w, wd) =>
      wd % 3 === 0 ? hangSession(d, { kg: 100 }) : indoorBoulder(d, { fingerRpe: 8, rpe: 9 }),
    ),
    profile: PROFILES.elite,
    wellness: wellness(60),
    tests: [maxHangTest(1, 115)],
  },
  {
    name: 'outdoor session with near-limit attempts logged',
    sessions: [
      outdoorBoulder(iso(2), [
        { grade: '7A', send_type: 'attempt', attempts: 4 },
        { grade: '6C', send_type: 'redpoint', attempts: 2 },
      ]),
      ...weekly([1, 5], 6, (d) => indoorBoulder(d)),
    ],
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'indoor session with near-limit attempts logged',
    sessions: [
      indoorBoulder(iso(2), { attempts: 5, fingerRpe: 7, rpe: 8 }),
      ...weekly([1, 5], 6, (d) => indoorBoulder(d)),
    ],
    profile: PROFILES.indoor3,
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'trains six days a week at the same load every day',
    sessions: weekly([1, 2, 3, 4, 5, 6], 8, (d) => indoorBoulder(d, { duration: 90, rpe: 7, fingerRpe: 5 })),
    profile: { ...PROFILES.indoor3, sessions_week: 6, preferred_days: [1, 2, 3, 4, 5, 6] },
    wellness: wellness(60),
    tests: [maxHangTest()],
  },
  {
    name: 'nothing logged at all',
    sessions: [],
    profile: PROFILES.indoor3,
    wellness: [],
    tests: [],
  },
]

describe('golden fixtures', () => {
  for (const f of FIXTURES) {
    it(f.name, () => {
      const readout = coachReadout(f.sessions, f.injuries || [], null, {
        profile: f.profile,
        goals: f.goals || [],
        wellness: f.wellness || [],
        ostrc: f.ostrc || [],
        fingerTests: f.tests || [],
        physicalTests: f.physicalTests || [],
      })
      expect(summarise(readout)).toMatchSnapshot()
    })
  }
})

// ---------------------------------------------------------------------------
// the dose fit
// ---------------------------------------------------------------------------
// The per-set coefficients are fitted against the library's own expectedDose
// values, so the library is the test: if a coefficient moves and these stop
// reproducing, the fit is gone.

describe('dose calibration', () => {
  const profile = { bodyweight_kg: 70 }
  const tests = [maxHangTest(1, 100)]
  const limits = buildLimits([], profile)
  const dose = (opts) => fingerDose(hangSession(iso(0), opts), limits, profile, tests).dose

  it('reproduces the library expectedDose for the prescribed finger sessions', () => {
    // F1 max hangs: 4 x 1 x 10 s at 85% -> expectedDose 40
    expect(dose({ kg: 85, sets: 4, reps: 1, seconds: 10 })).toBe(40)
    // F6 grip variety: 4 x 1 x 10 s at 82.5% -> expectedDose 35
    expect(dose({ kg: 82.5, sets: 4, reps: 1, seconds: 10 })).toBe(36)
    // F2 repeaters: 5 x 7 x 7 s at 60% -> expectedDose 32
    expect(dose({ kg: 60, sets: 5, reps: 7, seconds: 7 })).toBe(27)
  })

  it('orders a max-hang session above a long repeater session', () => {
    const maxHangs = dose({ kg: 85, sets: 4, reps: 1, seconds: 10 })
    const repeaters = dose({ kg: 60, sets: 5, reps: 7, seconds: 7 })
    expect(maxHangs).toBeGreaterThan(repeaters)
  })

  it('still ranks more volume and more load higher', () => {
    expect(dose({ kg: 60, sets: 8, reps: 7, seconds: 7 })).toBeGreaterThan(
      dose({ kg: 60, sets: 5, reps: 7, seconds: 7 }),
    )
    expect(dose({ kg: 70, sets: 5, reps: 7, seconds: 7 })).toBeGreaterThan(
      dose({ kg: 60, sets: 5, reps: 7, seconds: 7 }),
    )
  })

  it('keeps the maintenance session well below the hard threshold', () => {
    expect(dose({ kg: 45, sets: 2, reps: 6, seconds: 10 })).toBeLessThan(15)
  })
})

// ---------------------------------------------------------------------------
// properties
// ---------------------------------------------------------------------------

describe('dose properties', () => {
  const profile = { bodyweight_kg: 70 }
  const tests = [maxHangTest(1, 100)]
  const limits = buildLimits([], profile)
  const dose = (opts) => fingerDose(hangSession(iso(0), opts), limits, profile, tests).dose
  const tierIndex = (opts) =>
    ['none', 'light', 'hard', 'maximal'].indexOf(
      fingerDose(hangSession(iso(0), opts), limits, profile, tests).tier,
    )

  it('is monotonically non-decreasing in load', () => {
    let prev = -1
    for (let kg = 30; kg <= 110; kg += 5) {
      const d = dose({ kg, sets: 4, reps: 1, seconds: 10 })
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })

  it('is monotonically non-decreasing in hang time', () => {
    let prev = -1
    for (let seconds = 3; seconds <= 20; seconds += 1) {
      const d = dose({ kg: 70, sets: 3, reps: 2, seconds })
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })

  it('is monotonically non-decreasing in reps and in sets', () => {
    let prev = -1
    for (let reps = 1; reps <= 10; reps += 1) {
      const d = dose({ kg: 70, sets: 3, reps, seconds: 7 })
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
    prev = -1
    for (let sets = 1; sets <= 10; sets += 1) {
      const d = dose({ kg: 70, sets, reps: 3, seconds: 7 })
      expect(d).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })

  it('never lowers the tier when load rises', () => {
    let prev = -1
    for (let kg = 30; kg <= 110; kg += 5) {
      const t = tierIndex({ kg, sets: 4, reps: 1, seconds: 10 })
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })
})

describe('readiness properties', () => {
  // Every subset of present signals: this is the shape most likely to produce
  // a NaN, because each missing input reweights the rest.
  const wellnessRows = wellness(60)
  const icuRows = Array.from({ length: 60 }, (_, i) => ({
    date: iso(59 - i),
    hrv: 60 + (i % 5),
    restingHR: 50 + (i % 3),
  }))
  const sessions = weekly([1, 3, 6], 10, (d) => indoorBoulder(d))

  const subsets = []
  for (let mask = 0; mask < 8; mask += 1) {
    subsets.push({
      wellness: mask & 1 ? wellnessRows : [],
      icu: mask & 2 ? icuRows : [],
      sessions: mask & 4 ? sessions : [],
    })
  }

  it('stays inside 0..100 and never NaN for every subset of inputs', () => {
    for (const s of subsets) {
      const r = readiness(s.sessions, s.wellness, s.icu)
      if (!r.enough) {
        expect(typeof r.reason).toBe('string')
        continue
      }
      expect(Number.isFinite(r.index)).toBe(true)
      expect(r.index).toBeGreaterThanOrEqual(0)
      expect(r.index).toBeLessThanOrEqual(100)
      for (const sig of r.signals) {
        expect(sig.z === null || Number.isFinite(sig.z)).toBe(true)
      }
    }
  })

  it('sees a sustained poor state that the z-scores cannot', () => {
    const bad = wellness(60, { sleep: 2, fatigue: 4, soreness: 4, stress: 4 })
    const r = readiness(sessions, bad, [])
    expect(r.enough).toBe(true)
    // The index is blind to it by construction: the baseline is equally bad.
    expect(r.index).toBeGreaterThan(38)
    // The absolute check is not.
    expect(r.sustained.map((s) => s.key).sort()).toEqual(['fatigue', 'sleep', 'soreness', 'stress'])
  })

  // The shipped bug this guards: with no check-ins and no intervals.icu, the
  // only signal left was form, it was re-weighted to the whole score, and a
  // normal training block walked the index down to 20 and parked it there. The
  // reading was "you are wrecked"; the evidence was "you have been training".
  it('does not score readiness from training load alone', () => {
    // A build: three sessions a week, then five, so form falls for weeks.
    const build = [
      ...weekly([1, 3, 6], 12, (d) => indoorBoulder(d)),
      ...weekly([2, 5], 3, (d) => indoorBoulder(d, { rpe: 8 })),
    ]
    const r = readiness(build, [], [])
    expect(r.enough).toBe(false)
    expect(r.reason).toBe('signals')
    // And it says how far off it is rather than "no data".
    expect(r.checkInDays).toBe(0)
    expect(readinessGateHint(r)).toMatch(/check in daily/i)

    // Every day of the chart, not just today: the old failure was a slide.
    for (const p of readinessSeries(build, [], [], 42)) expect(p.index).toBe(null)
  })

  it('reports how far along the check-ins are while the baseline builds', () => {
    const r = readiness(sessions, wellness(4), [])
    expect(r.enough).toBe(false)
    expect(r.checkInDays).toBe(4)
    // The four items are logged but unscorable, and the difference is visible:
    // the screens show "4 days logged", not "no data".
    for (const key of ['sleep', 'fatigue', 'soreness', 'stress']) {
      const sig = r.signals.find((s) => s.key === key)
      expect(sig.z).toBe(null)
      expect(sig.days).toBe(4)
    }
    expect(readinessGateHint(r)).toMatch(/4 check-ins/)
  })

  it('lets form colour the score but never run it', () => {
    const build = [
      ...weekly([1, 3, 6], 12, (d) => indoorBoulder(d)),
      ...weekly([2, 5], 3, (d) => indoorBoulder(d, { rpe: 8 })),
    ]
    const steady = wellness(60)
    const r = readiness(build, steady, [])
    expect(r.enough).toBe(true)
    // Form is at its cap and pulling down; the check-ins say an ordinary week.
    expect(r.signals.find((s) => s.key === 'form').z).toBeLessThan(0)
    expect(r.label).toBe('Normal')
  })

  it('still calls a genuinely bad week low', () => {
    const rows = wellness(60).map((r, i, all) =>
      i < all.length - 7 ? r : { ...r, sleep: 1, fatigue: 5, soreness: 5, stress: 5 },
    )
    const r = readiness(sessions, rows, [])
    expect(r.enough).toBe(true)
    expect(r.label).toBe('Low')
  })

  it('shrinks toward normal when most of the weight is missing', () => {
    // HRV alone, at its most extreme, is a fifth of the weight. Re-weighted to
    // 100% it would read 20 or 80; shrunk, it is an opinion the size of its
    // evidence.
    const collapse = Array.from({ length: 60 }, (_, i) => ({
      date: iso(59 - i),
      hrv: i < 53 ? 60 + (i % 5) : 30,
    }))
    const r = readiness(sessions, [], collapse)
    expect(r.enough).toBe(true)
    expect(r.coverage).toBeLessThan(MIN_EFFECTIVE_WEIGHT)
    expect(r.signals.find((s) => s.key === 'hrv').z).toBeLessThanOrEqual(-2)
    expect(r.index).toBeGreaterThan(38)
  })
})

describe('monotony properties', () => {
  it('is gated, not "steady", below five active days', () => {
    const three = weekly([1, 3, 6], 2, (d) => indoorBoulder(d))
    const r = monotonyStrain(three)
    expect(r.enough).toBe(false)
    expect(r.reason).toBe('frequency')
  })

  it('flags a week of identical sessions and not a week with contrast', () => {
    const flat = [1, 2, 3, 4, 5, 6].map((wd) =>
      indoorBoulder(iso(((new Date().getDay() + 6) % 7) - (wd - 1)), { duration: 90, rpe: 7 }),
    ).filter((s) => s.date <= iso(0))
    const varied = [1, 2, 3, 4, 5, 6].map((wd, i) =>
      indoorBoulder(iso(((new Date().getDay() + 6) % 7) - (wd - 1)), {
        duration: i % 2 === 0 ? 150 : 45,
        rpe: i % 2 === 0 ? 9 : 4,
      }),
    ).filter((s) => s.date <= iso(0))
    const flatR = monotonyStrain(flat)
    const variedR = monotonyStrain(varied)
    if (flatR.enough && variedR.enough) {
      expect(flatR.monotony).toBeGreaterThan(variedR.monotony)
    }
  })
})

describe('prescription safety', () => {
  it('never quotes kilos from a stale or absent max', () => {
    const stale = [{ ...maxHangTest(20, 100) }]
    for (const tests of [[], stale]) {
      const readout = coachReadout(
        weekly([1, 4], 8, (d) => hangSession(d)),
        [],
        null,
        {
          profile: { ...PROFILES.indoor3, sessions_week: 4 },
          goals: [],
          wellness: wellness(60),
          ostrc: [],
          fingerTests: tests,
          physicalTests: [],
        },
      )
      const hang = readout.suggestion.hang
      if (hang && !hang.blocked) {
        // A resolved prescription is only allowed when the test is usable.
        expect(readout.maxTotal.kg).toBeTruthy()
        expect(readout.maxTotal.stale).toBeFalsy()
      }
    }
  })

  it('gives every library entry a tier and a finger cost', () => {
    for (const e of ALL_EXERCISES) {
      expect(e.tier).toBeGreaterThanOrEqual(1)
      expect(e.tier).toBeLessThanOrEqual(5)
      expect(['none', 'low', 'medium', 'high']).toContain(e.fingerCost)
    }
  })

  it('tells you how to run every session the coach prescribes as a session', () => {
    // A protocol performed differently each time measures nothing, so the
    // climbing and finger entries must carry their own instructions. Several
    // gym lifts (S4, S6-S11) deliberately do not: they are named movements with
    // sets and reps, not protocols, and the card omits the paragraph rather
    // than rendering an empty one.
    for (const e of ALL_EXERCISES) {
      if (e.category === 'strength') continue
      expect(typeof e.how, `${e.id} ${e.name}`).toBe('string')
    }
  })
})

describe('adherence', () => {
  it('notices a training day that has been skipped for a month', () => {
    // Trains Monday and Wednesday, never Saturday, for six weeks.
    const sessions = weekly([1, 3], 6, (d) => indoorBoulder(d))
    const skipped = skippedWeekdays(sessions, [1, 3, 6])
    expect([...skipped]).toEqual([6])
  })

  it('does not call a day skipped when it was trained', () => {
    const sessions = weekly([1, 3, 6], 6, (d) => indoorBoulder(d))
    expect([...skippedWeekdays(sessions, [1, 3, 6])]).toEqual([])
  })
})
