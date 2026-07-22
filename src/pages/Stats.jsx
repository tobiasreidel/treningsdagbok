import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { asDate } from '../lib/format'
import { fetchSessions } from '../lib/sessions'
import { fetchIcuFitnessData } from '../lib/fitness'
import { getAthleteProfile } from '../lib/coaches'
import { PillRow } from '../components/ui'
import { Bars, Line, HBars, FitnessChart } from '../components/charts'
import { exerciseLabel } from '../lib/constants'
import { getEnabledSports, ALL_SPORTS } from '../lib/prefs'
import * as S from '../lib/stats'

const CYCLING = 'var(--cycling)'
const RUNNING = 'var(--running)'
const SWIMMING = 'var(--swimming)'
const CLIMBING = 'var(--climbing)'
const STRENGTH = 'var(--strength)'
const FINGER = 'var(--finger)'

const SPORT_TABS = [
  { key: 'cycling', label: '🚴 Cycling' },
  { key: 'running', label: '🏃 Running' },
  { key: 'swimming', label: '🏊 Swimming' },
  { key: 'climbing', label: '🧗 Climbing' },
  { key: 'strength', label: '💪 Strength' },
  { key: 'finger', label: '🤏 Finger' },
]

export default function Stats() {
  const navigate = useNavigate()
  // When viewing as a coach, the route carries the athlete's id.
  const { id: athleteId } = useParams()
  const [sessions, setSessions] = useState(null)
  const [range, setRange] = useState('3m')
  const [tab, setTab] = useState('overview')
  const [athleteName, setAthleteName] = useState('')
  // intervals.icu wellness + per-activity loads, so the fitness numbers match
  // intervals.icu exactly. Null = not connected / not loaded (local fallback).
  const [icu, setIcu] = useState(null)

  // A coach sees all of the athlete's sports; your own stats follow your prefs.
  const enabled = athleteId ? ALL_SPORTS : getEnabledSports()
  const enabledKey = enabled.join(',')
  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...SPORT_TABS.filter((t) => enabled.includes(t.key)),
  ]
  // If the active tab's sport was just disabled, fall back to Overview.
  useEffect(() => {
    if (tab !== 'overview' && !enabled.includes(tab)) setTab('overview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, enabledKey])

  useEffect(() => {
    fetchSessions(athleteId)
      .then(setSessions)
      .catch(() => setSessions([]))
    if (athleteId) {
      getAthleteProfile(athleteId)
        .then((p) => setAthleteName(p.display_name || p.email || 'Athlete'))
        .catch(() => {})
    } else {
      // Own stats only - a coach viewing an athlete must not mix in their own
      // intervals.icu account.
      fetchIcuFitnessData()
        .then(setIcu)
        .catch(() => setIcu(null))
    }
  }, [athleteId])

  const view = useMemo(() => {
    if (!sessions) return null
    // Stats only covers the sports you currently track.
    const base = sessions.filter((s) => enabled.includes(s.sport))
    const start = S.windowStart(range, base)
    const grain = S.rangeConfig(range).grain
    const windowed = S.inWindow(base, start)
    return {
      start,
      grain,
      windowed,
      enabled,
      // Computed over the full (enabled) history, not the window, so the streak
      // isn't capped by the selected range - matches the dashboard widget.
      weekStreak: S.currentWeekStreak(base),
      // Full history: per-sport fitness/form needs a seed before the window.
      base,
      icu,
      buckets: S.buckets(windowed, start, grain),
      cycling: S.bySport(windowed, 'cycling'),
      running: S.bySport(windowed, 'running'),
      swimming: S.bySport(windowed, 'swimming'),
      climbing: S.bySport(windowed, 'climbing'),
      strength: S.bySport(windowed, 'strength'),
      finger: S.bySport(windowed, 'finger'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, range, enabledKey, icu])

  return (
    <div className="page">
      <header className="wizard-head">
        <button
          className="icon-btn"
          onClick={() => navigate(athleteId ? `/athlete/${athleteId}` : '/')}
          aria-label="Back"
        >
          ‹
        </button>
        <div className="wizard-title">
          <h1>{athleteId ? `${athleteName || 'Athlete'} · stats` : 'Stats'}</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <PillRow
          options={S.RANGES.map((r) => ({ key: r.key, label: r.label }))}
          value={range}
          onChange={setRange}
        />
        <PillRow options={tabs} value={tab} onChange={setTab} scroll />

        {!view ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : view.windowed.length === 0 ? (
          <div className="card empty-state">
            <p>No activity in this period.</p>
          </div>
        ) : !enabled.includes(tab) ? (
          <Overview view={view} />
        ) : tab === 'cycling' ? (
          <Cycling view={view} />
        ) : tab === 'running' ? (
          <Running view={view} />
        ) : tab === 'swimming' ? (
          <Swimming view={view} />
        ) : tab === 'climbing' ? (
          <Climbing view={view} />
        ) : tab === 'strength' ? (
          <Strength view={view} />
        ) : tab === 'finger' ? (
          <Finger view={view} />
        ) : (
          <Overview view={view} />
        )}
      </main>
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
const SPORT_META = {
  cycling: { color: CYCLING, emoji: '🚴' },
  running: { color: RUNNING, emoji: '🏃' },
  swimming: { color: SWIMMING, emoji: '🏊' },
  climbing: { color: CLIMBING, emoji: '🧗' },
  strength: { color: STRENGTH, emoji: '💪' },
  finger: { color: FINGER, emoji: '🤏' },
}

function Overview({ view }) {
  const { windowed, buckets, start, enabled, weekStreak } = view
  const rest = S.restBalance(windowed, start)
  const hoursBars = buckets.map((b) => ({
    label: b.label,
    segments: enabled.map((sport) => ({
      value: S.sportHours(b.sessions, sport),
      color: SPORT_META[sport].color,
    })),
  }))
  // Load stacked by sport, same reading as the hours chart. (Fitness & form
  // lives on each sport's own tab, where it's about one thing at a time.)
  const loadBars = buckets.map((b) => ({
    label: b.label,
    segments: enabled.map((sport) => ({
      value: Math.round(S.sumLoadEst(S.bySport(b.sessions, sport))),
      color: SPORT_META[sport].color,
    })),
  }))
  const feelingLine = buckets.map((b) => ({ label: b.label, value: S.round1(S.avgFeeling(b.sessions)) }))
  const hoursValue = enabled
    .map((sport) => `${SPORT_META[sport].emoji} ${S.round1(S.sportHours(windowed, sport))}h`)
    .join(' · ')

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: windowed.length },
          { label: 'Hours', value: S.round1(S.sumHours(windowed)), sub: 'h' },
          { label: 'Weekly streak', value: weekStreak, sub: weekStreak === 1 ? 'week' : 'weeks' },
          { label: 'Active days', value: rest.active, sub: `/ ${rest.total}` },
        ]}
      />
      <Card title="Training hours" value={hoursValue}>
        <Bars data={hoursBars} />
      </Card>
      <Card title="Training load" value={`${Math.round(S.sumLoadEst(windowed))} TSS`}>
        <Bars data={loadBars} />
      </Card>
      <Card title="Feeling trend" value={S.avgFeeling(windowed) != null ? `avg ${S.round1(S.avgFeeling(windowed))}/5` : '–'}>
        <Line data={feelingLine} color="var(--both)" fromZero={false} />
      </Card>
    </>
  )
}

// The fitness/fatigue/form series. Fitness is a whole-body number - your legs
// don't care which sport the load came from - so there is exactly one series:
// intervals.icu's own daily wellness rows when connected (matches their site
// 1:1), otherwise an estimate from the sessions logged in this app.
function athleteFitness(view) {
  if (view.icu?.wellness?.length) {
    return { series: S.wellnessSeries(view.icu.wellness, view.start), source: 'icu' }
  }
  return { series: S.fitnessSeries(view.base, view.start), source: 'app' }
}

const FITNESS_SOURCE_NOTE = {
  icu: 'Counts training from all your sports - the numbers come straight from intervals.icu, so they match what you see there.',
  app: 'Counts training from all your sports, estimated from the sessions logged in this app.',
}

// Stacked hours chart for a sport's two forms (indoor/outdoor, pool/open
// water). Sport colour = the indoor form, green = outside. Only on the sport
// tabs - the Overview keeps its one-colour-per-sport stack.
function SplitHoursCard({ view, sport, title, color, labels }) {
  const total = S.sportHoursSplit(view.windowed, sport)
  if (total.indoor + total.outdoor <= 0) return null
  const bars = view.buckets.map((b) => {
    const sp = S.sportHoursSplit(b.sessions, sport)
    return {
      label: b.label,
      segments: [
        { value: sp.indoor, color },
        { value: sp.outdoor, color: 'var(--both)' },
      ],
    }
  })
  return (
    <div className="card chart-card">
      <div className="chart-card-head">
        <span className="chart-card-title">{title}</span>
        <span className="chart-card-value">{S.round1(total.indoor + total.outdoor)} h</span>
      </div>
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: color }} />
          {labels[0]} {S.round1(total.indoor)}h
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--both)' }} />
          {labels[1]} {S.round1(total.outdoor)}h
        </span>
      </div>
      <Bars data={bars} />
    </div>
  )
}

