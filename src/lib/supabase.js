import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars are missing we don't crash the whole app - instead `isConfigured`
// is false and the UI shows a friendly "finish setup" screen (see App.jsx).
export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'))

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const PHOTO_BUCKET = 'session-photos'

// The signed-in user's id, or null. getSession() reads the locally-stored
// session (no network round-trip), which keeps writes fast and avoids hanging
// on a flaky connection.
export async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// PostgREST reports a missing table as PGRST205; 42P01 is Postgres's own code.
// Deliberately NOT matched on the message text: PGRST204 (a missing *column*)
// is phrased almost identically, and telling someone to re-run a migration
// they have already run is worse than saying nothing.
export function isMissingTable(err) {
  return err?.code === 'PGRST205' || err?.code === '42P01'
}
