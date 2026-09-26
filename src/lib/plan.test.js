import { describe, it, expect, afterAll, vi } from 'vitest'
import { format, subDays } from 'date-fns'
import { hangTarget, priorSessions, scaledSets, PROGRESS_STEP } from './progression'
import { buildSessionSheet } from './sessionSheet'
import {
  weekSchedule,
  pickExercises,
  fingerRecovery,
  buildLimits,
  painOutcomes,
  gradeRange,
  coachReadout,
  blockWeekFor,
} from './coach'
import { EXERCISE_MAP } from './exercises'

// The plan as a coach would run it: progression, the session sheet, and the
// week against what was logged. Pinned clock, like the fixtures.
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0)) // a Wednesday

afterAll(() => {
  vi.useRealTimers()
})

const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')
const profile = { bodyweight_kg: 70, sessions_week: 3, max_boulder_indoor: '7A', preferred_days: [1, 3, 6] }

// A logged F1 at `kg` total, `sets` sets, with an outcome.
const f1 = (daysAgo, kg, { sets = 4, outcome = null, fingerRpe = null } = {}) => ({
  date: iso(daysAgo),
  sport: 'finger',
  duration: 35,
  extra: {
    schema_version: 4,
    rpe_finger: fingerRpe,
    coach: { followed: 'planned', type: 'fingerStrength', exercises: ['F1'], outcome },
    finger: {
      hangboard: [
        { grip: 'halfcrimp', hands: 'two', reps: 1, sets: Array.from({ length: sets }, () => ({ load_total_kg: kg, time: 10, edge: 20 })) },
      ],
    },
  },
})

