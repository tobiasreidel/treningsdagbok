import { describe, it, expect, vi, afterAll } from 'vitest'
import { format, subDays } from 'date-fns'
import { fingerDose, fingerRecovery, buildLimits } from './coach'
import { sessionExercises } from './exercises'
import { prescribeHang, maxTotalFor, hasUnreadableHangs } from './fingerLoad'
import { sessionsToCsv } from './exportData'

// The engine is the one part of this app with no obvious right answer on
// inspection, and the one place a silent regression costs the most: it decides
// whether you are told to train hard today. These cover the behaviours that
// have actually gone wrong, not the whole surface.

// Frozen for the same reason as coachFixtures.test.js, which carries the long
// version: the dates below are fixed but the engine's "today" was not, so a
// tested max that is nine days old today was a stale one a few months from now,
// and two of these went red on their own. Same instant as the fixtures, and
// installed at module scope so it covers the fixture data built up here too.
const FROZEN_NOW = new Date('2026-07-15T09:00:00Z')
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(FROZEN_NOW)
afterAll(() => {
  vi.useRealTimers()
})

const profile = { bodyweight_kg: 70, sessions_week: 3, max_boulder_indoor: '7A' }

// A max-effort hangboard session: four 10 s hangs at 95 kg total on 20 mm.
const hangSession = (date) => ({
  date,
  sport: 'finger',
  duration: 40,
  extra: {
    finger: {
      hangboard: [
        {
          grip: 'halfcrimp',
          hands: 'two',
          reps: 1,
          sets: [
            { time: 10, edge: 20, load_total_kg: 95 },
            { time: 10, edge: 20, load_total_kg: 95 },
            { time: 10, edge: 20, load_total_kg: 95 },
            { time: 10, edge: 20, load_total_kg: 95 },
          ],
        },
      ],
    },
  },
})

// A tested two-hand max of 100 kg half-crimp, so 95 kg is 95% - maximal.
const tests = [
  {
    protocol: 'total_load',
    grip: 'halfcrimp',
    hands: 'two',
    value: 100,
    tested_on: '2026-07-06',
  },
]

describe('finger dose', () => {
  it('scores a near-max hang as maximal when a tested max is known', () => {
    const limits = buildLimits([], profile)
    const dose = fingerDose(hangSession('2026-07-11'), limits, profile, tests)
    expect(dose.tier).toBe('maximal')
  })

  // This is the regression that shipped: four screens derived the readout
  // without passing the tests, so the same session was scored off edge size
  // alone and could land in a different tier than the Coach page showed.
  it('scores the same session lower without the tests, which is why they must be passed', () => {
    const limits = buildLimits([], profile)
    const withTests = fingerDose(hangSession('2026-07-11'), limits, profile, tests)
    const without = fingerDose(hangSession('2026-07-11'), limits, profile, [])
    expect(without.dose).toBeLessThan(withTests.dose)
  })
})

describe('finger recovery', () => {
  it('reports fingers as loaded the day after a maximal session', () => {
    const limits = buildLimits([], profile)
    // Local dates, like the app: toISOString() is UTC, so building fixtures
    // that way made this test fail between local midnight and 02:00.
    const iso = (offsetDays) => format(subDays(new Date(), offsetDays), 'yyyy-MM-dd')
    const r = fingerRecovery([hangSession(iso(1))], limits, profile, tests)
    expect(r.daysSinceMax).toBe(1)
    expect(['loaded', 'recovering']).toContain(r.key)
  })

  it('has no opinion when nothing has been logged', () => {
    const r = fingerRecovery([], buildLimits([], profile), profile, [])
    expect(r.key).toBe('unknown')
  })
})

