import { lastNDaysRange, monthRange, inRange, toHours } from '../lib/format'

function aggregate(sessions, range) {
  const acc = {
    count: 0,
    minutes: 0,
    cyclingMin: 0,
    climbingMin: 0,
    strengthMin: 0,
    distance: 0,
    elevation: 0,
  }
  for (const s of sessions) {
    if (!inRange(s.date, range)) continue
    acc.count += 1
    const mins = Number(s.duration) || 0
    acc.minutes += mins
    if (s.sport === 'cycling') {
      acc.cyclingMin += mins
      acc.distance += Number(s.extra?.distance_km) || 0
      acc.elevation += Number(s.extra?.elevation_m) || 0
    } else if (s.sport === 'climbing') {
      acc.climbingMin += mins
    } else if (s.sport === 'strength') {
      acc.strengthMin += mins
    }
  }
  return acc
}

export default function SummaryCards({ sessions }) {
  const week = aggregate(sessions, lastNDaysRange(7))
  const month = aggregate(sessions, monthRange())

  return (
    <div className="summary-grid">
      <PeriodCard title="Last 7 days" data={week} />
      <PeriodCard title="This month" data={month} />
      <CyclingCard data={month} />
    </div>
  )
}

function PeriodCard({ title, data }) {
  return (
    <div className="card stat-card">
      <span className="stat-title">{title}</span>
      <span className="stat-big">{toHours(data.minutes)}h</span>
      <div className="stat-split">
        <span><i className="dot-cycling" /> {toHours(data.cyclingMin)}h</span>
        <span><i className="dot-climbing" /> {toHours(data.climbingMin)}h</span>
        {data.strengthMin > 0 && (
          <span><i className="dot-strength" /> {toHours(data.strengthMin)}h</span>
        )}
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
