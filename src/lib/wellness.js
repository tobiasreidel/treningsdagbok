// Daily wellness + the weekly OSTRC overuse questionnaire (see
// supabase/coach.sql). Both feed the coach; both are strictly private.
//
// Why daily wellness is its own table rather than a field on a session: a
// rating attached to a session only exists on days you trained, and people
// skip sessions when they feel wrecked. That means the days a readiness score
// most needs to see are precisely the days with no data, and the data it does
// have is selected in the flattering direction. Sampling has to be independent
// of training for the score to mean anything.
import { format, startOfWeek, subDays } from 'date-fns'
import { supabase, currentUserId, isMissingTable } from './supabase'
import { asDate, todayISO } from './format'

export function notifyWellnessChanged() {
  window.dispatchEvent(new Event('coach:changed'))
}

// ---- daily wellness ---------------------------------------------------------

export const HOOPER_ITEMS = [
  {
    key: 'sleep', label: 'Sleep', invert: false,
    low: 'Terrible', high: 'Great',
    hint: 'How well you slept last night.',
  },
  {
    key: 'fatigue', label: 'Fatigue', invert: true,
    low: 'Fresh', high: 'Exhausted',
    hint: 'How tired you feel overall.',
  },
  {
    key: 'soreness', label: 'Soreness', invert: true,
    low: 'None', high: 'Very sore',
    hint: 'Muscle soreness — separate from tiredness.',
  },
  {
    key: 'stress', label: 'Stress', invert: true,
    low: 'Calm', high: 'Very stressed',
    hint: 'Life stress, not training stress.',
  },
]

// Rows for the last `days` days, ascending. [] when the table isn't there yet.
export async function fetchWellness(days = 90) {
  const from = format(subDays(new Date(), days), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('wellness_days')
    .select('*')
    .gte('date', from)
    .order('date', { ascending: true })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

export async function getWellnessDay(date) {
  const { data, error } = await supabase
    .from('wellness_days')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return data ?? null
}

export async function saveWellnessDay(date, patch) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase
    .from('wellness_days')
    .upsert({ ...patch, user_id: userId, date }, { onConflict: 'user_id,date' })
  if (error) {
    if (isMissingTable(error)) {
      const e = new Error('Run supabase/coach.sql to enable daily check-ins.')
      e.code = 'no-table'
      throw e
    }
    throw error
  }
  notifyWellnessChanged()
}

export function hasLoggedToday(rows) {
  const today = todayISO()
  return (rows || []).some((r) => r.date === today)
}

// ---- OSTRC overuse questionnaire -------------------------------------------
// The validated OSTRC-O item set and response options. Scores are the
// instrument's own, not ours: items 1-4 sum to a 0-100 severity score.
export const OSTRC_QUESTIONS = [
  {
    key: 'q1',
    text: 'Have you had any difficulties participating in normal training and competition because of {area} problems?',
    options: [
      { score: 0, label: 'Full participation without problems' },
      { score: 8, label: 'Full participation, but with problems' },
      { score: 17, label: 'Reduced participation' },
      { score: 25, label: 'Cannot participate at all' },
    ],
  },
  {
    key: 'q2',
    text: 'To what extent have you reduced your training volume because of {area} problems?',
    options: [
      { score: 0, label: 'No reduction' },
      { score: 6, label: 'To a minor extent' },
      { score: 13, label: 'To a moderate extent' },
      { score: 25, label: 'To a major extent' },
    ],
  },
  {
    key: 'q3',
    text: 'To what extent have {area} problems affected your performance?',
    options: [
      { score: 0, label: 'No effect' },
      { score: 6, label: 'To a minor extent' },
      { score: 13, label: 'To a moderate extent' },
      { score: 25, label: 'Cannot participate at all' },
    ],
  },
  {
    key: 'q4',
    text: 'To what extent have you experienced {area} pain?',
    options: [
      { score: 0, label: 'No pain' },
      { score: 6, label: 'Mild pain' },
      { score: 13, label: 'Moderate pain' },
      { score: 25, label: 'Severe pain' },
    ],
  },
]

export const BODY_AREAS = [
  { key: 'fingers', label: 'Fingers', emoji: '🤏' },
  { key: 'elbow', label: 'Elbow', emoji: '💪' },
  { key: 'shoulder', label: 'Shoulder', emoji: '🫱' },
  { key: 'wrist', label: 'Wrist', emoji: '✋' },
  { key: 'knee', label: 'Knee', emoji: '🦵' },
  { key: 'back', label: 'Back', emoji: '🧍' },
  { key: 'other', label: 'Other', emoji: '📍' },
]

export function areaLabel(key) {
  return BODY_AREAS.find((a) => a.key === key)?.label || key
}

export function currentWeekStart() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function ostrcSeverity(r) {
  return (r?.q1 || 0) + (r?.q2 || 0) + (r?.q3 || 0) + (r?.q4 || 0)
}

// The instrument's own definition: a "substantial" problem is a moderate or
// severe reduction in training volume or performance, or inability to
// participate at all. Anything above zero is a health problem worth seeing.
export function isSubstantial(r) {
  return (r?.q1 || 0) >= 17 || (r?.q2 || 0) >= 13 || (r?.q3 || 0) >= 13
}

export async function fetchOstrc(weeks = 12) {
  const from = format(subDays(new Date(), weeks * 7), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('ostrc_reports')
    .select('*')
    .gte('week_start', from)
    .order('week_start', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

export async function saveOstrc(weekStart, area, answers) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase
    .from('ostrc_reports')
    .upsert(
      { ...answers, user_id: userId, week_start: weekStart, area },
      { onConflict: 'user_id,week_start,area' },
    )
  if (error) {
    if (isMissingTable(error)) {
      const e = new Error('Run supabase/coach.sql to enable the weekly check-in.')
      e.code = 'no-table'
      throw e
    }
    throw error
  }
  notifyWellnessChanged()
}

// This week's reports, and whether the weekly check-in is still outstanding.
export function thisWeeksOstrc(rows) {
  const wk = currentWeekStart()
  return (rows || []).filter((r) => r.week_start === wk)
}

// Areas with an active problem right now, worst first. Used by the coach to
// route around the affected structure instead of guessing.
export function activeProblems(rows) {
  const wk = currentWeekStart()
  const lastWk = format(subDays(asDate(wk), 7), 'yyyy-MM-dd')
  const recent = (rows || []).filter((r) => r.week_start === wk || r.week_start === lastWk)
  const byArea = new Map()
  for (const r of recent) {
    const sev = ostrcSeverity(r)
    if (sev <= 0) continue
    const prev = byArea.get(r.area)
    // Prefer the current week's answer for an area over last week's.
    if (!prev || r.week_start > prev.week_start) {
      byArea.set(r.area, { ...r, severity: sev, substantial: isSubstantial(r) })
    }
  }
  return [...byArea.values()].sort((a, b) => b.severity - a.severity)
}
