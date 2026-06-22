import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { addMonths } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { fetchSessions, getPendingSessions } from '../lib/sessions'
import { useOnline } from '../components/ui'
import Calendar from '../components/Calendar'
import SummaryCards from '../components/SummaryCards'
import WeekTable from '../components/WeekTable'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const online = useOnline()

  const [sessions, setSessions] = useState([])
  const [monthRef, setMonthRef] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [softError, setSoftError] = useState(false)
  const [toast, setToast] = useState(location.state?.toast || null)

  const load = useCallback(async () => {
    const [server, pending] = await Promise.allSettled([
      fetchSessions(),
      getPendingSessions(),
    ])
    const serverRows = server.status === 'fulfilled' ? server.value : []
    const pendingRows = pending.status === 'fulfilled' ? pending.value : []
    setSoftError(server.status === 'rejected')
    setSessions([...pendingRows, ...serverRows])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('sessions:changed', load)
    return () => window.removeEventListener('sessions:changed', load)
  }, [load])

  // Show + auto-dismiss the toast, then clear navigation state.
  useEffect(() => {
    if (!toast) return
    navigate('.', { replace: true, state: {} })
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  return (
    <div className="page dashboard">
      <header className="dash-head">
        <div>
          <h1>Treningsdagbok</h1>
          {!online && <span className="offline-tag">offline</span>}
        </div>
        <div className="head-actions">
          <button
            className="icon-btn"
            onClick={() => navigate('/stats')}
            title="Stats"
            aria-label="Stats"
          >
            📊
          </button>
          <button
            className="icon-btn"
            onClick={() => navigate('/settings')}
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
            ⎋
          </button>
        </div>
      </header>

      <button className="btn btn-primary btn-register" onClick={() => navigate('/new')}>
        + Register session
      </button>

      <button className="btn btn-ghost btn-block btn-import" onClick={() => navigate('/import')}>
        ⬇ Import rides from intervals.icu
      </button>

      {loading ? (
        <div className="splash inline">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {softError && (
            <p className="muted small offline-note">
              Showing offline data — couldn’t reach the server.
            </p>
          )}

          <SummaryCards sessions={sessions} />

          <Calendar
            monthRef={monthRef}
            sessions={sessions}
            onPrev={() => setMonthRef((m) => addMonths(m, -1))}
            onNext={() => setMonthRef((m) => addMonths(m, 1))}
            onSelectDay={(date) => navigate('/new', { state: { date } })}
          />

          <section className="section">
            <h2 className="section-title">Last week</h2>
            <WeekTable sessions={sessions} onSelect={(s) => navigate(`/session/${s.id}`)} />
          </section>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
