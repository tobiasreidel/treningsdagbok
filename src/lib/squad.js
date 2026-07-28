// The squad view: what a coach can see about the athletes who have shared with
// them (see supabase/migrations/20260728000000_coach_squad.sql).
//
// Two rules the whole module obeys:
//
//   1. Derived signals and OSTRC only. The raw daily wellness items and their
//      note never cross the boundary, because a coach who can read the stress
//      field is a reason to stop filling in the stress field.
//   2. State, never rank. This shows who has a problem, who is under-recovered
//      and who has not checked in. It does not, and must not, sort athletes by
//      hang load, grade or bodyweight: that is a leaderboard on health data
//      among teenagers, which is the one thing this app has always refused.
import { supabase, currentUserId, isMissingTable } from './supabase'
import { todayISO } from './format'
import { currentWeekStart, ostrcSeverity, isSubstantial, BODY_AREAS } from './wellness'
import { loadCoachLinks } from './coaches'

// Today's derived readout, stored so a coach can read the numbers without
// reading what produced them. Written by the athlete's own client.
export async function writeSignalSnapshot(readout, { checkedIn = false } = {}) {
  const userId = await currentUserId()
  if (!userId || !readout) return
  const row = {
    user_id: userId,
    date: todayISO(),
    readiness_index: readout.readiness?.enough ? readout.readiness.index : null,
    readiness_label: readout.readiness?.enough ? readout.readiness.label : null,
    finger_state: readout.recovery?.key ?? null,
    finger_days_7: readout.recovery?.days7 ?? null,
    finger_days_28: readout.recovery?.days28 ?? null,
    chronic_level: readout.recovery?.chronicLevel ?? null,
    sustained_weeks: readout.recovery?.sustainedWeeks ?? null,
    checked_in: !!checkedIn,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('coach_signal_snapshots')
    .upsert(row, { onConflict: 'user_id,date' })
  // A missing table means the migration has not been run, which is a normal
  // state for an install that has never had a coach.
  if (error && !isMissingTable(error)) throw error
}

// Has this athlete shared signals with anyone? Used to avoid writing snapshots
// nobody can read.
export async function sharesWithAnyone() {
  const { coaches } = await loadCoachLinks().catch(() => ({ coaches: [] }))
  return (coaches || []).some((c) => c.status === 'accepted' && c.sharesSignals)
}

export async function setSignalSharing(linkId, on) {
  const { error } = await supabase
    .from('coach_links')
    .update({ shares_signals: !!on })
    .eq('id', linkId)
  if (error) throw error
}

// Everything the squad screen shows: one row per athlete, worst problem first.
export async function fetchSquad() {
  const { athletes } = await loadCoachLinks()
  const shared = (athletes || []).filter((a) => a.sharesSignals)
  if (!shared.length) return { athletes: [], weekStart: currentWeekStart(), sharedCount: 0 }

  const ids = shared.map((a) => a.otherId)
  const week = currentWeekStart()

  const [snapRes, ostrcRes] = await Promise.allSettled([
    supabase
      .from('coach_signal_snapshots')
      .select('*')
      .in('user_id', ids)
      .order('date', { ascending: false }),
    supabase
      .from('ostrc_reports')
      .select('*')
      .in('user_id', ids)
      .gte('week_start', week),
  ])
  const snaps = snapRes.status === 'fulfilled' ? snapRes.value.data || [] : []
  const ostrc = ostrcRes.status === 'fulfilled' ? ostrcRes.value.data || [] : []

  const latestSnap = new Map()
  for (const s of snaps) if (!latestSnap.has(s.user_id)) latestSnap.set(s.user_id, s)

  const rows = shared.map((a) => {
    const snap = latestSnap.get(a.otherId) || null
    const problems = ostrc
      .filter((r) => r.user_id === a.otherId)
      .map((r) => ({
        area: r.area,
        severity: ostrcSeverity(r),
        substantial: isSubstantial(r),
      }))
      .filter((p) => p.severity > 0)
      .sort((x, y) => y.severity - x.severity)
    return {
      id: a.otherId,
      linkId: a.id,
      name: a.profile?.display_name || a.profile?.email || 'Athlete',
      snapshot: snap,
      stale: !snap || snap.date !== todayISO(),
      problems,
      worst: problems[0]?.severity || 0,
      substantial: problems.some((p) => p.substantial),
      // Answering the questionnaire at all is the thing a coach most needs to
      // know is missing.
      reportedThisWeek: problems.length > 0 || ostrc.some((r) => r.user_id === a.otherId),
    }
  })

  // Substantial problems first, then by severity, then people with no data at
  // all, then everyone else. Never by anything resembling performance.
  rows.sort((a, b) => {
    if (a.substantial !== b.substantial) return a.substantial ? -1 : 1
    if (a.worst !== b.worst) return b.worst - a.worst
    if (a.reportedThisWeek !== b.reportedThisWeek) return a.reportedThisWeek ? 1 : -1
    return a.name.localeCompare(b.name)
  })

  return { athletes: rows, weekStart: week, sharedCount: rows.length, areas: BODY_AREAS }
}

// Severity to a colour band. Deliberately three bands, matching the coach's own
// tone vocabulary, rather than a continuous heat map that invites reading
// precision into a 0-100 questionnaire score.
export function severityBand(severity, substantial) {
  if (!severity) return 'none'
  if (substantial) return 'substantial'
  return 'some'
}
