import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addMonths } from 'date-fns'
import { fetchSessions } from '../lib/sessions'
import { getAthleteProfile } from '../lib/coaches'
import { ALL_SPORTS, defaultWidgetsForSports } from '../lib/prefs'
import { StatsIcon } from '../components/icons'
import SummaryCards from '../components/SummaryCards'
import Calendar from '../components/Calendar'
import DaySheet from '../components/DaySheet'

// A coach's read-only window into one athlete's account: the same month
// overview and summary the athlete sees, plus a link into full statistics.
// Tapping a day lists that day's sessions; tapping one opens its detail.
export default function AthleteView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState(null)
  const [name, setName] = useState('')
  const [monthRef, setMonthRef] = useState(new Date())
  const [dayView, setDayView] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getAthleteProfile(id)
      .then((p) => setName(p.display_name || p.email || 'Athlete'))
      .catch(() => {})
    fetchSessions(id)
      .then(setSessions)
      .catch(() => {
        setSessions([])
        setError(true)
      })
  }, [id])

  return (
    <div className="page dashboard">
      <header className="dash-head">
        <button className="icon-btn" onClick={() => navigate('/profile')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>{name || 'Athlete'}</h1>
          <span className="ro-tag">read-only</span>
        </div>
        <button
          className="icon-btn"
          onClick={() => navigate(`/athlete/${id}/stats`)}
          title="Statistics"
          aria-label="Statistics"
        >
          <StatsIcon />
        </button>
      </header>

      {sessions === null ? (
        <div className="splash inline">
          <div className="spinner" />
        </div>
      ) : error ? (
        <div className="card empty-state">
          <p>Couldn’t load this athlete.</p>
          <p className="muted small">
            They may have removed you as a coach, or the request isn’t accepted yet.
          </p>
        </div>
      ) : (
        <>
          {/* Summary widgets follow the sports this athlete actually logs. */}
          <SummaryCards
            sessions={sessions}
            widgets={defaultWidgetsForSports(
              ALL_SPORTS.filter((k) => sessions.some((s) => s.sport === k)),
            )}
          />

          <Calendar
            monthRef={monthRef}
            sessions={sessions}
            enabledSports={ALL_SPORTS}
            onPrev={() => setMonthRef((m) => addMonths(m, -1))}
            onNext={() => setMonthRef((m) => addMonths(m, 1))}
            onSelectDay={(date) => setDayView(date)}
          />

          <button
            className="btn btn-secondary btn-block"
            onClick={() => navigate(`/athlete/${id}/stats`)}
          >
            View full statistics
          </button>
        </>
      )}

      {dayView && (
        <DaySheet
          date={dayView}
          sessions={sessions || []}
          readOnly
          onClose={() => setDayView(null)}
          onSelect={(s) => navigate(`/session/${s.id}`)}
        />
      )}
    </div>
  )
}
