import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'
import { normaliseSession, climbDisciplines, subtypeLabel, routeSubtype } from './sessionShape'
import { toggleDiscipline } from './formState'
import { buildLimits } from './coach'
import { disciplineSplit, gradePyramid } from './stats'

// A session can be boulders and then routes. The first discipline picked is
// the session's subtype; the rest, and their grades, live beside it. The one
// thing that must never happen is a 7A boulder read as a 7a route, so every
// test here is about which scale a grade lands on.
const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')

const mixed = {
  date: iso(3),
  sport: 'climbing',
  subtype: 'bouldering',
  location: 'indoor',
  extra: { disciplines: ['bouldering', 'sport'], grades: ['7b'], other_grades: { sport: ['7B', '6c'] } },
}

describe('a session of more than one discipline', () => {
  it('reads every discipline, first picked first', () => {
    expect(climbDisciplines(mixed)).toEqual(['bouldering', 'sport'])
    expect(subtypeLabel(mixed)).toBe('bouldering + sport')
    expect(climbDisciplines({ sport: 'climbing', subtype: 'sport', extra: {} })).toEqual(['sport'])
  })

  it('puts each grade on its own scale', () => {
    expect(normaliseSession(mixed).gradesBy).toEqual({ bouldering: ['7B'], sport: ['7b', '6c'] })
    // The first discipline's grades are where they always were.
    expect(normaliseSession(mixed).grades).toEqual(['7B'])
  })

  it('counts toward both limits, each from its own grades', () => {
    const limits = buildLimits([mixed], {})
    expect(limits.ctx.boulder.indoor.grade).toBe('7B')
    expect(limits.ctx.route.indoor.grade).toBe('7b')
  })

  it('reads a climb in its own discipline', () => {
    const outdoor = {
      ...mixed,
      location: 'outdoor',
      routes: [{ grade: '7a', subtype: 'sport' }, { grade: '7a', subtype: null }],
    }
    expect(routeSubtype(outdoor.routes[0], outdoor)).toBe('sport')
    expect(routeSubtype(outdoor.routes[1], outdoor)).toBe('bouldering')
    expect(gradePyramid([outdoor]).map((b) => b.label).sort()).toEqual(['7A', '7a'])
  })

  it('counts once for each discipline in the split', () => {
    expect(disciplineSplit([mixed])).toMatchObject({ bouldering: 1, sport: 1, trad: 0 })
  })
})

describe('picking disciplines on the form', () => {
  const form = { sport: 'climbing', subtype: null, extra: {}, routes: [] }

  it('makes the first one tapped the subtype', () => {
    const a = { ...form, ...toggleDiscipline(form, 'sport') }
    const b = { ...a, ...toggleDiscipline(a, 'bouldering') }
    expect(b.subtype).toBe('sport')
    expect(b.extra.disciplines).toEqual(['sport', 'bouldering'])
  })

  it('moves the grades when the first one is tapped off', () => {
    const f = { ...form, subtype: 'bouldering', extra: { ...mixed.extra } }
    const next = { ...f, ...toggleDiscipline(f, 'bouldering') }
    expect(next.subtype).toBe('sport')
    expect(next.extra.grades).toEqual(['7B', '6c'])
    expect(next.extra.disciplines).toBeUndefined()
    expect(next.extra.other_grades).toBeUndefined()
  })

  it('keeps each climb in the discipline it was', () => {
    // Bouldering (implicit, the first) and a sport route.
    const f = {
      ...form,
      subtype: 'bouldering',
      extra: { ...mixed.extra },
      routes: [{ grade: '7A', subtype: null }, { grade: '7a', subtype: 'sport' }],
    }
    // Sport off: the route's grade goes with it, the boulder is untouched.
    const noSport = toggleDiscipline(f, 'sport')
    expect(noSport.routes).toEqual([
      { grade: '7A', subtype: null },
      { grade: null, subtype: null },
    ])
    // Bouldering off instead: sport is now first, and the boulder's grade
    // must not come back as a 7a route.
    const noBoulder = toggleDiscipline(f, 'bouldering')
    expect(noBoulder.routes).toEqual([
      { grade: null, subtype: null },
      { grade: '7a', subtype: null },
    ])
  })

  it('spells out each climb once a second discipline is added', () => {
    const f = { ...form, subtype: 'bouldering', extra: {}, routes: [{ grade: '7A', subtype: null }] }
    expect(toggleDiscipline(f, 'sport').routes[0].subtype).toBe('bouldering')
  })
})