describe('hang progression', () => {
  const F1 = EXERCISE_MAP.F1
  const max = 100

  it('starts a new session at the low end of the range', () => {
    const t = hangTarget(F1, [], profile, max)
    expect(t.rule).toBe('start')
    expect(t.kg).toBe(80)
  })

  it('adds 2.5% of max after two sessions to plan at the same load', () => {
    const t = hangTarget(F1, [f1(3, 82, { outcome: 'nailed' }), f1(10, 82, { outcome: 'done' })], profile, max)
    expect(t.rule).toBe('progress')
    expect(t.kg).toBe(Math.round(82 * (1 + PROGRESS_STEP)))
  })

  it('holds the load after one good session', () => {
    const t = hangTarget(F1, [f1(3, 82, { outcome: 'nailed' })], profile, max)
    expect(t.rule).toBe('repeat')
    expect(t.kg).toBe(82)
  })

  it('holds the load after a session that was cut short', () => {
    const t = hangTarget(F1, [f1(3, 84, { outcome: 'short' }), f1(10, 84, { outcome: 'nailed' })], profile, max)
    expect(t.rule).toBe('repeat')
    expect(t.kg).toBe(84)
  })

  // A session logged before the outcome question existed: finishing the
  // prescribed sets reads as to plan, fewer as cut short.
  it('reads an unanswered outcome from the sets that were logged', () => {
    const priors = priorSessions(F1, [f1(3, 82, { sets: 2 })], profile)
    expect(priors[0].score).toBe(-1)
    expect(priorSessions(F1, [f1(3, 82, { sets: 4 })], profile)[0].score).toBe(0)
  })

  it('does not add load to a session that felt maximal', () => {
    const t = hangTarget(F1, [f1(3, 82, { outcome: 'nailed', fingerRpe: 10 }), f1(10, 82, { outcome: 'nailed' })], profile, max)
    expect(t.rule).toBe('repeat')
  })

  it('backs off ten percent after pain, never below the range', () => {
    const t = hangTarget(F1, [f1(3, 88, { outcome: 'pain' })], profile, max)
    expect(t.rule).toBe('backoff')
    expect(t.kg).toBe(Math.max(80, Math.round(88 * 0.9)))
    const high = hangTarget(F1, [f1(3, 100, { outcome: 'pain' })], profile, 120)
    expect(high.kg).toBe(96)
  })

  it('never leaves the prescribed range', () => {
    const t = hangTarget(F1, [f1(3, 89, { outcome: 'nailed' }), f1(10, 89, { outcome: 'nailed' })], profile, max)
    expect(t.kg).toBe(90)
    expect(t.rule).toBe('progress')
    const top = hangTarget(F1, [f1(3, 90, { outcome: 'nailed' }), f1(10, 90, { outcome: 'nailed' })], profile, max)
    expect(top.kg).toBe(90)
    expect(top.rule).toBe('capped')
    expect(top.note).toMatch(/retest/i)
  })

  it('keeps hangs in the lower half of the range with finger injury history', () => {
    const t = hangTarget(F1, [f1(3, 84, { outcome: 'nailed' }), f1(10, 84, { outcome: 'nailed' })], profile, max, { conservative: true })
    expect(t.kg).toBe(85)
    const top = hangTarget(F1, [f1(3, 85, { outcome: 'nailed' }), f1(10, 85, { outcome: 'nailed' })], profile, max, { conservative: true })
    expect(top.kg).toBe(85)
    expect(top.rule).toBe('capped')
    expect(top.note).toMatch(/injury history/)
  })

  it('restarts the range when the max has moved', () => {
    const t = hangTarget(F1, [f1(3, 82, { outcome: 'nailed' }), f1(10, 82, { outcome: 'nailed' })], profile, 110)
    expect(t.rule).toBe('start')
    expect(t.kg).toBe(88)
  })

  it('ignores sessions older than the history window', () => {
    const t = hangTarget(F1, [f1(70, 82, { outcome: 'nailed' }), f1(77, 82, { outcome: 'nailed' })], profile, max)
    expect(t.rule).toBe('start')
  })

  it('matches an unnamed hangboard session on grip and hang time', () => {
    const unnamed = { ...f1(3, 82), extra: { ...f1(3, 82).extra, coach: undefined } }
    expect(priorSessions(F1, [unnamed], profile)).toHaveLength(1)
    const repeaters = { ...unnamed, extra: { ...unnamed.extra, finger: { hangboard: [{ grip: 'halfcrimp', hands: 'two', reps: 7, sets: [{ load_total_kg: 60, time: 7, edge: 20 }] }] } } }
    expect(priorSessions(F1, [repeaters], profile)).toHaveLength(1) // 7 s is within tolerance of 10 s
    const oneArm = { ...unnamed, extra: { ...unnamed.extra, finger: { hangboard: [{ grip: 'halfcrimp', hands: 'one', reps: 1, sets: [{ load_total_kg: 50, time: 10, edge: 20 }] }] } } }
    expect(priorSessions(F1, [oneArm], profile)).toHaveLength(0)
  })

  it('scales the set count with the block week', () => {
    expect(scaledSets(F1, 0.85)).toBe(3)
    expect(scaledSets(F1, 1)).toBe(4)
    expect(scaledSets(F1, 1.1)).toBe(4)
    expect(scaledSets(EXERCISE_MAP.F2, 1.1)).toBe(6)
  })
})

