import { subDays } from 'date-fns'
import { SPORTS } from '../lib/constants'
import { asDate, formatDayShort, formatDuration } from '../lib/format'
import { PendingBadge } from './ui'

// "Last week" = the most recent 7 days, newest first.
export default function WeekTable({ sessions, onSelect }) {
  const cutoff = subDays(new Date(), 7)
  const recent = sessions
    .filter((s) => asDate(s.date) >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))

  if (recent.length === 0) {
    return (
      <div className="card empty-state">
        <p>No sessions in the last week.</p>
        <p className="muted small">Tap “Register session” to log one.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <table className="week-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Sport</th>
            <th className="num">Feel</th>
            <th className="num">RPE</th>
            <th className="num">Time</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((s) => {
            const sport = SPORTS[s.sport]
            return (
              <tr
                key={s.id}
                className={s.pending ? '' : 'clickable'}
                onClick={() => !s.pending && onSelect?.(s)}
              >
                <td>{formatDayShort(s.date)}</td>
                <td>
                  <span className="sport-cell">
                    {sport?.emoji}{' '}
                    <span className="sport-sub">{labelFor(s)}</span>
                    {s.pending && <PendingBadge />}
                  </span>
                </td>
                <td className="num">{s.feeling ?? '–'}</td>
                <td className="num">{s.rpe ?? '–'}</td>
                <td className="num">{formatDuration(s.duration)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function labelFor(s) {
  const parts = [s.subtype]
  if (s.sport === 'climbing' && s.location) parts.push(s.location === 'indoor' ? 'in' : 'out')
  return parts.filter(Boolean).join(' · ')
}
