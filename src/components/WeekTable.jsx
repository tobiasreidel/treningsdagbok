import { SPORTS, subtypeWord } from '../lib/constants'
import { asDate, formatDayShort, formatDuration, lastNDaysRange } from '../lib/format'
import { getHideRidesUnderKm } from '../lib/prefs'
import { embeddedStrengthMinutes, embeddedFingerMinutes } from '../lib/stats'
import { PendingBadge } from './ui'

// The most recent 7 days, newest first. Short cycling commutes can be hidden
// via the dashboard preference (Settings → Dashboard). `periodSet` (ISO dates,
// or null when tracking is off) marks sessions on period days with a drop.
export default function WeekTable({ sessions, onSelect, periodSet }) {
  const { start } = lastNDaysRange(7)
  const minKm = getHideRidesUnderKm()
  const recent = sessions
    .filter((s) => asDate(s.date) >= start)
    .filter(
      (s) =>
        !(s.sport === 'cycling' && minKm > 0 && (Number(s.extra?.distance_km) || 0) < minKm),
    )
    .sort((a, b) => b.date.localeCompare(a.date))

  if (recent.length === 0) {
    return (
      <div className="card empty-state">
        <p>No sessions in the last 7 days.</p>
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
            const strengthMin = embeddedStrengthMinutes(s)
            const fingerMin = embeddedFingerMinutes(s)
            const warmupMin = Number(s.extra?.warmup_minutes) || 0
            const rehabMin = Number(s.extra?.rehab_minutes) || 0
            return (
              <tr key={s.id} className="clickable" onClick={() => onSelect?.(s)}>
                <td>
                  {formatDayShort(s.date)}
                  {periodSet?.has(s.date) && <span className="period-drop"> 🩸</span>}
                </td>
                <td>
                  <span className="sport-cell">
                    {sport?.emoji}{' '}
                    <span className="sport-sub">{labelFor(s)}</span>
                    {strengthMin > 0 && (
                      <span className="sport-extra">
                        {SPORTS.strength.emoji} strength training · {formatDuration(strengthMin)}
                      </span>
                    )}
                    {fingerMin > 0 && (
                      <span className="sport-extra">
                        {SPORTS.finger.emoji} finger training · {formatDuration(fingerMin)}
                      </span>
                    )}
                    {warmupMin > 0 && (
                      <span className="sport-extra">🔥 warm-up · {formatDuration(warmupMin)}</span>
                    )}
                    {rehabMin > 0 && (
                      <span className="sport-extra">🩹 rehab · {formatDuration(rehabMin)}</span>
                    )}
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
  const parts = [subtypeWord(s.subtype) || SPORTS[s.sport]?.label]
  if (s.sport === 'climbing' && s.location) parts.push(s.location === 'indoor' ? 'in' : 'out')
  return parts.filter(Boolean).join(' · ')
}
