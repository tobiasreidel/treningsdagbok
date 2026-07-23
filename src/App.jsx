import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { flushOutbox, notifySessionsChanged } from './lib/sessions'
import { autoImportNewActivities } from './lib/intervals'
import { autoShareAnalyses } from './lib/streams'
import { isOnboarded } from './lib/prefs'
import SetupNeeded from './components/SetupNeeded'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import RegisterSession from './pages/RegisterSession'
import SessionDetail from './pages/SessionDetail'
import EditSession from './pages/EditSession'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import ImportRides from './pages/ImportRides'
import Stats from './pages/Stats'
import Logbook from './pages/Logbook'
import CustomizeDashboard from './pages/CustomizeDashboard'
import Friends from './pages/Friends'
import AthleteView from './pages/AthleteView'
import ResetPassword from './components/ResetPassword'
import TabBar, { TABBAR_PATHS } from './components/TabBar'

export default function App() {
  const { session, loading, recovery } = useAuth()
  const location = useLocation()
  // Bumped to re-evaluate onboarding after the picker finishes. The value is
  // unused - onboarding state itself is read from prefs, keyed by user id.
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
      if (imported > 0) {
        notifySessionsChanged()
        // Sessions appearing out of nowhere is confusing - tell the user why
        // (the dashboard shows this as a toast).
        window.dispatchEvent(
          new CustomEvent('activities:imported', { detail: { count: imported } }),
        )
      }
      // Friends can't read your activities from intervals.icu, so a copy of
      // each one's charts is stored for them. Runs here (not just on the
      // settings screen) so "Friends can see" needs no follow-up visit
      // anywhere. Cheap once everything is shared: a single query.
      autoShareAnalyses()
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

  // Arrived via a password-reset email link: let them set a new password
  // before anything else.
  if (recovery) return <ResetPassword />

  if (!session) return <Login />

  const userId = session.user?.id
  if (!isOnboarded(userId)) {
    return <Onboarding userId={userId} onDone={() => bumpOnboarding((n) => n + 1)} />
  }

  const showTabs = TABBAR_PATHS.includes(location.pathname)

  return (
    <div className={showTabs ? 'with-tabbar' : ''}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<RegisterSession />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="/session/:id/edit" element={<EditSession />} />
        <Route path="/import" element={<ImportRides />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/logbook" element={<Logbook />} />
        <Route path="/widgets" element={<CustomizeDashboard />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/athlete/:id" element={<AthleteView />} />
        <Route path="/athlete/:id/stats" element={<Stats />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showTabs && <TabBar />}
    </div>
  )
}
