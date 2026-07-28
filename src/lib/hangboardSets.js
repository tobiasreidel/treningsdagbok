// The hangboard_sets table (see the 20260728010000_hangboard_sets migration).
//
// `sessions.extra` is still the source of truth. This table is written alongside
// it so the rows exist, are typed, and are queryable, but nothing reads from it
// yet. Switching the read path in the same change that introduces the table
// would mean a bug in either one silently loses training data, and losing a
// logged session is the one failure this app cannot have.
//
// So: dual write now, compare against `extra` on real data, move the reads
// later. `mirrorHangboardSets` is best-effort by design - a failure here must
// never fail the save of the session itself.
import { supabase, currentUserId, isMissingTable } from './supabase'
import { normaliseSession } from './sessionShape'

// Flatten a session's resolved hangboard blocks into table rows.
export function rowsForSession(session, { bodyweight = 0, userId } = {}) {
  const n = normaliseSession(session, { bodyweight })
  const rows = []
  n.hangboard.forEach((block, blockIndex) => {
    block.sets.forEach((set, setIndex) => {
      rows.push({
        user_id: userId,
        session_id: session.id,
        block_index: blockIndex,
        set_index: setIndex,
        hands: block.hands,
        grip: block.grip,
        // Null, not a guess, when a legacy added-weight set has no bodyweight
        // to be read with.
        load_total_kg: set.kg,
        seconds: set.seconds,
        reps: block.reps,
        edge_mm: set.edgeMm,
        rest_s: block.restS,
        performed_on: session.date,
      })
    })
  })
  return rows
}

// Replace the mirrored rows for one session. Called after a session with finger
// work is created or edited, and quietly does nothing when the migration has not
// been applied.
export async function mirrorHangboardSets(session, { bodyweight = 0 } = {}) {
  if (!session?.id) return { skipped: 'no-id' }
  const userId = await currentUserId()
  if (!userId) return { skipped: 'not-signed-in' }

  const rows = rowsForSession(session, { bodyweight, userId })
  const del = await supabase.from('hangboard_sets').delete().eq('session_id', session.id)
  if (del.error) {
    if (isMissingTable(del.error)) return { skipped: 'no-table' }
    return { error: del.error }
  }
  if (!rows.length) return { written: 0 }
  const ins = await supabase.from('hangboard_sets').insert(rows)
  if (ins.error) {
    if (isMissingTable(ins.error)) return { skipped: 'no-table' }
    return { error: ins.error }
  }
  return { written: rows.length }
}

// Every set for a grip and edge, newest first. Not used by the app yet: this is
// the query the table exists for, and having it here is how the read path gets
// compared against `extra` before anything switches over.
export async function fetchSets({ grip = null, edgeMm = null, forUserId = null } = {}) {
  let q = supabase
    .from('hangboard_sets')
    .select('*')
    .order('performed_on', { ascending: false })
    .order('block_index')
    .order('set_index')
  if (grip) q = q.eq('grip', grip)
  if (edgeMm) q = q.eq('edge_mm', edgeMm)
  if (forUserId) q = q.eq('user_id', forUserId)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}
