import { lastNDaysRange, monthRange, inRange, toHours } from '../lib/format'
import { getEnabledSports } from '../lib/prefs'

function aggregate(sessions, range) {
  const acc = { count: 0, minutes: 0, bySport: {}, distance: 0, elevation: 0 }
  for (const s of sessions) {
    if (!inRange(s.date, range)) continue
    acc.count += 1
    const mins = Number(s.duration) || 0
    acc.minutes += mins
    acc.bySport[s.sport] = (acc.bySport[s.sport] || 0) + mins
    if (s.sport === 'cycling') {
      acc.distance += Number(s.extra?.distance_km) || 0
      acc.elevation += Number(s.extra?.elevation_m) || 0
    }
  }
  return acc
}

export default function SummaryCards({ sessions, enabledSports }) {
  // Override (e.g. a coach viewing an athlete) shows all sports; otherwise use
  // this device's own sport preferences.
  const enabled = enabledSports || getEnabledSports()
  // Aggregates reflect only the sports you currently track. Past sessions of a
  // disabled sport still live in the calendar/history — just not these totals.
  const visible = sessions.filter((s) => enabled.includes(s.sport))
  const week = aggregate(visible, lastNDaysRange(7))
  const month = aggregate(visible, monthRange())

  return (
    <div className="summary-grid">
      <PeriodCard title="Last 7 days" data={week} enabled={enabled} />
      <PeriodCard title="This month" data={month} enabled={enabled} />
      {enabled.includes('cycling') && <CyclingCard data={month} />}
    </div>
  )
}

function PeriodCard({ title, data, enabled }) {
  // Show a per-sport hours line for each enabled sport that has time logged
  // (always show the first couple so the card never looks empty).
  const lines = enabled.filter((sport) => (data.bySport[sport] || 0) > 0)
  return (
    <div className="card stat-card">
      <span className="stat-title">{title}</span>
      <span className="stat-big">{toHours(data.minutes)}h</span>
      <div className="stat-split">
        {lines.map((sport) => (
          <span key={sport}>
            <i className={`dot-${sport}`} /> {toHours(data.bySport[sport] || 0)}h
          </span>
        ))}
      </div>
      <span className="stat-sub">{data.count} session{data.count === 1 ? '' : 's'}</span>
    </div>
  )
}

function CyclingCard({ data }) {
  return (
    <div className="card stat-card">
      <span className="stat-title">Cycling · month</span>
      <span className="stat-big">{Math.round(data.distance)}<small> km</small></span>
      <div className="stat-split">
        <span>⛰ {Math.round(data.elevation)} m</span>
      </div>
      <span className="stat-sub">elevation gain</span>
    </div>
  )
}
