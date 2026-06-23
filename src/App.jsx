import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { flushOutbox } from './lib/sessions'
import { autoImportNewRides } from './lib/intervals'
import SetupNeeded from './components/SetupNeeded'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import RegisterSession from './pages/RegisterSession'
import SessionDetail from './pages/SessionDetail'
import EditSession from './pages/EditSession'
import Settings from './pages/Settings'
import ImportRides from './pages/ImportRides'
import Stats from './pages/Stats'
import Friends from './pages/Friends'

// Broadcast helper so views can refresh after the outbox is flushed.
export function notifySessionsChanged() {
  window.dispatchEvent(new Event('sessions:changed'))
}

export default function App() {
  const { session, loading } = useAuth()

  // Flush any queued offline sessions on load and whenever we come back online.
  useEffect(() => {
    if (!session) return
    const sync = async () => {
      const n = await flushOutbox().catch(() => 0)
      if (n > 0) notifySessionsChanged()
      // Pull any new rides from intervals.icu so they appear without a manual
      // visit to the import screen. Best-effort; failures are ignored.
      const imported = await autoImportNewRides().catch(() => 0)
      if (imported > 0) notifySessionsChanged()
    }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [session])

  if (!isConfigured) return <SetupNeeded />

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<RegisterSession />} />
      <Route path="/session/:id" element={<SessionDetail />} />
      <Route path="/session/:id/edit" element={<EditSession />} />
      <Route path="/import" element={<ImportRides />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
