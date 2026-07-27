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

  // 2) Delete the photos first. Storage objects are not rows and have no
  //    foreign key to auth.users, so the cascade below does not touch them -
  //    without this, "delete my account" left every session photo and the
  //    avatar sitting in the bucket forever. Best effort: a storage failure
  //    must not block the deletion the user actually asked for, so it is
  //    reported alongside the success rather than instead of it.
  let photoNote = null
  try {
    const removed = await deletePhotos(user.id)
    if (removed === null) photoNote = 'Your photos could not be removed - contact the owner.'
  } catch (err) {
    photoNote = `Your photos could not be removed (${String(err).slice(0, 120)}).`
  }

  // 3) Delete the auth user with the service role. Postgres FK cascades
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

  return res.status(200).json({ ok: true, ...(photoNote ? { note: photoNote } : {}) })
}

const PHOTO_BUCKET = 'session-photos'
// Storage list is paginated; a long-running diary can hold hundreds of photos.
const PAGE = 100

// Every object under `<userId>/`: session photos and the avatar both live
// there (see the storage policies in supabase/schema.sql, which key access on
// the first path segment). Returns the number removed, or null if the bucket
// wouldn't answer.
async function deletePhotos(userId) {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  let removed = 0
  // Always list from offset 0: each pass deletes what it lists, so the next
  // page moves down to take its place.
  for (let pass = 0; pass < 50; pass += 1) {
    const lr = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${PHOTO_BUCKET}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: `${userId}/`, limit: PAGE, offset: 0 }),
    })
    if (!lr.ok) return null
    const items = await lr.json()
    if (!Array.isArray(items) || items.length === 0) return removed

    const prefixes = items.map((o) => `${userId}/${o.name}`)
    const dr = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes }),
    })
    if (!dr.ok) return null
    removed += prefixes.length
    if (items.length < PAGE) return removed
  }
  return removed
}
