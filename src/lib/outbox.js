// Offline outbox: when a session can't be saved to Supabase (no signal, or the
// app isn't configured yet), we stash it in IndexedDB so it is never lost. It is
// flushed automatically when connectivity returns (see sessions.flushOutbox()).
import { createStore, set, del, entries } from 'idb-keyval'

const store = createStore('treningsdagbok', 'outbox')

function newLocalId() {
  // crypto.randomUUID is available in all PWA-capable browsers.
  return `local-${crypto.randomUUID()}`
}

// item = { kind, data, routes, photoBlob, photoExt }
export async function enqueue(item) {
  const localId = newLocalId()
  const record = { ...item, localId, createdAt: new Date().toISOString() }
  await set(localId, record, store)
  return record
}

export async function listPending() {
  const all = await entries(store)
  return all
    .map(([, value]) => value)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function remove(localId) {
  await del(localId, store)
}

export async function pendingCount() {
  return (await entries(store)).length
}
