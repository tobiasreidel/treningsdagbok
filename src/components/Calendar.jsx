import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from 'date-fns'

const WEEK_OPTS = { weekStartsOn: 1 } // Monday
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SPORTS = ['climbing', 'cycling', 'strength'] // legend order
const MAX_DOTS = 6 // guard against a freakishly busy day overflowing the cell

// Month calendar with one colored dot per session:
//   climbing = blue · cycling = amber · strength = violet
//   multiple sessions on a day = multiple dots (one per session)
export default function Calendar({ monthRef, sessions, onPrev, onNext, onSelectDay }) {
  // Count sessions per sport on each day.
  const byDay = {}
  for (const s of sessions) {
    const key = s.date
    if (!byDay[key]) byDay[key] = { cycling: 0, climbing: 0, strength: 0 }
    if (byDay[key][s.sport] != null) byDay[key][s.sport] += 1
  }

  const gridStart = startOfWeek(startOfMonth(monthRef), WEEK_OPTS)
  const gridEnd = endOfWeek(endOfMonth(monthRef), WEEK_OPTS)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="calendar card">
      <div className="cal-head">
        <button className="icon-btn" onClick={onPrev} aria-label="Previous month">
          ‹
        </button>
        <strong>{format(monthRef, 'MMMM yyyy')}</strong>
        <button className="icon-btn" onClick={onNext} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="cal-grid cal-dow">
        {DOW.map((d) => (
          <span key={d} className="cal-dow-cell">
            {d}
          </span>
        ))}
      </div>

      <div className="cal-grid">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const counts = byDay[key]
          // One dot per session, grouped by sport (legend order).
          const dots = counts
            ? SPORTS.flatMap((sport) => Array(counts[sport]).fill(sport)).slice(0, MAX_DOTS)
            : []
          const dim = !isSameMonth(day, monthRef)
          return (
            <button
              key={key}
              className={`cal-day ${dim ? 'is-dim' : ''} ${isToday(day) ? 'is-today' : ''}`}
              onClick={() => onSelectDay?.(key)}
              type="button"
            >
              <span className="cal-daynum">{format(day, 'd')}</span>
              {dots.length > 0 && (
                <span className="cal-dots">
                  {dots.map((sport, i) => (
                    <i key={i} className={`dot-${sport}`} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        <span><i className="dot-climbing" /> Climbing</span>
        <span><i className="dot-cycling" /> Cycling</span>
        <span><i className="dot-strength" /> Strength</span>
      </div>
    </div>
  )
}