describe('hang prescription', () => {
  it('turns a percentage of max into kilos on the harness', () => {
    const rx = prescribeHang({ lo: 0.8, hi: 0.9 }, 100, 70)
    expect(rx.loAdded).toBeCloseTo(10)
    expect(rx.hiAdded).toBeCloseTo(20)
    expect(rx.assisted).toBe(false)
  })

  // Submaximal finger work below bodyweight is the normal shape of repeaters,
  // not an error - it has to come out as "take weight off", not a negative.
  it('calls a sub-bodyweight prescription assisted', () => {
    const rx = prescribeHang({ lo: 0.55, hi: 0.65 }, 100, 70)
    expect(rx.assisted).toBe(true)
    expect(rx.addedText).toMatch(/assisted/i)
  })

  it('gives no kilos without a usable max', () => {
    expect(prescribeHang({ lo: 0.8, hi: 0.9 }, 0, 70)).toBeNull()
  })
})

describe('max total', () => {
  it('prefers a test on the exact grip', () => {
    const rows = [
      { protocol: 'total_load', grip: 'openhand', hands: 'two', value: 90, tested_on: '2026-07-07' },
      { protocol: 'total_load', grip: 'halfcrimp', hands: 'two', value: 100, tested_on: '2026-07-06' },
    ]
    const m = maxTotalFor(profile, rows, 'halfcrimp')
    expect(m.kg).toBe(100)
    expect(m.exactGrip).toBe(true)
  })

  it('reports nothing usable when there are no tests', () => {
    expect(maxTotalFor(profile, [], 'halfcrimp')?.kg).toBeFalsy()
  })
})

describe('unreadable hangs', () => {
  const addedWeightSession = {
    extra: {
      finger: {
        hangboard: [{ grip: 'halfcrimp', hands: 'two', sets: [{ time: 10, edge: 20, weight: 20 }] }],
      },
    },
  }

  it('flags an added-weight set when no bodyweight is known', () => {
    expect(hasUnreadableHangs(addedWeightSession, 0)).toBe(true)
  })

  it('reads the same set once a bodyweight exists', () => {
    expect(hasUnreadableHangs(addedWeightSession, 70)).toBe(false)
  })
})

describe('csv export', () => {
  it('quotes commas and newlines', () => {
    const csv = sessionsToCsv([{ date: '2026-06-17', sport: 'climbing', notes: 'felt good, then bad' }])
    expect(csv.split('\n')[1]).toContain('"felt good, then bad"')
  })

  // A note that starts with "=" is a note, not a spreadsheet formula.
  it('defuses a leading equals so Excel treats it as text', () => {
    const csv = sessionsToCsv([{ date: '2026-06-17', sport: 'climbing', notes: '=1+1' }])
    expect(csv.split('\n')[1]).toContain("'=1+1")
  })
})

describe('naming what a session was made of', () => {
  const limits = buildLimits([], profile)

  it('reads a session logged before this was a list', () => {
    const named = sessionExercises({ extra: { coach: { exercise: 'F1' } } })
    expect(named.map((e) => e.id)).toEqual(['F1'])
  })

  it('reads a session made of several library sessions', () => {
    const named = sessionExercises({ extra: { coach: { exercises: ['B6', 'F3', 'B3'] } } })
    expect(named.map((e) => e.id)).toEqual(['B6', 'F3', 'B3'])
  })

  it('ignores ids that are no longer in the library', () => {
    expect(sessionExercises({ extra: { coach: { exercises: ['F1', 'NOPE'] } } })).toHaveLength(1)
  })

  // Slab + campus + 4x4 is one afternoon, and the fingers recover from the
  // hardest part of it - not from the sum, which would look like three days.
  it('takes the hardest part as the floor rather than summing', () => {
    const combined = {
      date: '2026-07-11',
      sport: 'climbing',
      duration: 120,
      extra: { coach: { exercises: ['B6', 'F3'] } },
    }
    const campusOnly = {
      date: '2026-07-11',
      sport: 'climbing',
      duration: 120,
      extra: { coach: { exercises: ['F3'] } },
    }
    const both = fingerDose(combined, limits, profile, [])
    const one = fingerDose(campusOnly, limits, profile, [])
    expect(both.dose).toBe(one.dose)
    expect(both.tier).toBe(one.tier)
  })
})
