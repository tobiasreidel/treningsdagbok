import { lastNDaysRange, monthRange, inRange, toHours } from '../lib/format'
import { sportMinutes } from '../lib/stats'
import { ALL_SPORTS, getEnabledSports } from '../lib/prefs'

function aggregate(sessions, range) {
  const acc = { count: 0, minutes: 0, bySport: {}, distance: 0, elevation: 0 }
  for (const s of sessions) {
    if (!inRange(s.date, range)) continue
    acc.count += 1
    acc.minutes += Number(s.duration) || 0
    // Indoor climbs with a strength block split across two sports.
    for (const p of sportMinutes(s)) {
      acc.bySport[p.sport] = (acc.bySport[p.sport] || 0) + p.minutes
    }
    if (s.sport === 'cycling') {
      acc.distance += Number(s.extra?.distance_km) || 0
      acc.elevation += Number(s.extra?.elevation_m) || 0
    }
  }
  return acc
}

export default function SummaryCards({ sessions, enabledSports }) {
  const enabled = enabledSports || getEnabledSports()
  // Totals reflect *everything you actually trained* in the window. A sport you
  // have since disabled still counts toward the total — and still shows a dot —
  // if you logged it this week/month. The enable toggle only steers the
  // register flow and the Stats tabs, not these dashboard totals.
  const week = aggregate(sessions, lastNDaysRange(7))
  const month = aggregate(sessions, monthRange())

  return (
    <div className="summary-grid">
      <PeriodCard title="Last 7 days" data={week} />
      <PeriodCard title="This month" data={month} />
      {(enabled.includes('cycling') || month.distance > 0) && <CyclingCard data={month} />}
    </div>
  )
}

function PeriodCard({ title, data }) {
  // One line per sport that has any time logged in the window (canonical order),
  // whether or not it is currently an enabled sport.
  const lines = ALL_SPORTS.filter((sport) => (data.bySport[sport] || 0) > 0)
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
