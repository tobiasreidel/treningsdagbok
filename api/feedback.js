// Vercel serverless function: POST /api/feedback
//
// A signed-in user sends a bug report or feature request. We record it in the
// rate-limited `feedback` table (which both authenticates the user and throttles
// abuse), then email it via Resend. The Resend key lives only here, never in the
// browser bundle.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY                 — from resend.com
//   SUPABASE_URL / VITE_SUPABASE_URL        — your project URL
//   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY — your anon (public) key
// Optional:
//   FEEDBACK_TO    — recipient (default tobias@reidel.net)
//   FEEDBACK_FROM  — sender (default Resend's shared test sender)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
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
    return res.status(500).json({ error: 'Server not configured (Supabase env vars missing).' })
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

  // 1) Record it. RLS authenticates the user (via their token) and a trigger
  //    enforces per-user rate limits — a hit there comes back as a 400.
  let row
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ type, message }),
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
      // Surface the real Supabase status + message instead of a vague guess.
      return res.status(502).json({
        error: `Could not record your message (Supabase ${r.status}).`,
        detail: pgMsg,
      })
    }
    row = Array.isArray(payload) ? payload[0] : payload
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the database.', detail: String(err) })
  }

  // 2) Email it. The message is already saved, so delivery is best-effort —
  //    a failure here still returns success (nothing is lost).
  if (!RESEND_API_KEY) {
    return res.status(200).json({ ok: true, emailed: false })
  }
  try {
    const from = row?.email || 'unknown'
    const snippet = message.length > 60 ? `${message.slice(0, 60)}…` : message
    const text =
      `${TYPE_LABELS[type]}\n` +
      `From: ${from}\n` +
      `User ID: ${row?.user_id || 'unknown'}\n` +
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
