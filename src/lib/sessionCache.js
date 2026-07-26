// A local copy of your own session history, so the app has something to show
// when the network doesn't answer — and so one app launch doesn't download the
// whole diary three times over.
//
// Two layers, both keyed to the signed-in user:
//   • memory — collapses the burst of callers at boot (the dashboard, the
//     intervals.icu auto-import and the friend-share pass all want the same
//     list within a few hundred ms) into one request.
//   • IndexedDB — survives a reload, and is what turns "installable PWA" into
//     an app that still shows your training in a basement gym.
//
// Deliberately not a general cache: sessions are the one read every screen
// makes, they are yours alone (no sharing worries), and they change only
// through writes this app makes — which call invalidate().
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

const KEY_PREFIX = 'sessions:v1:'

// One in-flight request per user, shared by every caller that arrives while it
// is running. This is what collapses three boot-time fetches into one.
let inflight = null
let inflightKey = null

// Last good list, as returned to callers. Cleared by invalidate().
let memory = null
let memoryKey = null

const keyFor = (userId) => `${KEY_PREFIX}${userId || 'me'}`

export function cachedSessions(userId) {
  return memoryKey === keyFor(userId) ? memory : null
}

// Read the persisted copy. Returns null when there isn't one.
export async function loadPersisted(userId) {
  try {
    const rows = await idbGet(keyFor(userId))
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

async function persist(userId, rows) {
  try {
    await idbSet(keyFor(userId), rows)
  } catch {
    // Storage full or blocked (Safari private mode). The memory layer still
    // works for this visit; nothing else depends on the write succeeding.
  }
}

// Run `fetcher` at most once per user for as long as it is in flight, then
// remember the result in both layers.
export async function fetchThroughCache(userId, fetcher) {
  const key = keyFor(userId)
  if (memoryKey === key && memory) return memory
  if (inflight && inflightKey === key) return inflight

  inflightKey = key
  inflight = (async () => {
    try {
      const rows = await fetcher()
      memory = rows
      memoryKey = key
      persist(userId, rows)
      return rows
    } finally {
      inflight = null
      inflightKey = null
    }
  })()
  return inflight
}

// After any write. Drops both layers so the next read goes to the server —
// the stale list is worse than a round-trip here, because the user is looking
// at a change they just made.
export function invalidate() {
  memory = null
  memoryKey = null
}

export async function clearPersisted(userId) {
  invalidate()
  try {
    await idbDel(keyFor(userId))
  } catch {
    // nothing to do - a stale copy is dropped on the next successful fetch
  }
}
