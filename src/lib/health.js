// Period tracking, injury log and illness log (see
// supabase/migrations/20260101000500_health.sql and 20260926120000_illness.sql).
// All strictly private to the owner - no friend/coach policy touches these tables.
//
// Cycle prediction is deliberately simple: average the recent start-to-start
// cycle lengths and project the next period from the last logged start. Good
// enough to plan a week ahead; it re-learns as soon as new days are logged.
import { format, addDays, subDays, differenceInCalendarDays } from 'date-fns'
import { supabase, currentUserId, isMissingTable } from './supabase'
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

// `region` lets the training coach route around the affected structure. Without
// it the best it can do is guess, and prescribing antagonist work - which is
// mostly shoulder and push - is the worst possible answer to a shoulder injury.
export async function addInjury(note, started, region = null) {
  const { error } = await supabase
    .from('injuries')
    .insert({ note: note.trim(), started: started || todayISO(), region })
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

// ---- illness ----------------------------------------------------------------
// One row per episode, like an injury. What the coach acts on is the kind of
// illness, sorted the way a doctor sorts it at the door (the "neck check"):
// symptoms only above the neck, symptoms below it, or a fever. Ordered mildest
// first; `worst` on a row is never allowed to move back down that order.
// `noun` is the word for a status line: "Cold since Tue". Never "Ill": in the
// app's font a capital I and two l's read as a roman three.
export const ILLNESS_SYMPTOMS = [
  { key: 'head', label: 'Above the neck', noun: 'Cold', emoji: '🤧', hint: 'Runny or blocked nose, sneezing, a sore throat.' },
  { key: 'body', label: 'Below the neck', noun: 'Sick', emoji: '🤒', hint: 'Chest, cough, aching muscles, stomach.' },
  { key: 'fever', label: 'Fever', noun: 'Fever', emoji: '🌡️', hint: '38 °C or more, or chills and feeling feverish.' },
]

const SYMPTOM_ORDER = ILLNESS_SYMPTOMS.map((s) => s.key)

export function symptomInfo(key) {
  return ILLNESS_SYMPTOMS.find((s) => s.key === key) || ILLNESS_SYMPTOMS[1]
}

export function worseSymptom(a, b) {
  return SYMPTOM_ORDER.indexOf(a) >= SYMPTOM_ORDER.indexOf(b) ? a : b
}

export function notifyIllnessChanged() {
  // The coach re-reads on this, and so does the dashboard calendar.
  window.dispatchEvent(new Event('coach:changed'))
}

function illnessWriteError(error) {
  if (isMissingTable(error)) {
    const e = new Error('The illness log needs its table. Apply the migrations (npx supabase db push).')
    e.code = 'no-table'
    return e
  }
  return error
}

// All episodes, newest first. [] when the table isn't there yet.
export async function fetchIllnesses() {
  const { data, error } = await supabase
    .from('illnesses')
    .select('*')
    .order('started', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

// `ended` is the last day you were ill, inclusive, so a finished episode can be
// logged after the fact. Leave it null while you still are.
export async function addIllness({ started = todayISO(), ended = null, symptoms, note = '' }) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('illnesses').insert({
    user_id: userId,
    started,
    ended: ended || null,
    symptoms,
    worst: symptoms,
    note: note.trim() || null,
  })
  if (error) throw illnessWriteError(error)
  notifyIllnessChanged()
}

// How it is now. The worst it got is kept, because that is what sets the
// return once it is over.
export async function updateIllnessSymptoms(row, symptoms) {
  const { error } = await supabase
    .from('illnesses')
    .update({ symptoms, worst: worseSymptom(row.worst || row.symptoms, symptoms) })
    .eq('id', row.id)
  if (error) throw illnessWriteError(error)
  notifyIllnessChanged()
}

// The day you say you are well is the first day back, so the last day ill was
// yesterday - unless the episode only started today.
export function defaultIllnessEnd(started) {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  return started && yesterday < started ? started : yesterday
}

export async function endIllness(row, ended = defaultIllnessEnd(row.started)) {
  const { error } = await supabase.from('illnesses').update({ ended }).eq('id', row.id)
  if (error) throw illnessWriteError(error)
  notifyIllnessChanged()
}

export async function deleteIllness(id) {
  const { error } = await supabase.from('illnesses').delete().eq('id', id)
  if (error) throw illnessWriteError(error)
  notifyIllnessChanged()
}

// The episode still open, if any (the newest, should two have been left open).
export function openIllness(illnesses) {
  return (illnesses || []).filter((r) => r?.started && !r.ended).sort((a, b) => b.started.localeCompare(a.started))[0] || null
}

// Every ISO date covered by a logged illness (started..ended inclusive, or
// started..today while still ill), as a Set. Badges the calendar and tells the
// plan which days were lost to illness rather than missed.
export function illnessDays(illnesses) {
  const out = new Set()
  const today = todayISO()
  for (const r of illnesses || []) {
    if (!r?.started) continue
    let cur = asDate(r.started)
    const last = asDate(r.ended || today)
    // Capped so a stray far-past start date can't run away.
    for (let i = 0; i < 366 && differenceInCalendarDays(last, cur) >= 0; i += 1) {
      out.add(format(cur, 'yyyy-MM-dd'))
      cur = addDays(cur, 1)
    }
  }
  return out
}
