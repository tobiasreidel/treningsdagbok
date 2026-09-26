// Coach profile + goals (see supabase/migrations/20260725000000_coach.sql). The profile is what lets the
// generator prescribe real numbers; the goals are what turn a weekly rhythm
// into a plan that peaks on a date.
//
// Every read degrades to "not set up yet" when the tables are missing, so the
// app still runs before supabase/migrations/20260725000000_coach.sql has been applied.
import { supabase, currentUserId, isMissingTable } from './supabase'
import { differenceInCalendarDays, format, startOfWeek } from 'date-fns'
import { asDate, todayISO } from './format'
import { BODY_AREAS } from './wellness'

// The table exists but is missing a column - an older version of coach.sql was
// run and the file has gained fields since. Re-running it fixes this, and the
// message needs to say so rather than implying nothing was ever set up.
function isMissingColumn(err) {
  return err?.code === 'PGRST204' || err?.code === '42703'
}

function schemaError(err) {
  if (isMissingTable(err)) {
    const e = new Error('The coach tables are not set up yet. Apply the migrations (npx supabase db push).')
    e.code = 'no-table'
    return e
  }
  if (isMissingColumn(err)) {
    const e = new Error(
      'Your coach tables are missing newer fields. Apply the migrations (npx supabase db push).',
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
// when supabase/migrations/20260725000000_coach.sql hasn't been run.
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
  'session_minutes', 'weaknesses', 'injury_regions', 'plan_started_on',
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

// ---- the intake --------------------------------------------------------------
// What a coach asks in the first conversation, and what each answer changes.
// Listed here rather than in the form so the plan tab can say what it is
// still guessing at, with the reason, instead of a generic "complete your
// profile".

// How long a session can be. The session sheet is built to fit it.
export const SESSION_LENGTHS = [45, 60, 90, 120, 150]

// What the athlete thinks holds them back. The plan spends its spare slot on
// the first one and orders the alternatives by them; it never gates anything.
export const WEAKNESSES = [
  { key: 'fingers', label: 'Finger strength', emoji: '🤏' },
  { key: 'power', label: 'Power', emoji: '⚡' },
  { key: 'endurance', label: 'Endurance', emoji: '🫁' },
  { key: 'technique', label: 'Technique', emoji: '🎨' },
  { key: 'strength', label: 'Pull and push strength', emoji: '💪' },
  { key: 'mobility', label: 'Mobility', emoji: '🧘' },
  { key: 'mental', label: 'Head game', emoji: '🧠' },
]

export function weaknessLabel(key) {
  return WEAKNESSES.find((w) => w.key === key)?.label || key
}

// Injury history by body area: the same vocabulary as the injury log and the
// weekly questionnaire, so one word means one thing everywhere.
export const INJURY_REGIONS = BODY_AREAS

// The questions the coach has not had answered, each with what the answer
// would change. Order is by how much the plan moves without it.
export function profileGaps(profile) {
  const p = profile && !profile.missingTable ? profile : {}
  const gaps = []
  const anyGrade = [
    p.max_boulder_outdoor, p.max_boulder_indoor, p.max_boulder_board,
    p.max_route_outdoor, p.max_route_indoor, p.max_boulder, p.max_route,
  ].some(Boolean)
  if (!anyGrade) {
    gaps.push({ key: 'grades', label: 'Your grades', why: 'Every grade band on a session is scaled from these. Without them the card describes effort instead.' })
  }
  if (!p.sessions_week) {
    gaps.push({ key: 'sessions_week', label: 'Sessions a week', why: 'Decides how many sessions the week holds. Three is assumed.' })
  }
  if (!Array.isArray(p.preferred_days) || p.preferred_days.length < Math.min(p.sessions_week || 3, 6)) {
    gaps.push({ key: 'preferred_days', label: 'Which days you train', why: 'Lets the plan land on your real days, call a missed one missed, and keep hard days apart. Until then it spreads sessions evenly and guesses.' })
  }
  if (!p.session_minutes) {
    gaps.push({ key: 'session_minutes', label: 'How long a session is', why: 'The session sheet is built to fit it. Ninety minutes is assumed.' })
  }
  if (!p.climbing_since) {
    gaps.push({ key: 'climbing_since', label: 'When you started climbing', why: 'Sets how much hard finger work your tendons are assumed to tolerate, and whether the hangboard is in the plan at all.' })
  }
  if (!p.birth_year) {
    gaps.push({ key: 'birth_year', label: 'Birth year', why: 'Under 18 changes what is prescribed: no campus, hangs capped, and no finger training before two years of climbing.' })
  }
  if (!Array.isArray(p.weaknesses) || !p.weaknesses.length) {
    gaps.push({ key: 'weaknesses', label: 'What holds you back', why: 'The spare slot in the week goes to it, and the alternatives are ordered by it.' })
  }
  if (!p.bodyweight_kg) {
    gaps.push({ key: 'bodyweight_kg', label: 'Bodyweight', why: 'Turns a hang prescription from a percentage into kilos on the harness, or off it.' })
  }
  const facilities = ['has_hangboard', 'has_campus', 'has_spraywall', 'has_gym']
  if (!facilities.some((k) => p[k] != null && p[k] !== undefined) || Object.keys(p).length === 0) {
    gaps.push({ key: 'facilities', label: 'What you have access to', why: 'Filters the library to sessions you can actually do.' })
  }
  return gaps
}

// Start a new 4-week block from this Monday. The cycle otherwise counts from
// the first session ever logged, which puts a brand-new user wherever that
// happens to fall.
export async function startNewBlock(weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')) {
  await saveCoachProfile({ plan_started_on: weekStart })
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
