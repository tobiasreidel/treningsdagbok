import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { addMonths } from 'date-fns'
import { fetchSessions, getPendingSessions } from '../lib/sessions'
import {
  fetchPeriodDays,
  setPeriodDay,
  analyzeCycle,
  predictedPeriodDays,
  fetchInjuries,
  injuryDays,
} from '../lib/health'
import { getLogPeriod, getAvatarEmoji } from '../lib/prefs'
import { getMyProfile, countIncomingRequests } from '../lib/friends'
import { countPendingCoachRequests } from '../lib/coaches'
import { getAvatarUrl } from '../lib/profile'
import { useOnline } from '../components/ui'
import Calendar from '../components/Calendar'
import SummaryCards from '../components/SummaryCards'
import WeekTable from '../components/WeekTable'
import DaySheet from '../components/DaySheet'
import CycleCard from '../components/CycleCard'
import Avatar from '../components/Avatar'
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
  // Period tracking (Settings → Health). Days are ISO strings from the server.
  const periodEnabled = getLogPeriod()
  const [periodDays, setPeriodDays] = useState([])
  // Injury log (always on - see Profile). Logged injuries badge their days.
  const [injuries, setInjuries] = useState([])
  // Top-left profile button: photo → emoji → initials. A dot on it flags
  // friend and coaching requests waiting on the profile page.
  const [me, setMe] = useState({ url: null, name: '', emoji: getAvatarEmoji() })
  const [reqCount, setReqCount] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      getAvatarUrl().catch(() => null),
      getMyProfile().catch(() => ({})),
      countIncomingRequests().catch(() => 0),
      countPendingCoachRequests().catch(() => 0),
    ]).then(([url, profile, reqs, coachReqs]) => {
      if (!alive) return
      setMe((m) => ({
        ...m,
        url,
        name: profile?.display_name || profile?.email || '',
      }))
      setReqCount(reqs + coachReqs)
    })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async () => {
    const [server, pending, period, injured] = await Promise.allSettled([
      fetchSessions(),
      getPendingSessions(),
      periodEnabled ? fetchPeriodDays() : Promise.resolve([]),
      fetchInjuries(),
    ])
    const serverRows = server.status === 'fulfilled' ? server.value : []
    const pendingRows = pending.status === 'fulfilled' ? pending.value : []
    setSoftError(server.status === 'rejected')
    setSessions([...pendingRows, ...serverRows])
    setPeriodDays(period.status === 'fulfilled' ? period.value : [])
    setInjuries(injured.status === 'fulfilled' ? injured.value : [])
    setLoading(false)
  }, [periodEnabled])

  const periodSet = useMemo(() => new Set(periodDays), [periodDays])
  const cycle = useMemo(
    () => (periodEnabled ? analyzeCycle(periodDays) : null),
    [periodEnabled, periodDays],
  )
  const predictedSet = useMemo(
    () => (cycle ? predictedPeriodDays(cycle) : new Set()),
    [cycle],
  )
  const injurySet = useMemo(() => injuryDays(injuries), [injuries])

  // Optimistic toggle from the day sheet; reverted (with a hint) on failure -
  // e.g. when supabase/health.sql hasn't been run yet.
  const togglePeriod = async (date) => {
    const on = !periodSet.has(date)
    setPeriodDays((prev) => (on ? [...prev, date].sort() : prev.filter((d) => d !== date)))
    try {
      await setPeriodDay(date, on)
    } catch {
      setPeriodDays((prev) => (on ? prev.filter((d) => d !== date) : [...prev, date].sort()))
      setToast("Couldn't save the period day. Has supabase/health.sql been run?")
    }
  }

  useEffect(() => {
    load()
    window.addEventListener('sessions:changed', load)
    return () => window.removeEventListener('sessions:changed', load)
  }, [load])

  // Tell the user when an offline session couldn't sync and was discarded -
  // the one case where a logged session is lost (see flushOutbox).
  useEffect(() => {
    const onDropped = (e) => {
      const n = e.detail?.count || 1
      setToast(
        n === 1
          ? "An offline session couldn't sync and was removed. Please log it again."
          : `${n} offline sessions couldn't sync and were removed. Please log them again.`,
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
        <button
          className="avatar-btn"
          onClick={() => navigate('/profile')}
          title={reqCount > 0 ? 'Profile — you have friend requests' : 'Profile'}
          aria-label={
            reqCount > 0
              ? `Profile — ${reqCount} friend request${reqCount === 1 ? '' : 's'}`
              : 'Profile'
          }
        >
          <Avatar url={me.url} emoji={me.emoji} name={me.name} size={40} />
          {reqCount > 0 && <span className="avatar-dot" aria-hidden="true" />}
        </button>
        <div className="dash-title">
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

          {periodEnabled && <CycleCard analysis={cycle} />}

          <Calendar
            monthRef={monthRef}
            sessions={sessions}
            periodDays={periodEnabled ? periodSet : null}
            predictedDays={periodEnabled ? predictedSet : null}
            injuryDays={injurySet}
            onPrev={() => setMonthRef((m) => addMonths(m, -1))}
            onNext={() => setMonthRef((m) => addMonths(m, 1))}
            onSelectDay={(date) => setDayView(date)}
          />

          <section className="section">
            <h2 className="section-title">Last 7 days</h2>
            <WeekTable
              sessions={sessions}
              periodSet={periodEnabled ? periodSet : null}
              onSelect={(s) => navigate(`/session/${s.id}`)}
            />
          </section>
        </>
      )}

      {dayView && (
        <DaySheet
          date={dayView}
          sessions={sessions}
          periodEnabled={periodEnabled}
          isPeriodDay={periodSet.has(dayView)}
          cycle={cycle}
          onTogglePeriod={togglePeriod}
          onClose={() => setDayView(null)}
          onSelect={(s) => navigate(`/session/${s.id}`)}
          onAdd={(date) => navigate('/new', { state: { date } })}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
