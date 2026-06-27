import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { flushOutbox } from './lib/sessions'
import { autoImportNewActivities } from './lib/intervals'
import { isOnboarded } from './lib/prefs'
import SetupNeeded from './components/SetupNeeded'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import RegisterSession from './pages/RegisterSession'
import SessionDetail from './pages/SessionDetail'
import EditSession from './pages/EditSession'
import Settings from './pages/Settings'
import ImportRides from './pages/ImportRides'
import Stats from './pages/Stats'
import Logbook from './pages/Logbook'
import Friends from './pages/Friends'
import AthleteView from './pages/AthleteView'

// Broadcast helper so views can refresh after the outbox is flushed.
export function notifySessionsChanged() {
  window.dispatchEvent(new Event('sessions:changed'))
}

export default function App() {
  const { session, loading } = useAuth()
  // Bumped to re-evaluate onboarding after the picker finishes. The value is
  // unused — onboarding state itself is read from prefs, keyed by user id.
  const [, bumpOnboarding] = useState(0)

  // Flush any queued offline sessions on load and whenever we come back online.
  useEffect(() => {
    if (!session) return
    const sync = async () => {
      const n = await flushOutbox().catch(() => 0)
      if (n > 0) notifySessionsChanged()
      // Pull any new rides/climbs from intervals.icu so they appear without a
      // manual visit to the import screen. Best-effort; failures are ignored.
      const imported = await autoImportNewActivities().catch(() => 0)
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

  const userId = session.user?.id
  if (!isOnboarded(userId)) {
    return <Onboarding userId={userId} onDone={() => bumpOnboarding((n) => n + 1)} />
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<RegisterSession />} />
      <Route path="/session/:id" element={<SessionDetail />} />
      <Route path="/session/:id/edit" element={<EditSession />} />
      <Route path="/import" element={<ImportRides />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/logbook" element={<Logbook />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/athlete/:id" element={<AthleteView />} />
      <Route path="/athlete/:id/stats" element={<Stats />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
