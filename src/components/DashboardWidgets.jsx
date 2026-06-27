// The catalog of dashboard widgets. Each entry is a small stat card the user
// can place on the front page from the Customize screen. What shows is entirely
// the user's choice — nothing here keys off which sports are "enabled".
import { startOfYear, endOfYear } from 'date-fns'
import { lastNDaysRange, monthRange, inRange, toHours } from '../lib/format'
import { SPORTS } from '../lib/constants'
import { ALL_SPORTS } from '../lib/prefs'
import {
  sportMinutes,
  sumDistance,
  sumDistanceM,
  sumElevation,
  sportHours,
  currentWeekStreak,
  restBalance,
  bySport,
  liftSessionCount,
  totalReps,
  fingerSessionCount,
  round1,
} from '../lib/stats'

function yearRange(ref = new Date()) {
  return { start: startOfYear(ref), end: endOfYear(ref) }
}

const within = (sessions, range) => sessions.filter((s) => inRange(s.date, range))
const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`

// Shared card shell so every widget looks like the originals.
function StatCard({ title, big, small, split, sub }) {
  return (
    <div className="card stat-card">
      <span className="stat-title">{title}</span>
      <span className="stat-big">
        {big}
        {small && <small> {small}</small>}
      </span>
      {split && <div className="stat-split">{split}</div>}
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

// A period summary (hours + per-sport split + session count) for a date range.
function PeriodSummary({ sessions, range, title }) {
  const win = within(sessions, range)
  let minutes = 0
  const bySportMin = {}
  for (const s of win) {
    minutes += Number(s.duration) || 0
    for (const p of sportMinutes(s)) {
      bySportMin[p.sport] = (bySportMin[p.sport] || 0) + p.minutes
    }
  }
  const lines = ALL_SPORTS.filter((sp) => (bySportMin[sp] || 0) > 0)
  return (
    <StatCard
      title={title}
      big={`${toHours(minutes)}h`}
      split={lines.map((sp) => (
        <span key={sp}>
          <i className={`dot-${sp}`} /> {toHours(bySportMin[sp] || 0)}h
        </span>
      ))}
      sub={`${win.length} ${plural(win.length, 'session')}`}
    />
  )
}

// Sum of a sport's distance (km) in a range, as a rounded card.
function SportDistanceKm({ sessions, range, sport, title, withElevation }) {
  const win = bySport(within(sessions, range), sport)
  const dist = Math.round(sumDistance(win))
  const elev = Math.round(sumElevation(win))
  return (
    <StatCard
      title={title}
      big={dist}
      small="km"
      split={withElevation ? <span>⛰ {elev} m</span> : undefined}
      sub={withElevation ? 'distance & climb' : 'distance'}
    />
  )
}

// ---- widget components -----------------------------------------------------
const WeekSummary = ({ sessions }) => (
  <PeriodSummary sessions={sessions} range={lastNDaysRange(7)} title="Last 7 days" />
)

const MonthSummary = ({ sessions }) => (
  <PeriodSummary sessions={sessions} range={monthRange()} title="This month" />
)

const YearSummary = ({ sessions }) => {
  const win = within(sessions, yearRange())
  const minutes = win.reduce((a, s) => a + (Number(s.duration) || 0), 0)
  return (
    <StatCard
      title="This year"
      big={`${toHours(minutes)}h`}
      sub={`${win.length} ${plural(win.length, 'session')}`}
    />
  )
}

const Streak = ({ sessions }) => {
  const w = currentWeekStreak(sessions)
  return (
    <StatCard
      title="Weekly streak"
      big={w}
      small={plural(w, 'week')}
      sub={w === 0 ? 'train this week to start' : 'in a row'}
    />
  )
}

const ActiveDays = ({ sessions }) => {
  const { start } = monthRange()
  const rb = restBalance(sessions, start)
  return (
    <StatCard
      title="Active days · month"
      big={rb.active}
      small={`/ ${rb.total}`}
      sub={`${rb.rest} rest ${plural(rb.rest, 'day')}`}
    />
  )
}

const CyclingMonth = ({ sessions }) => (
  <SportDistanceKm sessions={sessions} range={monthRange()} sport="cycling" title="Cycling · month" withElevation />
)

const CyclingWeek = ({ sessions }) => (
  <SportDistanceKm sessions={sessions} range={lastNDaysRange(7)} sport="cycling" title="Cycling · 7 days" />
)

const RunningMonth = ({ sessions }) => (
  <SportDistanceKm sessions={sessions} range={monthRange()} sport="running" title="Running · month" withElevation />
)

const RunningWeek = ({ sessions }) => (
  <SportDistanceKm sessions={sessions} range={lastNDaysRange(7)} sport="running" title="Running · 7 days" />
)

const SwimmingMonth = ({ sessions }) => {
  const win = bySport(within(sessions, monthRange()), 'swimming')
  return <StatCard title="Swimming · month" big={Math.round(sumDistanceM(win))} small="m" sub="distance" />
}

const ClimbingMonth = ({ sessions }) => {
  const win = within(sessions, monthRange())
  const c = bySport(win, 'climbing')
  return (
    <StatCard
      title="Climbing · month"
      big={c.length}
      small={plural(c.length, 'session')}
      split={<span>{round1(sportHours(win, 'climbing'))}h climbing</span>}
      sub="this month"
    />
  )
}

const StrengthMonth = ({ sessions }) => {
  const win = within(sessions, monthRange())
  const cnt = liftSessionCount(win)
  return (
    <StatCard
      title="Strength · month"
      big={cnt}
      small={plural(cnt, 'session')}
      split={<span>{totalReps(win)} reps</span>}
      sub="this month"
    />
  )
}

const FingerMonth = ({ sessions }) => {
  const win = within(sessions, monthRange())
  const cnt = fingerSessionCount(win)
  return <StatCard title="Finger · month" big={cnt} small={plural(cnt, 'session')} sub="this month" />
}

// ---- catalog ----------------------------------------------------------------
export const WIDGETS = [
  { id: 'week-summary', title: 'Last 7 days', desc: 'Hours, sport split and sessions', category: 'general', Component: WeekSummary },
  { id: 'month-summary', title: 'This month', desc: 'Hours, sport split and sessions', category: 'general', Component: MonthSummary },
  { id: 'year-summary', title: 'This year', desc: 'Total hours and sessions', category: 'general', Component: YearSummary },
  { id: 'streak', title: 'Weekly streak', desc: 'Consecutive weeks trained', category: 'general', Component: Streak },
  { id: 'active-days', title: 'Active days', desc: 'Active vs rest days this month', category: 'general', Component: ActiveDays },
  { id: 'cycling-month', title: 'Cycling · month', desc: 'Distance and elevation this month', category: 'cycling', Component: CyclingMonth },
  { id: 'cycling-week', title: 'Cycling · 7 days', desc: 'Distance over the last 7 days', category: 'cycling', Component: CyclingWeek },
  { id: 'running-month', title: 'Running · month', desc: 'Distance and elevation this month', category: 'running', Component: RunningMonth },
  { id: 'running-week', title: 'Running · 7 days', desc: 'Distance over the last 7 days', category: 'running', Component: RunningWeek },
  { id: 'swimming-month', title: 'Swimming · month', desc: 'Distance this month', category: 'swimming', Component: SwimmingMonth },
  { id: 'climbing-month', title: 'Climbing · month', desc: 'Sessions and hours this month', category: 'climbing', Component: ClimbingMonth },
  { id: 'strength-month', title: 'Strength · month', desc: 'Sessions and reps this month', category: 'strength', Component: StrengthMonth },
  { id: 'finger-month', title: 'Finger · month', desc: 'Sessions this month', category: 'finger', Component: FingerMonth },
]

export const WIDGET_MAP = Object.fromEntries(WIDGETS.map((w) => [w.id, w]))

// Catalog grouped for the Customize screen: General first, then one section per
// sport (only sports that actually have widgets show up).
export const WIDGET_GROUPS = [
  { key: 'general', label: 'General', emoji: '📊' },
  ...ALL_SPORTS.map((k) => ({ key: k, label: SPORTS[k].label, emoji: SPORTS[k].emoji })),
]
  .map((g) => ({ ...g, widgets: WIDGETS.filter((w) => w.category === g.key) }))
  .filter((g) => g.widgets.length > 0)
