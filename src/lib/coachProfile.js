// Coach profile + goals (see supabase/coach.sql). The profile is what lets the
// generator prescribe real numbers; the goals are what turn a weekly rhythm
// into a plan that peaks on a date.
//
// Every read degrades to "not set up yet" when the tables are missing, so the
// app still runs before supabase/coach.sql has been applied.
import { supabase, currentUserId, isMissingTable } from './supabase'
import { differenceInCalendarDays } from 'date-fns'
import { asDate, todayISO } from './format'

// The table exists but is missing a column - an older version of coach.sql was
// run and the file has gained fields since. Re-running it fixes this, and the
// message needs to say so rather than implying nothing was ever set up.
function isMissingColumn(err) {
  return err?.code === 'PGRST204' || err?.code === '42703'
}

function schemaError(err) {
  if (isMissingTable(err)) {
    const e = new Error('Run supabase/coach.sql in the Supabase SQL editor to set up the coach.')
    e.code = 'no-table'
    return e
  }
  if (isMissingColumn(err)) {
    const e = new Error(
      'Your coach tables are missing newer fields — re-run supabase/coach.sql (it’s safe to run again).',
    )
    e.code = 'old-schema'
    return e
  }
  return null
}

export function notifyCoachChanged() {
  window.dispatchEvent(new Event('coach:changed'))
}

// ---- profile ---------------------------------------------------------------

// Returns the row, null when nothing is saved yet, or { missingTable: true }
// when supabase/coach.sql hasn't been run.
export async function fetchCoachProfile() {
  const { data, error } = await supabase.from('coach_profile').select('*').maybeSingle()
  if (error) {
    if (isMissingTable(error)) return { missingTable: true }
    throw error
  }
  return data ?? null
}

// Columns the app writes that an older coach.sql install won't have. Used to
// warn accurately instead of guessing from a failed write.
const NEWER_PROFILE_COLUMNS = [
  'max_boulder_outdoor', 'max_boulder_indoor', 'max_boulder_board',
  'max_route_outdoor', 'max_route_indoor', 'board_type',
  'hang_tested_on', 'preferred_days',
]

// True when the row came back without fields this version writes - i.e. the
// migration was run, but an earlier version of it.
export function hasOldSchema(profile) {
  if (!profile || profile.missingTable) return false
  return NEWER_PROFILE_COLUMNS.some((c) => !(c in profile))
}

export async function saveCoachProfile(patch) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase
    .from('coach_profile')
    .upsert({ ...patch, user_id: userId, updated_at: new Date().toISOString() })
  if (error) throw schemaError(error) || error
  notifyCoachChanged()
}

// The profile is "complete enough" once the generator can scale a session to
// the athlete. Grades and frequency are the load-bearing fields; the rest
// sharpens the output but isn't required.
export function isProfileComplete(profile) {
  if (!profile || profile.missingTable) return false
  const anyGrade = [
    profile.max_boulder_outdoor, profile.max_boulder_indoor, profile.max_boulder_board,
    profile.max_route_outdoor, profile.max_route_indoor,
    profile.max_boulder, profile.max_route,
  ].some(Boolean)
  return !!(profile.sessions_week && anyGrade)
}

// ---- goals -----------------------------------------------------------------
export async function fetchGoals() {
  const { data, error } = await supabase
    .from('coach_goals')
    .select('*')
    .order('target_date', { ascending: true, nullsFirst: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

export async function addGoal(goal) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('coach_goals').insert({ ...goal, user_id: userId })
  if (error) throw schemaError(error) || error
  notifyCoachChanged()
}

export async function updateGoal(id, patch) {
  const { error } = await supabase.from('coach_goals').update(patch).eq('id', id)
  if (error) throw error
  notifyCoachChanged()
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('coach_goals').delete().eq('id', id)
  if (error) throw error
  notifyCoachChanged()
}

// Which discipline a goal is in. A rope competition and a bouldering
// competition are not the same event trained the same way, so this drives which
// sessions the countdown prescribes - not just when it peaks.
export const GOAL_DISCIPLINES = [
  { key: 'boulder', label: 'Bouldering' },
  { key: 'rope', label: 'Rope' },
  { key: 'both', label: 'Both' },
]

// Comp and outdoor are close to different sports. A competition is unseen
// climbing on a clock - read it fast, commit first go - and modern setting is
// as much coordination and volumes as it is fingers. Outdoor is the same moves
// for weeks, on small holds, waiting for conditions. Peaking for one does not
// peak you for the other. (Speed is not modelled.)
export const GOAL_STYLES = [
  { key: 'comp', label: 'Competition' },
  { key: 'outdoor', label: 'Outdoor' },
]

export const GOAL_KINDS = [
  { key: 'competition', label: 'Competition', emoji: '🏆', dated: true, hint: 'A date to peak for.' },
  { key: 'trip', label: 'Trip', emoji: '✈️', dated: true, hint: 'A date to peak for.' },
  { key: 'grade', label: 'Grade', emoji: '🎯', dated: false, hint: 'Send a given grade. Shapes the emphasis rather than a peak.' },
  { key: 'strength', label: 'Strength', emoji: '💪', dated: false, hint: 'Get stronger at something measurable.' },
  { key: 'other', label: 'Other', emoji: '📌', dated: false, hint: '' },
]

export function goalKind(key) {
  return GOAL_KINDS.find((k) => k.key === key) || GOAL_KINDS[4]
}

// The goal the plan should currently be built around: the soonest dated goal
// still ahead of us. Undated goals shape emphasis but never a peak, because
// there is nothing to count back from.
export function primaryGoal(goals) {
  const today = todayISO()
  const dated = (goals || [])
    .filter((g) => !g.achieved && g.target_date && g.target_date >= today)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
  return dated[0] || null
}

export function daysUntil(goal) {
  if (!goal?.target_date) return null
  return differenceInCalendarDays(asDate(goal.target_date), asDate(todayISO()))
}
