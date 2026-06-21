import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars are missing we don't crash the whole app — instead `isConfigured`
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
