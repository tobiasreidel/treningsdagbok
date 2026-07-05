// Period tracking + injury log (see supabase/health.sql). Both are strictly
// private to the owner - no friend/coach policy touches these tables.
//
// Cycle prediction is deliberately simple: average the recent start-to-start
// cycle lengths and project the next period from the last logged start. Good
// enough to plan a week ahead; it re-learns as soon as new days are logged.
import { format, addDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from './supabase'
import { asDate, todayISO } from './format'

// ---- period days -----------------------------------------------------------

// All marked days, ascending ISO strings.
export async function fetchPeriodDays() {
  const { data, error } = await supabase
    .from('period_days')
    .select('date')
    .order('date', { ascending: true })
  if (error) throw error
  return (data || []).map((r) => r.date)
}

// Is this date a logged period day? Used to badge single sessions (the
// session detail); list views fetch all days once instead.
export async function isPeriodDay(date) {
  const { data, error } = await supabase
    .from('period_days')
    .select('date')
    .eq('date', date)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

export async function setPeriodDay(date, on) {
  if (on) {
    const { error } = await supabase.from('period_days').upsert({ date })
    if (error) throw error
  } else {
    const { error } = await supabase.from('period_days').delete().eq('date', date)
    if (error) throw error
  }
}

// ---- cycle analysis ---------------------------------------------------------

const DEFAULT_CYCLE = 28 // days, used until two period starts are logged
const DEFAULT_PERIOD_LEN = 5

export const PHASES = {
  menstrual: {
    label: 'Menstruation',
    hint: 'Energy is often lower. Lighter volume and technique work tend to feel best.',
  },
  follicular: {
    label: 'Follicular phase',
    hint: 'Energy and strength typically climb. A good window for hard sessions.',
  },
  ovulation: {
    label: 'Around ovulation',
    hint: 'Often peak power. Warm up well; joints and ligaments can be more lax now.',
  },
  luteal: {
    label: 'Luteal phase',
    hint: 'Recovery can take longer and energy may dip. Keep intensity flexible.',
  },
}

// Group marked days into periods (runs of consecutive days) and derive the
// averages the prediction needs. `isoDays` must be ascending.
export function analyzeCycle(isoDays) {
  const periods = []
  for (const d of isoDays) {
    const last = periods[periods.length - 1]
    if (last && differenceInCalendarDays(asDate(d), asDate(last.end)) === 1) {
      last.end = d
      last.length += 1
    } else {
      periods.push({ start: d, end: d, length: 1 })
    }
  }

  const starts = periods.map((p) => p.start)
  const gaps = []
  for (let i = 1; i < starts.length; i += 1) {
    const g = differenceInCalendarDays(asDate(starts[i]), asDate(starts[i - 1]))
    if (g >= 15 && g <= 60) gaps.push(g) // ignore nonsense gaps (typos, old data)
  }
  const recentGaps = gaps.slice(-6)
  const avgCycle = recentGaps.length
    ? Math.round(recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length)
    : DEFAULT_CYCLE

  const lens = periods.map((p) => p.length).filter((n) => n >= 1 && n <= 10).slice(-6)
  const avgPeriodLen = lens.length
    ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)
    : DEFAULT_PERIOD_LEN

  const lastStart = starts[starts.length - 1] || null
  const nextStart = lastStart
    ? format(addDays(asDate(lastStart), avgCycle), 'yyyy-MM-dd')
    : null

  return { periods, starts, avgCycle, avgPeriodLen, lastStart, nextStart }
}

// Which cycle day / phase a date falls in, based on the closest logged period
// start before it. Returns null when there's nothing to anchor on.
export function cycleInfoFor(analysis, isoDate) {
  const starts = (analysis?.starts || []).filter((s) => s <= isoDate)
  const ref = starts[starts.length - 1]
  if (!ref) return null
  const day = differenceInCalendarDays(asDate(isoDate), asDate(ref)) + 1
  // Well past the expected cycle - don't pretend to know the phase.
  if (day > analysis.avgCycle + 7) {
    return {
      day,
      key: 'overdue',
      label: `Day ${day}`,
      hint: 'Longer than your average cycle. The prediction updates when you log your next period.',
    }
  }
  const ovulationDay = analysis.avgCycle - 14
  let key
  if (day <= analysis.avgPeriodLen) key = 'menstrual'
  else if (Math.abs(day - ovulationDay) <= 1) key = 'ovulation'
  else if (day < ovulationDay) key = 'follicular'
  else key = 'luteal'
  return { day, key, ...PHASES[key] }
}

// The next `count` predicted periods as a Set of ISO dates (for the calendar's
// pale drops). Empty until at least one period is logged.
export function predictedPeriodDays(analysis, count = 2) {
  const out = new Set()
  if (!analysis?.nextStart) return out
  for (let c = 0; c < count; c += 1) {
    const start = addDays(asDate(analysis.nextStart), c * analysis.avgCycle)
    for (let i = 0; i < analysis.avgPeriodLen; i += 1) {
      out.add(format(addDays(start, i), 'yyyy-MM-dd'))
    }
  }
  return out
}

// ---- injuries ---------------------------------------------------------------

export async function fetchInjuries() {
  const { data, error } = await supabase
    .from('injuries')
    .select('*')
    .order('started', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addInjury(note, started) {
  const { error } = await supabase
    .from('injuries')
    .insert({ note: note.trim(), started: started || todayISO() })
  if (error) throw error
}

// Mark healed (today by default). Passing null reopens it.
export async function endInjury(id, ended = todayISO()) {
  const { error } = await supabase.from('injuries').update({ ended }).eq('id', id)
  if (error) throw error
}

export async function deleteInjury(id) {
  const { error } = await supabase.from('injuries').delete().eq('id', id)
  if (error) throw error
}

// Count how many logged injuries cover each ISO date (started..ended inclusive,
// or started..today while still active), returned as a Map<isoDate, count>.
// Used to badge injured days on the calendar - one bandage per active injury -
// the same way logged period days are marked.
export function injuryDays(injuries) {
  const counts = new Map()
  const today = todayISO()
  for (const inj of injuries || []) {
    if (!inj?.started) continue
    let cur = asDate(inj.started)
    const last = asDate(inj.ended || today)
    // Cap the loop so a stray far-past start date can't run away.
    for (let i = 0; i < 3660 && differenceInCalendarDays(last, cur) >= 0; i += 1) {
      const key = format(cur, 'yyyy-MM-dd')
      counts.set(key, (counts.get(key) || 0) + 1)
      cur = addDays(cur, 1)
    }
  }
  return counts
}
