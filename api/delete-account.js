// Vercel serverless function: POST /api/delete-account
//
// A signed-in user permanently deletes their own account. We verify their
// session, then delete the auth user with the service-role key - all
// user-owned rows (sessions, routes, profile, friendships, ...) cascade-delete
// via their `references auth.users(id) on delete cascade` foreign keys, so no
// extra cleanup queries are needed here.
//
// Required env vars: same as api/feedback.js (SUPABASE_URL/VITE_SUPABASE_URL,
// SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Server not configured (Supabase URL/anon key missing).' })
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res
      .status(500)
      .json({ error: 'Server not configured (SUPABASE_SERVICE_ROLE_KEY missing in Vercel).' })
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  // 1) Verify the session against Supabase Auth - this is what gates the
  //    endpoint to signed-in users and gives us the id to delete.
  let user
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!ur.ok) {
      return res.status(401).json({ error: 'Your session expired - sign in again.' })
    }
    user = await ur.json()
  } catch (err) {
    return res.status(502).json({ error: 'Could not verify your session.', detail: String(err) })
  }
  if (!user?.id) return res.status(401).json({ error: 'Your session expired - sign in again.' })

  // 2) Delete the auth user with the service role. Postgres FK cascades
  //    remove every row that references it.
  try {
    const dr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
    if (!dr.ok) {
      const rawBody = await dr.text()
      return res.status(502).json({
        error: `Could not delete your account (Supabase ${dr.status}).`,
        detail: rawBody.slice(0, 300),
      })
    }
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the database.', detail: String(err) })
  }

  return res.status(200).json({ ok: true })
}
