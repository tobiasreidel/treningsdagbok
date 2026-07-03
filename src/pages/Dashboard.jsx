import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { addMonths } from 'date-fns'
import { fetchSessions, getPendingSessions } from '../lib/sessions'
import { useOnline } from '../components/ui'
import Calendar from '../components/Calendar'
import SummaryCards from '../components/SummaryCards'
import WeekTable from '../components/WeekTable'
import DaySheet from '../components/DaySheet'
import { SettingsIcon } from '../components/icons'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const online = useOnline()

  const [sessions, setSessions] = useState([])
  const [monthRef, setMonthRef] = useState(new Date())
  const [dayView, setDayView] = useState(null)
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

  // Tell the user when an offline session couldn't sync and was discarded —
  // the one case where a logged session is lost (see flushOutbox).
  useEffect(() => {
    const onDropped = (e) => {
      const n = e.detail?.count || 1
      setToast(
        n === 1
          ? "An offline session couldn't sync and was removed — please log it again."
          : `${n} offline sessions couldn't sync and were removed — please log them again.`,
      )
    }
    window.addEventListener('outbox:dropped', onDropped)
    return () => window.removeEventListener('outbox:dropped', onDropped)
  }, [])

  // Activities pulled in by the background intervals.icu import would
  // otherwise appear with no explanation.
  useEffect(() => {
    const onImported = (e) => {
      const n = e.detail?.count || 1
      setToast(`Imported ${n} activit${n === 1 ? 'y' : 'ies'} from intervals.icu`)
    }
    window.addEventListener('activities:imported', onImported)
    return () => window.removeEventListener('activities:imported', onImported)
  }, [])

  // Show + auto-dismiss the toast, then clear navigation state. Longer
  // messages stay up longer so they can actually be read.
  useEffect(() => {
    if (!toast) return
    navigate('.', { replace: true, state: {} })
    const t = setTimeout(() => setToast(null), Math.min(7000, Math.max(2600, toast.length * 55)))
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
          {/* Friends/Logbook/Stats live in the bottom tab bar now. */}
          <button
            className="icon-btn"
            onClick={() => navigate('/settings')}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <button className="btn btn-primary btn-register" onClick={() => navigate('/new')}>
        + Register session
      </button>

      {loading ? (
        <div className="splash inline">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {softError && (
            <p className="muted small offline-note">
              Showing offline data. Couldn’t reach the server.
            </p>
          )}

          <div className="summary-section">
            <div className="summary-bar">
              <button className="link-btn" onClick={() => navigate('/widgets')}>
                ✎ Customize
              </button>
            </div>
            <SummaryCards sessions={sessions} />
          </div>

          <Calendar
            monthRef={monthRef}
            sessions={sessions}
            onPrev={() => setMonthRef((m) => addMonths(m, -1))}
            onNext={() => setMonthRef((m) => addMonths(m, 1))}
            onSelectDay={(date) => setDayView(date)}
          />

          <section className="section">
            <h2 className="section-title">Last 7 days</h2>
            <WeekTable sessions={sessions} onSelect={(s) => navigate(`/session/${s.id}`)} />
          </section>
        </>
      )}

      {dayView && (
        <DaySheet
          date={dayView}
          sessions={sessions}
          onClose={() => setDayView(null)}
          onSelect={(s) => navigate(`/session/${s.id}`)}
          onAdd={(date) => navigate('/new', { state: { date } })}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
