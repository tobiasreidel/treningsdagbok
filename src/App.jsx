import { lazy, Suspense, useEffect, useState } from 'react'
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
import ResetPassword from './components/ResetPassword'
import TabBar, { TABBAR_PATHS } from './components/TabBar'

// Only the dashboard ships in the first download - it is the screen every
// launch lands on, and on a phone the rest is dead weight until tapped. Each
// page below becomes its own chunk, fetched on navigation and then precached
// by the service worker, so the second visit (and offline) still has them.
const RegisterSession = lazy(() => import('./pages/RegisterSession'))
const SessionDetail = lazy(() => import('./pages/SessionDetail'))
const EditSession = lazy(() => import('./pages/EditSession'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const ImportRides = lazy(() => import('./pages/ImportRides'))
const Stats = lazy(() => import('./pages/Stats'))
const Logbook = lazy(() => import('./pages/Logbook'))
const CustomizeDashboard = lazy(() => import('./pages/CustomizeDashboard'))
const Friends = lazy(() => import('./pages/Friends'))
const AthleteView = lazy(() => import('./pages/AthleteView'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Coach = lazy(() => import('./pages/Coach'))
const CoachSetup = lazy(() => import('./pages/CoachSetup'))
const CoachLibrary = lazy(() => import('./pages/CoachLibrary'))
const CoachSignals = lazy(() => import('./pages/CoachSignals'))
const CheckIn = lazy(() => import('./pages/CheckIn'))

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

  if (loading) return <Splash />

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
      <Suspense fallback={<Splash />}>
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
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/coach/plan" element={<Coach />} />
          <Route path="/coach/tests" element={<Coach />} />
          <Route path="/coach/setup" element={<CoachSetup />} />
          <Route path="/coach/library" element={<CoachLibrary />} />
          <Route path="/coach/signals" element={<CoachSignals />} />
          <Route path="/coach/signals/:key" element={<CoachSignals />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/athlete/:id" element={<AthleteView />} />
          <Route path="/athlete/:id/stats" element={<Stats />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {showTabs && <TabBar />}
    </div>
  )
}

// Shown while the app boots and while a page chunk is on its way. Same markup
// either way, so a slow network looks like a slightly longer launch rather
// than a second, different loading state.
function Splash() {
  return (
    <div className="splash">
      <div className="spinner" />
    </div>
  )
}