// Whether a sport's tab should carry the fitness card. intervals.icu keeps one
// combined fitness number (its API has no per-sport ctl/atl), so the card only
// belongs on tabs whose sport actually feeds it: with intervals.icu connected
// that means sessions with real imported training load; offline, any session
// the local estimate can use.
function sportCarriesLoad(view, sport) {
  const rows = S.bySport(view.base, sport)
  if (view.icu?.wellness?.length) {
    return rows.some((s) => Number(s.extra?.training_load) > 0)
  }
  return rows.some((s) => S.sessionLoad(s) > 0)
}

// Fitness & form card, intervals.icu-style: fitness/fatigue lines on top,
// form in its coloured zones below. Sliding across the chart shows any day's
// numbers in the fixed readout above it. Only shows once there's real load
// history (imported TSS, or duration+RPE to estimate from).
function FitnessBlock({ view }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const { series: fitness, source } = athleteFitness(view)
  if (fitness.length < 2 || !fitness.some((p) => p.ctl >= 1)) return null
  // Clamp: the series can shrink when the intervals.icu data arrives mid-hover.
  const shownIdx = Math.min(hoverIdx ?? fitness.length - 1, fitness.length - 1)
  const shown = fitness[shownIdx]
  const isToday = hoverIdx == null || shownIdx === fitness.length - 1
  const status = S.formStatus(shown.form)

  return (
    <div className="card chart-card">
      <div className="chart-card-head">
        <span className="chart-card-title">Fitness &amp; form</span>
        <span className="form-badge" style={{ color: status.color }}>
          <span className="legend-dot" style={{ background: status.color }} />
          {status.label}
        </span>
      </div>
      {/* Fixed readout: the numbers below always describe this day. */}
      <div className="fitness-daterow">
        {isToday ? 'Today' : format(asDate(shown.date), 'EEEE d MMMM')}
      </div>
      <div className="fitness-now">
        <div className="fitness-stat">
          <span className="fitness-num" style={{ color: 'var(--climbing)' }}>{Math.round(shown.ctl)}</span>
          <span className="fitness-label">Fitness</span>
        </div>
        <div className="fitness-stat">
          <span className="fitness-num" style={{ color: 'var(--strength)' }}>{Math.round(shown.atl)}</span>
          <span className="fitness-label">Fatigue</span>
        </div>
        <div className="fitness-stat">
          <span className="fitness-num" style={{ color: status.color }}>
            {shown.form > 0 ? '+' : ''}
            {Math.round(shown.form)}
          </span>
          <span className="fitness-label">Form</span>
        </div>
      </div>
      <FitnessChart data={fitness} onScrub={setHoverIdx} />
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--climbing)' }} />
          Fitness
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--strength)' }} />
          Fatigue
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--text)' }} />
          Form (lower panel)
        </span>
      </div>
      <p className="muted small chart-note">
        Fitness is your 42-day average load, fatigue the 7-day. Form = fitness −
        fatigue, shown in its zones below: green = optimal training, blue =
        fresh and race-ready, red = overreached. Slide across the chart to see
        any day. {FITNESS_SOURCE_NOTE[source]}
      </p>
    </div>
  )
}

