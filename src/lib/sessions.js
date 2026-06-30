// Data access for sessions. This is the only module that talks to Supabase for
// session data. It transparently falls back to the offline outbox on write when
// there's no connectivity, so a logged session is never lost.
import { supabase, isConfigured, PHOTO_BUCKET } from './supabase'
import { enqueue, listPending, remove } from './outbox'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function currentUserId() {
  // getSession() reads the locally-stored session (no network round-trip),
  // which keeps writes fast and avoids hanging on flaky connections.
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = (err?.message || '').toLowerCase()
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to') ||
    msg.includes('timeout')
  )
}

// Postgres unique-violation — hit when the same intervals.icu activity is
// imported twice (see supabase/dedupe_intervals.sql). Not a real failure:
// the session already exists, so we treat it as a no-op.
function isDuplicateError(err) {
  return err?.code === '23505'
}

function extFromFile(file) {
  if (!file) return 'jpg'
  const fromName = file.name?.split('.').pop()
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase()
  }
  const t = file.type?.split('/')[1]
  return t === 'jpeg' ? 'jpg' : t || 'jpg'
}

// Turn the form's shape into a server-bound "item" (data + routes + photo).
function buildItem(form, kind = 'create') {
  const data = {
    date: form.date,
    sport: form.sport,
    subtype: form.subtype || null,
    location: form.sport === 'climbing' ? form.location || null : null,
    feeling: form.feeling ?? null,
    rpe: form.rpe ?? null,
    duration: form.duration === '' || form.duration == null ? null : Number(form.duration),
    notes: form.notes?.trim() || null,
    extra: form.extra || {},
  }
  const routes = (form.routes || []).map((r, i) => ({
    name: r.name?.trim() || null,
    grade: r.grade || null,
    send_type: r.send_type || null,
    position: i,
  }))
  return {
    kind,
    data,
    routes,
    photoBlob: form.photoFile || null,
    photoExt: extFromFile(form.photoFile),
    existingPhotoUrl: form.photoUrl || null,
  }
}

async function uploadPhoto(userId, blob, ext) {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

// Insert a brand-new session (+ its routes) on the server.
async function pushNewToServer(item) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')

  let photo_url = item.existingPhotoUrl
  if (item.photoBlob) {
    photo_url = await uploadPhoto(userId, item.photoBlob, item.photoExt)
  }

  const { data: inserted, error } = await supabase
    .from('sessions')
    .insert({ ...item.data, user_id: userId, photo_url })
    .select('*, routes(*)')
    .single()
  if (error) throw error

  if (item.routes.length) {
    const rows = item.routes.map((r) => ({ ...r, session_id: inserted.id, user_id: userId }))
    const { error: rErr } = await supabase.from('routes').insert(rows)
    if (rErr) throw rErr
  }
  return inserted
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

// Create a session. Returns { pending: boolean }. On no-connectivity the session
// is queued offline and flushed later.
export async function createSession(form) {
  const item = buildItem(form, 'create')

  if (!isConfigured || typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(item)
    return { pending: true }
  }
  try {
    const session = await pushNewToServer(item)
    return { pending: false, session }
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue(item)
      return { pending: true }
    }
    if (isDuplicateError(err)) {
      // Already imported (a concurrent import won the race). Harmless.
      return { duplicate: true }
    }
    throw err
  }
}

// Editing/deleting need connectivity (they target an existing server row).
export async function updateSession(id, form) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  const item = buildItem(form, 'update')

  let photo_url = item.existingPhotoUrl
  if (item.photoBlob) {
    photo_url = await uploadPhoto(userId, item.photoBlob, item.photoExt)
    if (item.existingPhotoUrl) await deletePhoto(item.existingPhotoUrl)
  } else if (form.removePhoto && item.existingPhotoUrl) {
    await deletePhoto(item.existingPhotoUrl)
    photo_url = null
  }

  const { error } = await supabase
    .from('sessions')
    .update({ ...item.data, photo_url })
    .eq('id', id)
  if (error) throw error

  // Routes: replace wholesale (small lists, keeps ordering + edits simple).
  const { error: delErr } = await supabase.from('routes').delete().eq('session_id', id)
  if (delErr) throw delErr
  if (item.routes.length) {
    const rows = item.routes.map((r) => ({ ...r, session_id: id, user_id: userId }))
    const { error: insErr } = await supabase.from('routes').insert(rows)
    if (insErr) throw insErr
  }
  return { ok: true }
}

export async function deleteSession(session) {
  if (session.photo_url) await deletePhoto(session.photo_url).catch(() => {})
  const { error } = await supabase.from('sessions').delete().eq('id', session.id)
  if (error) throw error
}

async function deletePhoto(path) {
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}

export async function getCurrentUserId() {
  return currentUserId()
}

// Fetch a user's sessions, newest first, with their route logs joined in.
// Defaults to *your own*; pass an athlete's id to read theirs (only works when
// you're an accepted coach — RLS enforces it). Scoping by user_id is required:
// once you have friends/coaches, RLS also permits selecting their shared
// sessions, so an unscoped select would pull other people's sessions into your
// personal dashboard/stats. (The friends feed fetches those separately.)
export async function fetchSessions(forUserId) {
  const userId = forUserId || (await currentUserId())
  let query = supabase
    .from('sessions')
    .select('*, routes(*)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  // Sort joined routes by their stored position.
  for (const s of data) {
    if (Array.isArray(s.routes)) s.routes.sort((a, b) => a.position - b.position)
  }
  return data
}

export async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, routes(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  if (Array.isArray(data.routes)) data.routes.sort((a, b) => a.position - b.position)
  return data
}

export async function getSignedPhotoUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

// Pending (offline) sessions, normalised to look like server rows for display.
export async function getPendingSessions() {
  const items = await listPending()
  return items.map((item) => ({
    id: item.localId,
    pending: true,
    ...item.data,
    routes: item.routes || [],
  }))
}

// Push every queued session to the server. Returns the number flushed.
export async function flushOutbox() {
  if (!isConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0
  const userId = await currentUserId()
  if (!userId) return 0

  const items = await listPending()
  let flushed = 0
  for (const item of items) {
    try {
      await pushNewToServer(item)
      await remove(item.localId)
      flushed += 1
    } catch (err) {
      if (isNetworkError(err)) break // still offline — stop and try again later
      // A non-network error (e.g. bad data) shouldn't wedge the queue forever.
      await remove(item.localId)
    }
  }
  return flushed
}