describe('session sheet', () => {
  const p = { ...profile, has_hangboard: true, has_gym: true }

  it('always warms up before max hangs, and fits sixty minutes by cutting the main work', () => {
    const sheet = buildSessionSheet({ typeKey: 'fingerStrength', main: EXERCISE_MAP.F1, minutes: 60, profile: p })
    expect(sheet.total).toBeLessThanOrEqual(60)
    expect(sheet.parts.map((x) => x.role)).toEqual(['warmup', 'warmup', 'main', 'finish'])
    expect(sheet.parts.find((x) => x.id === 'WU2').required).toBe(true)
    expect(sheet.cut).toBe(true)
    expect(sheet.cutNote).toMatch(/never the warm-up/)
  })

  it('fills a ninety-minute slot after a short main session with easy climbing', () => {
    const sheet = buildSessionSheet({ typeKey: 'fingerMaintenance', main: EXERCISE_MAP.F4, minutes: 90, profile: p })
    expect(sheet.parts.map((x) => x.role)).toEqual(['warmup', 'main', 'then', 'finish'])
    expect(sheet.total).toBeLessThanOrEqual(90)
  })

  it('adds no second block in a taper or a deload', () => {
    const sheet = buildSessionSheet({ typeKey: 'fingerStrength', main: EXERCISE_MAP.F1, minutes: 120, durationMult: 0.5, reduced: true, profile: p })
    expect(sheet.parts.some((x) => x.role === 'then')).toBe(false)
    expect(sheet.parts.find((x) => x.role === 'main').minutes).toBe(18)
  })

  it('puts nothing hard after a limit day, only prehab', () => {
    const sheet = buildSessionSheet({ typeKey: 'limit', main: EXERCISE_MAP.B8, minutes: 120, profile: p })
    const roles = sheet.parts.map((x) => x.role)
    expect(roles).not.toContain('then')
    expect(sheet.parts.find((x) => x.role === 'finish').name).toMatch(/Prehab/)
  })

  it('does not warm up a mental session', () => {
    const sheet = buildSessionSheet({ typeKey: 'mental', main: EXERCISE_MAP.M1, minutes: 60, profile: p })
    expect(sheet.parts.map((x) => x.role)).toEqual(['main'])
  })

  it('names everything it prescribes, for logging the session as what it was', () => {
    const sheet = buildSessionSheet({ typeKey: 'fingerMaintenance', main: EXERCISE_MAP.F4, minutes: 90, profile: p })
    expect(sheet.ids).toContain('F4')
    expect(sheet.ids).toContain('B6')
    expect(sheet.ids).not.toContain('WU1')
  })
})

