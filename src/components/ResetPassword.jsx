import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Shown when the user lands here from a password-reset email link (Supabase
// signs them in with a recovery session). They pick a new password and land
// straight in the app.
export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error } = await updatePassword(password)
      if (error) throw error
      // Success clears the recovery flag in AuthContext; App re-renders into
      // the signed-in app.
    } catch (err) {
      setError(err.message || 'Could not update the password')
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="auth-logo">🔑</span>
          <h1>Choose a new password</h1>
          <p className="muted">You're signed in — just set a new password to finish.</p>
        </div>

        <label className="field">
          <span className="field-label">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