// ---- Cycling ----
function Cycling({ view }) {
  const { buckets, cycling } = view
  if (cycling.length === 0) return <div className="card empty-state"><p>No rides in this period.</p></div>
  const dist = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumDistance(S.bySport(b.sessions, 'cycling'))) }))
  const elev = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumElevation(S.bySport(b.sessions, 'cycling'))) }))
  const load = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumLoadEst(S.bySport(b.sessions, 'cycling'))) }))
  const speed = S.bucketAvgExtra(buckets, 'cycling', 'avg_speed')
  const power = S.bucketAvgExtra(buckets, 'cycling', 'avg_power')
  const hr = S.bucketAvgExtra(buckets, 'cycling', 'avg_hr')
  const bestPower = S.maxExtra(cycling, 'avg_power')
  const maxSpeed = S.maxExtra(cycling, 'max_speed')
  const biggestClimb = S.maxExtra(cycling, 'elevation_m')

  return (
    <>
      <Tiles
        items={[
          { label: 'Distance', value: Math.round(S.sumDistance(cycling)), sub: 'km' },
          { label: 'Time', value: S.round1(S.sumHours(cycling)), sub: 'h' },
          { label: 'Elevation', value: Math.round(S.sumElevation(cycling)), sub: 'm' },
          { label: 'Load', value: Math.round(S.sumLoadEst(cycling)), sub: 'TSS' },
        ]}
      />
      {sportCarriesLoad(view, 'cycling') && <FitnessBlock view={view} />}
      <div className="detail-block">
        <h2 className="section-title">Records this period</h2>
        <Tiles
          items={[
            { label: 'Longest ride', value: S.round1(S.longestDistanceKm(cycling)), sub: 'km' },
            { label: 'Biggest climb', value: Math.round(biggestClimb), sub: 'm' },
            ...(maxSpeed > 0 ? [{ label: 'Top speed', value: S.round1(maxSpeed), sub: 'km/h' }] : []),
            ...(bestPower > 0 ? [{ label: 'Best avg power', value: Math.round(bestPower), sub: 'W' }] : []),
            { label: 'Eddington', value: S.eddington(cycling), sub: 'km' },
            { label: 'Rides', value: cycling.length },
          ]}
        />
      </div>
      <SplitHoursCard
        view={view}
        sport="cycling"
        title="Cycling hours"
        color={CYCLING}
        labels={['Indoor', 'Outdoor']}
      />
      <Card title="Distance" value={`${Math.round(S.sumDistance(cycling))} km`}>
        <Bars data={dist} color={CYCLING} />
      </Card>
      <Card title="Elevation" value={`${Math.round(S.sumElevation(cycling))} m`}>
        <Bars data={elev} color={CYCLING} />
      </Card>
      <Card title="Training load" value={`${Math.round(S.sumLoadEst(cycling))} TSS`}>
        <Bars data={load} color="var(--primary)" />
      </Card>
      <Card title="Avg speed trend" value="km/h">
        <Line data={speed} color={CYCLING} fromZero={false} />
      </Card>
      {power.some((p) => p.value != null) && (
        <Card title="Avg power trend" value="W">
          <Line data={power} color="var(--primary)" fromZero={false} />
        </Card>
      )}
      {hr.some((p) => p.value != null) && (
        <Card title="Avg heart rate trend" value="bpm">
          <Line data={hr} color={RUNNING} fromZero={false} />
        </Card>
      )}
    </>
  )
}

