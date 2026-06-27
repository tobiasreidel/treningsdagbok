import { supabase } from './supabase'

// Send a bug report or feature request. Posts to the /api/feedback serverless
// function, which records it (rate-limited) and emails it. Requires a session.
export async function sendFeedback(type, message) {
  if (!supabase) throw new Error('Not connected.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Please sign in first.')

  let res
  try {
    res = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, message }),
    })
  } catch {
    throw new Error('Network error — please try again.')
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    throw new Error(body?.error || 'Could not send — please try again.')
  }
  return body || { ok: true }
}
