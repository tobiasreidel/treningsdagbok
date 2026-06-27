// Vercel serverless function: POST /api/feedback
//
// A signed-in user sends a bug report or feature request. We verify their
// session, record it in the rate-limited `feedback` table, then email it via
// Resend. Both the Resend key and the Supabase service-role key live only here,
// never in the browser bundle.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY                 — from resend.com
//   SUPABASE_SERVICE_ROLE_KEY      — Supabase → Project Settings → API → service_role (secret!)
//   SUPABASE_URL / VITE_SUPABASE_URL        — your project URL (already set for the build)
//   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY — your anon key (already set for the build)
// Optional:
//   FEEDBACK_TO    — recipient (default tobias@reidel.net)
//   FEEDBACK_FROM  — sender (default Resend's shared test sender)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FEEDBACK_TO = process.env.FEEDBACK_TO || 'tobias@reidel.net'
const FEEDBACK_FROM = process.env.FEEDBACK_FROM || 'Treningsdagbok <onboarding@resend.dev>'

const TYPE_LABELS = { bug: 'Bug report', feature: 'Feature request' }

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

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  const type = String(body?.type || '').toLowerCase()
  const message = String(body?.message || '').trim()
  if (!TYPE_LABELS[type]) return res.status(400).json({ error: 'Pick bug or feature.' })
  if (message.length < 1) return res.status(400).json({ error: 'Write a message first.' })
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message is too long (max 2000 characters).' })
  }

  // 1) Verify the session against Supabase Auth — this is what gates the
  //    endpoint to signed-in users and gives us a trustworthy id + email.
  let user
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!ur.ok) {
      return res.status(401).json({ error: 'Your session expired — sign in again.' })
    }
    user = await ur.json()
  } catch (err) {
    return res.status(502).json({ error: 'Could not verify your session.', detail: String(err) })
  }
  if (!user?.id) return res.status(401).json({ error: 'Your session expired — sign in again.' })

  // 2) Record it with the service role (bypasses RLS; the per-user rate-limit
  //    trigger still fires, so abuse protection is unchanged).
  let row
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ user_id: user.id, email: user.email || null, type, message }),
    })
    const rawBody = await r.text()
    let payload = null
    try {
      payload = rawBody ? JSON.parse(rawBody) : null
    } catch {
      // non-JSON body
    }
    if (!r.ok) {
      const pgMsg = String(payload?.message || payload?.error || rawBody || '').slice(0, 300)
      if (pgMsg.includes('rate_limit')) {
        return res
          .status(429)
          .json({ error: "You've sent a lot of feedback recently — please try again later." })
      }
      return res.status(502).json({
        error: `Could not record your message (Supabase ${r.status}).`,
        detail: pgMsg,
      })
    }
    row = Array.isArray(payload) ? payload[0] : payload
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the database.', detail: String(err) })
  }

  // 3) Email it. The message is already saved, so delivery is best-effort —
  //    a failure here still returns success (nothing is lost).
  if (!RESEND_API_KEY) {
    return res.status(200).json({ ok: true, emailed: false })
  }
  try {
    const from = row?.email || user.email || 'unknown'
    const snippet = message.length > 60 ? `${message.slice(0, 60)}…` : message
    const text =
      `${TYPE_LABELS[type]}\n` +
      `From: ${from}\n` +
      `User ID: ${row?.user_id || user.id}\n` +
      `When: ${row?.created_at || new Date().toISOString()}\n\n` +
      message

    const er = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [FEEDBACK_TO],
        ...(from && from !== 'unknown' ? { reply_to: from } : {}),
        subject: `[Treningsdagbok] ${TYPE_LABELS[type]}: ${snippet}`,
        text,
      }),
    })
    return res.status(200).json({ ok: true, emailed: er.ok })
  } catch {
    return res.status(200).json({ ok: true, emailed: false })
  }
}