// ---- Running ----
function Running({ view }) {
  const { buckets, running } = view
  if (running.length === 0)
    return <div className="card empty-state"><p>No runs in this period.</p></div>
  const dist = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumDistance(S.bySport(b.sessions, 'running'))) }))
  const elev = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumElevation(S.bySport(b.sessions, 'running'))) }))
  const load = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumLoadEst(S.bySport(b.sessions, 'running'))) }))
  const pace = S.bucketAvgPace(buckets, 'running')
  const hr = S.bucketAvgExtra(buckets, 'running', 'avg_hr')
  const feeling = buckets.map((b) => ({ label: b.label, value: S.round1(S.avgFeeling(S.bySport(b.sessions, 'running'))) }))
  const bestPace = S.bestRunPace(running)

  return (
    <>
      <Tiles
        items={[
          { label: 'Distance', value: Math.round(S.sumDistance(running)), sub: 'km' },
          { label: 'Elevation', value: Math.round(S.sumElevation(running)), sub: 'm' },
          { label: 'Hours', value: S.round1(S.sumHours(running)), sub: 'h' },
          { label: 'Load', value: Math.round(S.sumLoadEst(running)), sub: 'TSS' },
        ]}
      />
      {sportCarriesLoad(view, 'running') && <FitnessBlock view={view} />}
      <div className="detail-block">
        <h2 className="section-title">Records this period</h2>
        <Tiles
          items={[
            { label: 'Longest run', value: S.round1(S.longestDistanceKm(running)), sub: 'km' },
            ...(bestPace != null
              ? [{ label: 'Best avg pace', value: S.fmtPaceMin(bestPace), sub: '/km' }]
              : []),
            { label: 'Biggest climb', value: Math.round(S.maxExtra(running, 'elevation_m')), sub: 'm' },
            { label: 'Runs', value: running.length },
          ]}
        />
      </div>
      <SplitHoursCard
        view={view}
        sport="running"
        title="Running hours"
        color={RUNNING}
        labels={['Treadmill', 'Outdoor']}
      />
      <Card title="Distance" value={`${Math.round(S.sumDistance(running))} km`}>
        <Bars data={dist} color={RUNNING} />
      </Card>
      {pace.some((p) => p.value != null) && (
        <Card title="Avg pace trend" value="min/km">
          <Line data={pace} color={RUNNING} fromZero={false} fmt={S.fmtPaceMin} />
        </Card>
      )}
      <Card title="Elevation" value={`${Math.round(S.sumElevation(running))} m`}>
        <Bars data={elev} color={RUNNING} />
      </Card>
      {load.some((b) => b.value > 0) && (
        <Card title="Training load" value={`${Math.round(S.sumLoadEst(running))} TSS`}>
          <Bars data={load} color="var(--primary)" />
        </Card>
      )}
      {hr.some((p) => p.value != null) && (
        <Card title="Avg heart rate trend" value="bpm">
          <Line data={hr} color={RUNNING} fromZero={false} />
        </Card>
      )}
      <Card title="Feeling trend" value={S.avgFeeling(running) != null ? `avg ${S.round1(S.avgFeeling(running))}/5` : '–'}>
        <Line data={feeling} color={RUNNING} fromZero={false} />
      </Card>
    </>
  )
}

