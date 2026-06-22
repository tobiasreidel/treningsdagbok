// Friends, requests, shared feed + leaderboard, and privacy. All access is
// RLS-guarded server-side; the client only ever sees what it's allowed to.
import { supabase } from './supabase'

async function uid() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// ---- profile + privacy -----------------------------------------------------
export async function getMyProfile() {
  const id = await uid()
  if (!id) return null
  const { data } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', id)
    .maybeSingle()
  return data || {}
}

export async function setDisplayName(name) {
  const id = await uid()
  if (!id) throw new Error('Not signed in')
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, display_name: name?.trim() || null })
  if (error) throw error
}

export async function getShareSetting() {
  const { data } = await supabase
    .from('user_settings')
    .select('share_activities')
    .maybeSingle()
  return data?.share_activities ?? true
}

export async function setShareSetting(value) {
  const id = await uid()
  if (!id) throw new Error('Not signed in')
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: id, share_activities: value, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ---- requests + connections ------------------------------------------------
// returns 'ok' | 'not_found' | 'self' | 'exists'
export async function sendRequest(email) {
  const { data, error } = await supabase.rpc('send_friend_request', {
    target_email: email,
  })
  if (error) throw error
  return data
}

export async function loadConnections() {
  const me = await uid()
  if (!me) return { me: null, friends: [], incoming: [], outgoing: [] }
  const { data: fs, error } = await supabase.from('friendships').select('*')
  if (error) throw error

  const other = (f) => (f.requester === me ? f.addressee : f.requester)
  const ids = [...new Set(fs.map(other))]
  let profById = {}
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids)
    profById = Object.fromEntries((profs || []).map((p) => [p.id, p]))
  }
  const decorate = (f) => ({
    id: f.id,
    status: f.status,
    otherId: other(f),
    profile: profById[other(f)] || {},
  })
  return {
    me,
    friends: fs.filter((f) => f.status === 'accepted').map(decorate),
    incoming: fs.filter((f) => f.status === 'pending' && f.addressee === me).map(decorate),
    outgoing: fs.filter((f) => f.status === 'pending' && f.requester === me).map(decorate),
  }
}

export async function respondRequest(id, accept) {
  if (accept) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
    if (error) throw error
  } else {
    await removeFriend(id)
  }
}

export async function removeFriend(id) {
  const { error } = await supabase.from('friendships').delete().eq('id', id)
  if (error) throw error
}

// ---- shared feed -----------------------------------------------------------
// Friends' sessions (RLS only returns the ones they share). Each row is tagged
// with the friend's display name.
export async function friendsFeed(friends) {
  const ids = friends.map((f) => f.otherId)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routes(*)')
    .in('user_id', ids)
    .order('date', { ascending: false })
    .limit(40)
  if (error) throw error
  const nameById = Object.fromEntries(
    friends.map((f) => [f.otherId, f.profile?.display_name || f.profile?.email || 'Friend']),
  )
  return data.map((s) => ({ ...s, who: nameById[s.user_id] || 'Friend' }))
}
