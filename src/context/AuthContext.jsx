import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase'
import { invalidate as forgetSessions } from '../lib/sessionCache'
import { forgetSettings } from '../lib/intervals'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // True while the user arrived via a password-reset email link and hasn't
  // chosen a new password yet (App shows the ResetPassword screen).
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Whoever is signed in changed: drop the in-memory copies so nothing
      // held for the previous account can be read by this one. (The persisted
      // session copy is keyed by user id, so it needs no clearing.)
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        forgetSessions()
        forgetSettings()
      }
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
    updatePassword: async (password) => {
      const res = await supabase.auth.updateUser({ password })
      if (!res.error) setRecovery(false)
      return res
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