// ---- Swimming ----
function Swimming({ view }) {
  const { buckets, swimming } = view
  if (swimming.length === 0)
    return <div className="card empty-state"><p>No swims in this period.</p></div>
  const dist = buckets.map((b) => ({ label: b.label, value: Math.round(S.sumDistanceM(S.bySport(b.sessions, 'swimming'))) }))
  const pace = S.bucketAvgPace(buckets, 'swimming')
  const feeling = buckets.map((b) => ({ label: b.label, value: S.round1(S.avgFeeling(S.bySport(b.sessions, 'swimming'))) }))
  const bestPace = S.bestSwimPace(swimming)

  return (
    <>
      <Tiles
        items={[
          { label: 'Distance', value: Math.round(S.sumDistanceM(swimming)), sub: 'm' },
          { label: 'Sessions', value: swimming.length },
          { label: 'Hours', value: S.round1(S.sumHours(swimming)), sub: 'h' },
          { label: 'Longest swim', value: Math.round(S.longestSwim(swimming)), sub: 'm' },
        ]}
      />
      {sportCarriesLoad(view, 'swimming') && <FitnessBlock view={view} />}
      {bestPace != null && (
        <div className="detail-block">
          <h2 className="section-title">Records this period</h2>
          <Tiles
            items={[
              { label: 'Best avg pace', value: S.fmtPaceMin(bestPace), sub: '/100m' },
              { label: 'Longest swim', value: Math.round(S.longestSwim(swimming)), sub: 'm' },
            ]}
          />
        </div>
      )}
      <SplitHoursCard
        view={view}
        sport="swimming"
        title="Swimming hours"
        color={SWIMMING}
        labels={['Pool', 'Open water']}
      />
      <Card title="Distance" value={`${Math.round(S.sumDistanceM(swimming))} m`}>
        <Bars data={dist} color={SWIMMING} />
      </Card>
      {pace.some((p) => p.value != null) && (
        <Card title="Avg pace trend" value="min/100m">
          <Line data={pace} color={SWIMMING} fromZero={false} fmt={S.fmtPaceMin} />
        </Card>
      )}
      <Card title="Feeling trend" value={S.avgFeeling(swimming) != null ? `avg ${S.round1(S.avgFeeling(swimming))}/5` : '–'}>
        <Line data={feeling} color={SWIMMING} fromZero={false} />
      </Card>
    </>
  )
}