describe('the week against the log', () => {
  const keys = ['limit', 'fingerMaintenance', 'volume']
  const monday = '2026-09-21'
  const boulder = (date) => ({ date, sport: 'climbing', subtype: 'bouldering', location: 'indoor', duration: 90, rpe: 7, extra: {} })

  it('carries a missed hard session forward and drops the least important one', () => {
    // Trained last week (so the plan is active), missed Monday, opened Wednesday.
    const s = weekSchedule({ sessions: [boulder('2026-09-14')], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.days[0].missed).toBe(true)
    expect(s.todayKey).toBe('limit')
    expect(s.todayDay.carriedFrom).toBe('2026-09-21')
    expect(s.days[5].key).toBe('volume')
    expect(s.dropped).toEqual(['fingerMaintenance'])
  })

  it('keeps the week in its laid-out order when nothing was missed', () => {
    // fingerMaintenance on Wednesday, volume on Saturday, as spaced: priority
    // must not reshuffle a week that still fits.
    const s = weekSchedule({ sessions: [boulder('2026-09-14'), boulder('2026-09-21')], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.todayKey).toBe('fingerMaintenance')
    expect(s.days[5].key).toBe('volume')
  })

  it('does not call a day missed before the plan was being followed', () => {
    const s = weekSchedule({ sessions: [], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.days[0].missed).toBe(false)
    expect(s.dropped).toEqual([])
    expect(s.todayKey).toBe('limit')
  })

  it('never calls a guessed day missed', () => {
    const s = weekSchedule({ sessions: [boulder('2026-09-14')], keys, daySlots: [1, 3, 6], weekStart: monday, flexible: true, hardKey: 'limit' })
    expect(s.days[0].missed).toBe(false)
  })

  it('ticks a day off with what the session said it was', () => {
    const logged = { ...boulder('2026-09-21'), extra: { coach: { followed: 'planned', type: 'volume', exercises: ['B9'] } } }
    const s = weekSchedule({ sessions: [logged], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.days[0].did).toBe('volume')
    // The hard session is still owed, so it comes today.
    expect(s.todayKey).toBe('limit')
  })

  it('previews the next session once today is logged', () => {
    const s = weekSchedule({ sessions: [boulder('2026-09-21'), boulder('2026-09-23')], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.todayDone).toBe(true)
    expect(s.todayKey).toBe(null)
    expect(s.nextUp.date).toBe('2026-09-26')
  })

  it('does not put a hard finger day straight after one that was', () => {
    const s = weekSchedule({
      sessions: [boulder('2026-09-14'), boulder('2026-09-22')],
      keys: ['limit', 'power', 'volume'], daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit',
      hardDates: new Set(['2026-09-22']),
    })
    // Tuesday's unplanned session was maximal on the fingers, so Wednesday
    // gets the easy day and the hard ones move on.
    expect(s.todayKey).toBe('volume')
  })

  it('does not count a bike ride as a climbing session', () => {
    const ride = { date: '2026-09-21', sport: 'cycling', duration: 120, rpe: 6, extra: {} }
    const s = weekSchedule({ sessions: [boulder('2026-09-14'), ride], keys, daySlots: [1, 3, 6], weekStart: monday, hardKey: 'limit' })
    expect(s.days[0].missed).toBe(true)
  })
})

describe('who gets what', () => {
  it('gives an under-18 in their first two years no hangboard at all', () => {
    const p = { ...profile, has_hangboard: true, birth_year: 2011, climbing_since: 2025 }
    const list = pickExercises('fingerMaintenance', p, 0, null, null, { age: 15, yearsClimbing: 1, tier: 1, sessionCat: 'fingerStrength' })
    expect(list.every((e) => e.category !== 'finger')).toBe(true)
  })

  it('judges the chronic ceiling a level down with finger injury history', () => {
    const limits = buildLimits([], profile)
    const plain = fingerRecovery([], limits, { ...profile, climbing_since: 2018 }, [])
    const history = fingerRecovery([], limits, { ...profile, climbing_since: 2018, injury_regions: ['fingers'] }, [])
    expect(history.chronicCeiling.high).toBeLessThan(plain.chronicCeiling.high)
    expect(history.conservative).toBe(true)
  })

  it('turns a session that ended in pain into a problem for the week', () => {
    const s = { date: iso(2), sport: 'climbing', subtype: 'bouldering', duration: 90, extra: { coach: { followed: 'planned', type: 'limit', exercises: ['B8'], outcome: 'pain', pain_area: 'elbow' } } }
    const problems = painOutcomes([s])
    expect(problems).toHaveLength(1)
    expect(problems[0].area).toBe('elbow')
    expect(problems[0].substantial).toBe(true)
    expect(painOutcomes([{ ...s, date: iso(10) }])).toHaveLength(0)
  })

  it('squeezes the grade offsets at the bottom of the scale', () => {
    const limits = buildLimits([], { max_boulder_indoor: '6A' })
    const r = gradeRange('technique', limits, EXERCISE_MAP.B7)
    expect(r.text).toBe('4–5')
    const limit = gradeRange('limit', limits, EXERCISE_MAP.B8)
    expect(limit.text).toBe('5+–6A')
  })

  it('ramps volume across the block and cuts it in the deload', () => {
    const pos = { blockWeek: 0 }
    expect(blockWeekFor(pos, null, 0).volumeMult).toBe(0.85)
    expect(blockWeekFor(pos, null, 1).volumeMult).toBe(1)
    expect(blockWeekFor(pos, null, 2).volumeMult).toBe(1.1)
    expect(blockWeekFor(pos, null, 3).deload).toBe(true)
  })

  it('builds the week and the card from the same schedule', () => {
    const sessions = [{ date: iso(9), sport: 'climbing', subtype: 'bouldering', location: 'indoor', duration: 90, rpe: 7, extra: {} }]
    const r = coachReadout(sessions, [], null, { profile, goals: [], wellness: [], ostrc: [], fingerTests: [], physicalTests: [] })
    const today = r.week.find((d) => d.isToday)
    expect(today.key).toBe(r.suggestion.key)
    expect(r.week.block.label).toBeTruthy()
    expect(r.review.planned).toBeGreaterThan(0)
  })
})
