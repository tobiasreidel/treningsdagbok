import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDay } from '../lib/format'
import { fetchSessions, createSession } from '../lib/sessions'
import { notifySessionsChanged } from '../App'
import {
  getSettings,
  hasCredentials,
  fetchCyclingActivities,
  activityToForm,
  activitySummary,
} from '../lib/intervals'

export default function ImportRides() {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const settings = await getSettings()
        if (!hasCredentials(settings)) {
          if (alive) setState({ status: 'no-creds' })
          return
        }
        const [activities, sessions] = await Promise.all([
          fetchCyclingActivities({ ...settings, sinceDays: 60 }),
          fetchSessions().catch(() => []),
        ])
        // De-dupe: hide activities already imported (matched by intervals_id),
        // and flag activities whose date already has a manual cycling session.
        const importedIds = new Set(
          sessions.map((s) => s.extra?.intervals_id).filter(Boolean),
        )
        const cyclingDates = new Set(
          sessions.filter((s) => s.sport === 'cycling').map((s) => s.date),
        )
        const items = activities
          .filter((a) => !importedIds.has(String(a.id)))
          .map((a) => ({
            activity: a,
            maybeDup: cyclingDates.has((a.start_date_local || '').slice(0, 10)),
          }))
        if (alive) setState({ status: 'ready', items })
      } catch (err) {
        if (alive) setState({ status: 'error', message: err.message })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Add a single ride immediately (objective fields only; edit later).
  const addOne = async (activity) => {
    setBusy(true)
    setError(null)
    try {
      await createSession(activityToForm(activity))
      notifySessionsChanged()
      setState((s) => ({
        ...s,
        items: s.items.filter((i) => i.activity.id !== activity.id),
      }))
    } catch (err) {
      setError(err.message || 'Could not import that ride')
    } finally {
      setBusy(false)
    }
  }

  // Add every listed ride, then return to the dashboard.
  const addAll = async () => {
    setBusy(true)
    setError(null)
    const n = state.items.length
    try {
      for (const { activity } of state.items) {
        await createSession(activityToForm(activity))
      }
      notifySessionsChanged()
      navigate('/', {
        state: { toast: `Imported ${n} ride${n === 1 ? '' : 's'} — add feeling & notes anytime` },
      })
    } catch (err) {
      setError(err.message || 'Some rides could not be imported')
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Import rides</h1>
        </div>
        <button
          className="icon-btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      <main className="wizard-body stack">
        {state.status === 'loading' && (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        )}

        {state.status === 'no-creds' && (
          <div className="card empty-state">
            <p>intervals.icu isn’t connected yet.</p>
            <p className="muted small">Add your API key to pull in your rides.</p>
            <button className="btn btn-primary" onClick={() => navigate('/settings')}>
              Connect intervals.icu
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="card empty-state">
            <p className="auth-error">{state.message}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/settings')}>
              Check settings
            </button>
          </div>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <div className="card empty-state">
            <p>No new rides to import.</p>
            <p className="muted small">
              Everything from the last 60 days is already logged.
            </p>
          </div>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <>
            <button className="btn btn-primary btn-block" onClick={addAll} disabled={busy}>
              {busy ? 'Importing…' : `Import all ${state.items.length} rides`}
            </button>
            <p className="muted small">
              Objective data is filled in automatically — tap a session afterwards
              to add feeling, RPE and notes.
            </p>
            {error && <p className="auth-error">{error}</p>}

            {state.items.map(({ activity, maybeDup }) => (
              <div key={activity.id} className="import-card card">
                <div className="import-main">
                  <span className="import-name">🚴 {activity.name || 'Ride'}</span>
                  <span className="import-meta">
                    {formatDay((activity.start_date_local || '').slice(0, 10))} ·{' '}
                    {activitySummary(activity)}
                  </span>
                  {maybeDup && (
                    <span className="pending-badge">
                      possible duplicate — already a ride that day
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => addOne(activity)}
                  disabled={busy}
                >
                  + Add
                </button>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  )
}