// ---- Climbing ----
function Climbing({ view }) {
  const { buckets, climbing } = view
  if (climbing.length === 0) return <div className="card empty-state"><p>No climbing in this period.</p></div>
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
          { label: 'Hours', value: S.round1(S.sportHours(climbing, 'climbing')), sub: 'h' },
          { label: 'Outdoor', value: loc.outdoor },
          { label: 'Indoor', value: loc.indoor },
        ]}
      />
      {sportCarriesLoad(view, 'climbing') && <FitnessBlock view={view} />}
      <SplitHoursCard
        view={view}
        sport="climbing"
        title="Climbing hours"
        color={CLIMBING}
        labels={['Indoor', 'Outdoor']}
      />
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
      <Card title="Feeling trend" value={S.avgFeeling(climbing) != null ? `avg ${S.round1(S.avgFeeling(climbing))}/5` : '–'}>
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
            { label: '2. go', value: sends.secondgo, color: CYCLING },
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
  const sessCount = S.liftSessionCount(windowed)

  if (exercises.length === 0) {
    return (
      <div className="card empty-state">
        <p>No strength training in this period.</p>
        <p className="muted small">Log a strength session (or add it to indoor climbing).</p>
      </div>
    )
  }

  const selected = exercises.includes(exKey) ? exKey : exercises[0] || null
  const series = selected ? S.exerciseSeries(windowed, selected, metric) : []
  const best = selected ? S.exerciseBest(windowed, selected) : null

  const freqBars = buckets.map((b) => ({ label: b.label, value: S.liftSessionCount(b.sessions) }))
  const repsBars = buckets.map((b) => ({ label: b.label, value: S.totalReps(b.sessions) }))

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: sessCount },
          { label: 'Exercises', value: exercises.length },
          { label: 'Total reps', value: S.totalReps(windowed) },
        ]}
      />

      <Card title="Sessions per period">
        <Bars data={freqBars} color={STRENGTH} />
      </Card>

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
  )
}

// ---- Finger ----
function Finger({ view }) {
  const { windowed, buckets } = view
  const hang = S.hangboardSeries(windowed)
  const campus = S.campusCount(windowed)
  const sessCount = S.fingerSessionCount(windowed)

  if (sessCount === 0 && hang.length === 0 && campus === 0) {
    return (
      <div className="card empty-state">
        <p>No finger training in this period.</p>
        <p className="muted small">Log a finger session (or add it to indoor climbing).</p>
      </div>
    )
  }

  const bestHang = hang.reduce((m, p) => Math.max(m, p.value), 0)
  const freqBars = buckets.map((b) => ({ label: b.label, value: S.fingerSessionCount(b.sessions) }))

  return (
    <>
      <Tiles
        items={[
          { label: 'Sessions', value: sessCount },
          { label: 'Campus', value: campus },
          { label: 'Best hang', value: bestHang || '–', sub: bestHang ? 'kg' : '' },
        ]}
      />

      <Card title="Sessions per period">
        <Bars data={freqBars} color={FINGER} />
      </Card>

      <Card title="Hangboard, max two-hand weight" value="kg added">
        {hang.length ? (
          <Line data={hang} color={FINGER} />
        ) : (
          <p className="muted small">Log two-hand hangboard sets to track this.</p>
        )}
      </Card>
    </>
  )
}
