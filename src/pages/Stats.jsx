import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSessions } from '../lib/sessions'
import { Bars, Line, HBars } from '../components/charts'
import { exerciseLabel } from '../lib/constants'
import * as S from '../lib/stats'

const CYCLING = 'var(--cycling)'
const CLIMBING = 'var(--climbing)'
const STRENGTH = 'var(--strength)'

export default function Stats() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState(null)
  const [range, setRange] = useState('3m')
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [])

  const view = useMemo(() => {
    if (!sessions) return null
    const start = S.windowStart(range, sessions)
    const grain = S.rangeConfig(range).grain
    const windowed = S.inWindow(sessions, start)
    return {
      start,
      grain,
      windowed,
      buckets: S.buckets(windowed, start, grain),
      cycling: S.bySport(windowed, 'cycling'),
      climbing: S.bySport(windowed, 'climbing'),
      strength: S.bySport(windowed, 'strength'),
    }
  }, [sessions, range])

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Stats</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <PillRow
          options={S.RANGES.map((r) => ({ key: r.key, label: r.label }))}
          value={range}
          onChange={setRange}
        />
        <PillRow
          options={[
            { key: 'overview', label: 'Overview' },
            { key: 'cycling', label: '🚴 Cycling' },
            { key: 'climbing', label: '🧗 Climbing' },
            { key: 'strength', label: '💪 Strength' },
          ]}
          value={tab}
          onChange={setTab}
          wide
        />

        {!view ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : view.windowed.length === 0 ? (
          <div className="card empty-state">
            <p>No activity in this period.</p>
          </div>
        ) : tab === 'overview' ? (
          <Overview view={view} />
        ) : tab === 'cycling' ? (
          <Cycling view={view} />
        ) : tab === 'climbing' ? (
          <Climbing view={view} />
        ) : (
          <Strength view={view} />
        )}
      </main>
    </div>
  )
}

