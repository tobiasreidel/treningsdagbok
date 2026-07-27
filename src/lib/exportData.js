// Take your data out. A training diary is years of work that only exists in
// one place, and a free Supabase project is not a backup - so this exists
// before it's needed, not after.
//
// Two shapes, because they answer different questions:
//   • JSON: everything, as stored, for keeping.
//   • CSV:  one row per session, for a spreadsheet.
import { supabase, currentUserId } from './supabase'
import { fetchSessions } from './sessions'
import { todayISO } from './format'

// Every table the app writes for a user. Missing ones (a migration that was
// never run) are skipped rather than failing the whole export.
const TABLES = [
  'injuries',
  'period_days',
  'wellness_days',
  'ostrc_reports',
  'coach_profile',
  'coach_goals',
  'finger_tests',
  'physical_tests',
  'gear_items',
  'gear_events',
  'user_settings',
]

// Credentials are not data you want lying around in a file in your downloads.
const OMIT_COLUMNS = { user_settings: ['intervals_api_key'] }

function scrub(table, rows) {
  const drop = OMIT_COLUMNS[table]
  if (!drop) return rows
  return rows.map((r) => {
    const copy = { ...r }
    for (const c of drop) delete copy[c]
    return copy
  })
}

export async function buildExport() {
  const userId = await currentUserId()
  const results = await Promise.allSettled([
    fetchSessions(),
    ...TABLES.map((t) => supabase.from(t).select('*')),
  ])

  const [sessionsResult, ...tableResults] = results
  const data = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    app: 'treningsdagbok',
    format: 1,
    sessions: sessionsResult.status === 'fulfilled' ? sessionsResult.value : [],
  }
  TABLES.forEach((table, i) => {
    const r = tableResults[i]
    const rows = r.status === 'fulfilled' && !r.value.error ? r.value.data || [] : []
    data[table] = scrub(table, rows)
  })
  return data
}

const CSV_COLUMNS = [
  ['date', (s) => s.date],
  ['sport', (s) => s.sport],
  ['subtype', (s) => s.subtype],
  ['location', (s) => s.location],
  ['duration_min', (s) => s.duration],
  ['feeling', (s) => s.feeling],
  ['rpe', (s) => s.rpe],
  ['finger_rpe', (s) => s.extra?.rpe_finger],
  ['pump', (s) => s.extra?.pump],
  ['distance_km', (s) => s.extra?.distance_km],
  ['elevation_m', (s) => s.extra?.elevation_m],
  ['training_load', (s) => s.extra?.training_load],
  ['routes', (s) => (s.routes || []).map((r) => [r.grade, r.send_type].filter(Boolean).join(' ')).join('; ')],
  ['notes', (s) => s.notes],
]

// Excel reads a leading '=' or '+' as a formula, so any field that starts with
// one is quoted and prefixed - a note beginning "=" is text, not a spreadsheet
// injection.
function csvCell(value) {
  if (value == null) return ''
  const s = String(value)
  const risky = /^[=+\-@]/.test(s)
  const body = risky ? `'${s}` : s
  return /[",\n]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body
}

export function sessionsToCsv(sessions) {
  const head = CSV_COLUMNS.map(([name]) => name).join(',')
  const rows = sessions.map((s) => CSV_COLUMNS.map(([, get]) => csvCell(get(s))).join(','))
  return [head, ...rows].join('\n')
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function downloadJson() {
  const data = await buildExport()
  download(`treningsdagbok-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')
  return data.sessions.length
}

export async function downloadCsv() {
  const sessions = await fetchSessions()
  // ﻿ so Excel opens it as UTF-8 and Norwegian characters survive.
  download(`treningsdagbok-${todayISO()}.csv`, `﻿${sessionsToCsv(sessions)}`, 'text/csv')
  return sessions.length
}
