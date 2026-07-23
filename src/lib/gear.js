// Gear items & their wear/maintenance log (Profile → Gear). The equipment is
// concrete: a bike, a pair of climbing or running shoes. One item per sport
// is the "main" one - sessions that don't name an item (extra.gear_id) are
// assumed to be on it, so a single-bike athlete never has to pick anything.
// Maintenance events belong to an item ("New front tire" on the Canyon), and
// the wear table shows what's been done since each latest event: km for
// cycling/running, session count for climbing. Logging the same label again
// resets its counter.
// Data lives in gear_items + gear_events (owner-only RLS, supabase/gear.sql).
import { supabase } from './supabase'
import { todayISO } from './format'

// What an item is called per sport - drives all the UI copy.
export const GEAR_NOUN = { cycling: 'bike', running: 'shoes', climbing: 'shoes' }

// Suggested event labels per sport - shown as quick chips, free text also OK.
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
  climbing: ['New shoes', 'Resoled'],
}

// ---- items -----------------------------------------------------------------

export async function fetchGearItems() {
  const { data, error } = await supabase
    .from('gear_items')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// The first item of a sport becomes main automatically.
export async function addGearItem(sport, name, isMain) {
  const { error } = await supabase
    .from('gear_items')
    .insert({ sport, name: name.trim(), is_main: Boolean(isMain) })
  if (error) throw error
}

// Exactly one main per sport: clear the others, then crown this one.
export async function setMainGearItem(sport, id) {
  const { error: clearErr } = await supabase
    .from('gear_items')
    .update({ is_main: false })
    .eq('sport', sport)
  if (clearErr) throw clearErr
  const { error } = await supabase.from('gear_items').update({ is_main: true }).eq('id', id)
  if (error) throw error
}

// Deleting an item cascades to its maintenance events.
export async function deleteGearItem(id) {
  const { error } = await supabase.from('gear_items').delete().eq('id', id)
  if (error) throw error
}

export function mainGearItem(items, sport) {
  return items.find((i) => i.sport === sport && i.is_main) || null
}

// ---- events ----------------------------------------------------------------

export async function fetchGearEvents() {
  const { data, error } = await supabase
    .from('gear_events')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addGearEvent(sport, label, date, itemId) {
  const { error } = await supabase
    .from('gear_events')
    .insert({ sport, label: label.trim(), date: date || todayISO(), item_id: itemId || null })
  if (error) throw error
}

export async function deleteGearEvent(id) {
  const { error } = await supabase.from('gear_events').delete().eq('id', id)
  if (error) throw error
}

// ---- the wear table --------------------------------------------------------

// Wear a session contributes: distance for the km sports, 1 for climbing.
function wearOf(session, sport) {
  if (sport === 'climbing') return 1
  return Number(session.extra?.distance_km) || 0
}

// Does this session count toward this item? Explicitly stamped sessions go to
// their item; unstamped ones (imports, sessions from before gear existed, or
// a stamp whose item was deleted) fall to the sport's main item.
function sessionOnItem(session, item, knownIds) {
  if (session.sport !== item.sport || !session.date) return false
  const gid = session.extra?.gear_id
  if (gid && knownIds.has(gid)) return gid === item.id
  return item.is_main
}

// The wear table for one item: one row per distinct label, carrying its
// latest event and the wear accumulated on sessions strictly after that
// date. Most-worn first, so the thing needing attention tops the list.
// Events without an item (from the first gear version) belong to the main.
export function gearStatus(events, sessions, item, items) {
  const knownIds = new Set(items.map((i) => i.id))
  const latest = new Map() // label -> latest event
  for (const e of events) {
    if (e.sport !== item.sport) continue
    const onItem = e.item_id ? e.item_id === item.id : item.is_main
    if (!onItem) continue
    const prev = latest.get(e.label)
    if (!prev || e.date > prev.date) latest.set(e.label, e)
  }
  const rows = [...latest.values()].map((e) => {
    let value = 0
    for (const s of sessions) {
      if (sessionOnItem(s, item, knownIds) && s.date > e.date) value += wearOf(s, item.sport)
    }
    return { id: e.id, label: e.label, date: e.date, value: Math.round(value) }
  })
  rows.sort((a, b) => b.value - a.value)
  return rows
}

// Total wear on an item since it was added (its whole logged life).
export function itemTotalWear(sessions, item, items) {
  const knownIds = new Set(items.map((i) => i.id))
  let value = 0
  for (const s of sessions) {
    if (sessionOnItem(s, item, knownIds)) value += wearOf(s, item.sport)
  }
  return Math.round(value)
}

// "1500 km" / "12 sessions" - how a wear value reads for a sport.
export function formatWear(value, sport) {
  if (sport === 'climbing') return `${value} session${value === 1 ? '' : 's'}`
  return `${value} km`
}