// ---- tabs/range pill control ----
function PillRow({ options, value, onChange, wide }) {
  return (
    <div className={`pill-row ${wide ? 'pill-row-wide' : ''}`}>
      {options.map((o) => (
        <button
          key={o.key}
          className={`pill ${value === o.key ? 'is-active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Card({ title, value, children }) {
  return (
    <div className="card chart-card">
      <div className="chart-card-head">
        <span className="chart-card-title">{title}</span>
        {value != null && <span className="chart-card-value">{value}</span>}
      </div>
      {children}
    </div>
  )
}

function Tiles({ items }) {
  return (
    <div className="tile-grid">
      {items.map((t) => (
        <div className="tile" key={t.label}>
          <span className="tile-label">{t.label}</span>
          <span className="tile-value">
            {t.value}
            {t.sub && <small> {t.sub}</small>}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---- Overview ----
function Overview({ view }) {
  const { windowed, buckets, cycling, climbing, start } = view
  const rest = S.restBalance(windowed, start)
  const hoursBars = buckets.map((b) => ({
    label: b.label,
    segments: [
      { value: S.sumHours(S.bySport(b.sessions, 'cycling')), color: CYCLING },
      { value: S.sumHours(S.bySport(b.sessions, 'climbing')), color: CLIMBING },
      { value: S.sumHours(S.bySport(b.sessions, 'strength')), color: STRENGTH },
    ],
  }))
  const feelingLine = buckets.map((b) => ({ label: b.label, value: S.round1(S.avgFeeling(b.sessions)) }))
  const strengthH = S.round1(S.sumHours(S.bySport(windowed, 'strength')))

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: windowed.length },
          { label: 'Hours', value: S.round1(S.sumHours(windowed)), sub: 'h' },
          { label: 'Current streak', value: S.currentStreak(windowed), sub: 'days' },
          { label: 'Active days', value: rest.active, sub: `/ ${rest.total}` },
        ]}
      />
      <Card
        title="Training hours"
        value={`🚴 ${S.round1(S.sumHours(cycling))}h · 🧗 ${S.round1(S.sumHours(climbing))}h${
          strengthH ? ` · 💪 ${strengthH}h` : ''
        }`}
      >
        <Bars data={hoursBars} />
      </Card>
      <Card title="Feeling trend" value={`avg ${S.round1(S.avgFeeling(windowed))}/5`}>
        <Line data={feelingLine} color="var(--both)" />
      </Card>
    </>
  )
}

// ---- Cycling ----
function Cycling({ view }) {
  const { buckets, cycling } = view
  if (cycling.length === 0) return <div className="card empty-state"><p>No rides in this period.</p></div>
  const dist = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumDistance(b.sessions)) }))
  const elev = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumElevation(b.sessions)) }))
  const load = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumLoad(b.sessions)) }))
  const speed = buckets.map((b) => {
    const rides = S.bySport(b.sessions, 'cycling').filter((s) => Number(s.extra?.avg_speed))
    const avg = rides.length
      ? rides.reduce((a, s) => a + Number(s.extra.avg_speed), 0) / rides.length
      : 0
    return { label: b.label, value: S.round1(avg) }
  })

  return (
    <>
      <Tiles
        items={[
          { label: 'Distance', value: Math.round(S.sumDistance(cycling)), sub: 'km' },
          { label: 'Elevation', value: Math.round(S.sumElevation(cycling)), sub: 'm' },
          { label: 'Longest ride', value: Math.round(S.longestRide(cycling)), sub: 'km' },
          { label: 'Load', value: Math.round(S.sumLoad(cycling)), sub: 'TSS' },
        ]}
      />
      <Card title="Distance" value={`${Math.round(S.sumDistance(cycling))} km`}>
        <Bars data={dist} color={CYCLING} />
      </Card>
      <Card title="Elevation" value={`${Math.round(S.sumElevation(cycling))} m`}>
        <Bars data={elev} color={CYCLING} />
      </Card>
      <Card title="Training load" value={`${Math.round(S.sumLoad(cycling))} TSS`}>
        <Bars data={load} color="var(--primary)" />
      </Card>
      <Card title="Avg speed trend" value="km/h">
        <Line data={speed} color={CYCLING} />
      </Card>
    </>
  )
}

// ---- Climbing ----
function Climbing({ view }) {
  const { buckets, climbing } = view
  if (climbing.length === 0) return <div className="card empty-state"><p>No climbing in this period.</p></div>
  const hours = buckets.map((b) => ({ label: b.label, value: S.round1(S.sumHours(S.bySport(b.sessions, 'climbing'))) }))
  const feeling = buckets.map((b) => ({ label: b.label, value: S.round1(S.avgFeeling(S.bySport(b.sessions, 'climbing'))) }))
  const disc = S.disciplineSplit(climbing)
  const loc = S.locationSplit(climbing)
  const pyramid = S.gradePyramid(climbing)
  const sends = S.sendStats(climbing)

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: climbing.length },
          { label: 'Hours', value: S.round1(S.sumHours(climbing)), sub: 'h' },
          { label: 'Outdoor', value: loc.outdoor },
          { label: 'Indoor', value: loc.indoor },
        ]}
      />
      <Card title="Climbing hours">
        <Bars data={hours} color={CLIMBING} />
      </Card>
      <Card title="By discipline">
        <HBars
          data={[
            { label: 'Bouldering', value: disc.bouldering },
            { label: 'Sport', value: disc.sport },
            { label: 'Trad', value: disc.trad },
          ]}
          color={CLIMBING}
        />
      </Card>
      <Card title="Indoor vs outdoor">
        <HBars
          data={[
            { label: 'Outdoor', value: loc.outdoor, color: 'var(--both)' },
            { label: 'Indoor', value: loc.indoor, color: CLIMBING },
          ]}
        />
      </Card>
      <Card title="Feeling trend" value={`avg ${S.round1(S.avgFeeling(climbing))}/5`}>
        <Line data={feeling} color={CLIMBING} />
      </Card>
      <Card title="Grade pyramid" value="outdoor routes">
        {pyramid.length ? <HBars data={pyramid} color={CLIMBING} /> : <p className="muted small">Log outdoor routes to build your pyramid.</p>}
      </Card>
      <Card title="Send rate" value="outdoor routes">
        <HBars
          data={[
            { label: 'Onsight', value: sends.onsight, color: 'var(--both)' },
            { label: 'Flash', value: sends.flash, color: 'var(--both)' },
            { label: 'Redpoint', value: sends.redpoint, color: CYCLING },
            { label: 'Attempt', value: sends.attempt, color: 'var(--danger)' },
          ]}
        />
      </Card>
    </>
  )
}

// ---- Strength ----
function Strength({ view }) {
  const { windowed, buckets } = view
  const [exKey, setExKey] = useState(null)
  const [metric, setMetric] = useState('weight')

  const exercises = S.exercisesLogged(windowed)
  const hang = S.hangboardSeries(windowed)
  const campus = S.campusCount(windowed)
  const sessCount = S.strengthSessionCount(windowed)

  if (exercises.length === 0 && hang.length === 0 && campus === 0) {
    return (
      <div className="card empty-state">
        <p>No strength or finger training in this period.</p>
        <p className="muted small">Log a strength session (or add it to indoor climbing).</p>
      </div>
    )
  }

  const selected = exercises.includes(exKey) ? exKey : exercises[0] || null
  const series = selected ? S.exerciseSeries(windowed, selected, metric) : []
  const best = selected ? S.exerciseBest(windowed, selected) : null

  const freqBars = buckets.map((b) => ({ label: b.label, value: S.strengthSessionCount(b.sessions) }))
  const repsBars = buckets.map((b) => ({ label: b.label, value: S.totalReps(b.sessions) }))

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: sessCount },
          { label: 'Exercises', value: exercises.length },
          { label: 'Total reps', value: S.totalReps(windowed) },
          { label: 'Campus', value: campus },
        ]}
      />

      <Card title="Sessions per period">
        <Bars data={freqBars} color={STRENGTH} />
      </Card>

      {exercises.length > 0 && (
        <>
          <Card title="Total reps" value={`${S.totalReps(windowed)} reps`}>
            <Bars data={repsBars} color={STRENGTH} />
          </Card>

          <div className="card chart-card stack">
            <div className="chart-card-head">
              <span className="chart-card-title">Exercise progression</span>
              {best && (
                <span className="chart-card-value">
                  {best.maxWeight ? `${best.maxWeight} kg` : `${best.maxReps} reps`} best
                </span>
              )}
            </div>
            <label className="field">
              <select value={selected || ''} onChange={(e) => setExKey(e.target.value)}>
                {exercises.map((k) => (
                  <option key={k} value={k}>
                    {exerciseLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <PillRow
              options={[
                { key: 'weight', label: 'Weight' },
                { key: 'reps', label: 'Top reps' },
                { key: 'volume', label: 'Volume' },
              ]}
              value={metric}
              onChange={setMetric}
              wide
            />
            <Line data={series} color={STRENGTH} />
          </div>
        </>
      )}

      {(hang.length > 0 || campus > 0) && (
        <Card title="Hangboard — max two-hand weight" value="kg added">
          {hang.length ? (
            <Line data={hang} color={STRENGTH} />
          ) : (
            <p className="muted small">Log two-hand hangboard sets to track this.</p>
          )}
        </Card>
      )}
    </>
  )
}
