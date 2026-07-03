import { supabase } from './supabase'

// Permanently delete the signed-in user's account via the /api/delete-account
// serverless function. All owned data cascade-deletes server-side.
export async function deleteAccount() {
  if (!supabase) throw new Error('Not connected.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in first.')

  let res
  try {
    res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    throw new Error('Network error. Please try again.')
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    // A 404 here means the serverless function isn't running — e.g. the app is
    // served by plain `vite` (dev) rather than Vercel, or hasn't been
    // redeployed. Surface the status so that's obvious instead of a vague fail.
    const base =
      body?.error || `Could not delete account (HTTP ${res.status}). Please try again.`
    throw new Error(body?.detail ? `${base} ${body.detail}` : base)
  }
  return body || { ok: true }
}
