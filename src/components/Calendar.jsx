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

// Color-coded month calendar:
//   rest = empty · climbing = blue · cycling = amber · both = green
export default function Calendar({ monthRef, sessions, onPrev, onNext, onSelectDay }) {
  // Index which sports happened on each day.
  const byDay = {}
  for (const s of sessions) {
    const key = s.date
    if (!byDay[key]) byDay[key] = { cycling: false, climbing: false }
    if (s.sport === 'cycling') byDay[key].cycling = true
    if (s.sport === 'climbing') byDay[key].climbing = true
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
          const marks = byDay[key]
          const sport = marks
            ? marks.cycling && marks.climbing
              ? 'both'
              : marks.climbing
                ? 'climbing'
                : 'cycling'
            : null
          const dim = !isSameMonth(day, monthRef)
          return (
            <button
              key={key}
              className={`cal-day ${sport ? `is-${sport}` : ''} ${dim ? 'is-dim' : ''} ${
                isToday(day) ? 'is-today' : ''
              }`}
              onClick={() => onSelectDay?.(key)}
              type="button"
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        <span><i className="dot-climbing" /> Climbing</span>
        <span><i className="dot-cycling" /> Cycling</span>
        <span><i className="dot-both" /> Both</span>
      </div>
    </div>
  )
}
