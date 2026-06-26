// Coaches: an athlete grants a coach read-only access to their whole account.
// All access is RLS-guarded server-side (see supabase/coaches.sql). The athlete
// sends the request; the coach accepts. Once accepted the coach can view — but
// never change — the athlete's sessions, calendar and stats.
import { supabase } from './supabase'

async function uid() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// Ask someone (by email) to be your coach. They must accept.
// returns 'ok' | 'not_found' | 'self' | 'exists'
export async function sendCoachRequest(email) {
  const { data, error } = await supabase.rpc('send_coach_request', { coach_email: email })
  if (error) throw error
  return data
}

// All of my coach links, split by my role in each.
export async function loadCoachLinks() {
  const me = await uid()
  if (!me) return { me: null, coaches: [], requests: [], athletes: [] }
  const { data: links, error } = await supabase.from('coach_links').select('*')
  if (error) throw error

  const other = (l) => (l.athlete === me ? l.coach : l.athlete)
  const ids = [...new Set(links.map(other))]
  let profById = {}
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids)
    profById = Object.fromEntries((profs || []).map((p) => [p.id, p]))
  }
  const decorate = (l) => ({
    id: l.id,
    status: l.status,
    otherId: other(l),
    profile: profById[other(l)] || {},
  })

  return {
    me,
    // people who coach me (I'm the athlete) — pending + accepted
    coaches: links.filter((l) => l.athlete === me).map(decorate),
    // requests for me to coach someone (I'm the coach, still pending)
    requests: links.filter((l) => l.coach === me && l.status === 'pending').map(decorate),
    // athletes I actively coach (I'm the coach, accepted)
    athletes: links.filter((l) => l.coach === me && l.status === 'accepted').map(decorate),
  }
}

export async function respondCoachRequest(id, accept) {
  if (accept) {
    const { error } = await supabase.from('coach_links').update({ status: 'accepted' }).eq('id', id)
    if (error) throw error
  } else {
    await removeCoachLink(id)
  }
}

export async function removeCoachLink(id) {
  const { error } = await supabase.from('coach_links').delete().eq('id', id)
  if (error) throw error
}

export async function getAthleteProfile(id) {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .eq('id', id)
    .maybeSingle()
  return data || {}
}
