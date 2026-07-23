// Gear wear & maintenance log (Profile → Gear). Each event is just a sport,
// a label and a date ("New front tire", 2026-03-12). The wear table is
// computed client-side: for the latest event of each label, how much has
// been done since - km for cycling/running, session count for climbing.
// Logging the same label again resets its counter, so "Oiled chain" always
// reads "since the last time".
// Data lives in gear_events (owner-only RLS, see supabase/gear.sql).
import { supabase } from './supabase'
import { todayISO } from './format'

// Suggested labels per sport - shown as quick chips, free text also allowed.
export const GEAR_SUGGESTIONS = {
  cycling: [
    'Oiled chain',
    'Cleaned chain',
    'New chain',
    'New cassette',
    'New front tire',
    'New rear tire',
    'New brake pads',
  ],
  running: ['New shoes'],
  climbing: ['New shoes', 'Resoled shoes'],
}

export async function fetchGearEvents() {
  const { data, error } = await supabase
    .from('gear_events')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addGearEvent(sport, label, date) {
  const { error } = await supabase
    .from('gear_events')
    .insert({ sport, label: label.trim(), date: date || todayISO() })
  if (error) throw error
}

export async function deleteGearEvent(id) {
  const { error } = await supabase.from('gear_events').delete().eq('id', id)
  if (error) throw error
}

// Wear a session contributes: distance for the km sports, 1 for climbing.
function wearOf(session, sport) {
  if (sport === 'climbing') return 1
  return Number(session.extra?.distance_km) || 0
}

// The wear table for one sport: one row per distinct label, carrying its
// latest event and the wear accumulated on sessions strictly after that
// date. Most-worn first, so the thing needing attention tops the list.
export function gearStatus(events, sessions, sport) {
  const latest = new Map() // label -> latest event
  for (const e of events) {
    if (e.sport !== sport) continue
    const prev = latest.get(e.label)
    if (!prev || e.date > prev.date) latest.set(e.label, e)
  }
  const rows = [...latest.values()].map((e) => {
    let value = 0
    for (const s of sessions) {
      if (s.sport === sport && s.date && s.date > e.date) value += wearOf(s, sport)
    }
    return { id: e.id, label: e.label, date: e.date, value: Math.round(value) }
  })
  rows.sort((a, b) => b.value - a.value)
  return rows
}

// "1 500 km" / "12 sessions" - how a wear value reads for a sport.
export function formatWear(value, sport) {
  if (sport === 'climbing') return `${value} session${value === 1 ? '' : 's'}`
  return `${value} km`
}
