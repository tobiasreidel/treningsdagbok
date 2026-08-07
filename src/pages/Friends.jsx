import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HBars } from '../components/charts'
import { SPORTS, subtypeWord } from '../lib/constants'
import { lastNDaysRange, inRange, formatDayShort, formatDuration } from '../lib/format'
import { fetchSessions } from '../lib/sessions'
import { loadConnections, friendsFeed } from '../lib/friends'

const round1 = (n) => Math.round(n * 10) / 10

// Managing people (friends and coaches) now lives on the profile; this page is
// just for seeing what friends are up to.
const TABS = [
  { key: 'feed', label: 'Feed' },
  { key: 'leaderboard', label: 'Leaderboard' },
]

export default function Friends() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('feed')

  const load = useCallback(async () => {
    const conn = await loadConnections()
    const [feed, mine] = await Promise.all([
      friendsFeed(conn.friends).catch(() => []),
      fetchSessions().catch(() => []),
    ])
    setData({ ...conn, feed, mine })
  }, [])

  useEffect(() => {
    load().catch(() =>
      setData({ friends: [], incoming: [], outgoing: [], feed: [], mine: [] }),
    )
  }, [load])

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Friends</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <div className="pill-row">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`pill ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : tab === 'feed' ? (
          <Feed feed={data.feed} navigate={navigate} />
        ) : (
          <Leaderboard data={data} />
        )}
      </main>
    </div>
  )
}

function summary(s) {
  const d = Number(s.duration) || 0
  if (s.sport === 'cycling') {
    const km = Number(s.extra?.distance_km)
    return [km ? `${Math.round(km)} km` : null, formatDuration(d)].filter(Boolean).join(' · ')
  }
  // Outdoor climbs carry a route log; indoor ones may have "grades worked".
  const nRoutes = s.routes?.length || 0
  const grades = s.extra?.grades || []
  const climbs = nRoutes
    ? `${nRoutes} route${nRoutes === 1 ? '' : 's'}`
    : grades.length
      ? `${grades.length} grades`
      : null
  return [subtypeWord(s.subtype), formatDuration(d), climbs].filter(Boolean).join(' · ')
}

// Each entry opens the friend's session read-only - RLS only ever returns
// shared sessions, and the detail page hides edit/delete for non-owners.
function Feed({ feed, navigate }) {
  if (!feed.length) {
    return (
      <div className="card empty-state">
        <p>No friend activity yet.</p>
        <p className="muted small">Add friends on your profile and you'll see their sessions here.</p>
      </div>
    )
  }
  return (
    <div className="stack">
      {feed.map((s) => (
        <button
          className="card feed-item clickable-row"
          key={s.id}
          onClick={() => navigate(`/session/${s.id}`)}
        >
          <div className="feed-top">
            <span className="feed-who">{s.who}</span>
            <span className="muted small">{formatDayShort(s.date)}</span>
          </div>
          <div className="feed-body">
            <span>{SPORTS[s.sport]?.emoji}</span>
            <span className="feed-summary">{summary(s)}</span>
            {s.feeling ? <span className="muted small">feeling {s.feeling}/5</span> : null}
          </div>
        </button>
      ))}
    </div>
  )
}

function Leaderboard({ data }) {
  const wk = lastNDaysRange(7)
  const hours = (arr) =>
    arr.filter((s) => inRange(s.date, wk)).reduce((a, s) => a + (Number(s.duration) || 0), 0) / 60
  const dist = (arr) =>
    arr
      .filter((s) => inRange(s.date, wk) && s.sport === 'cycling')
      .reduce((a, s) => a + (Number(s.extra?.distance_km) || 0), 0)

  // Group the friend feed per person by user id (two friends can share a
  // display name), labelled with their name.
  const byWho = {}
  for (const s of data.feed) {
    ;(byWho[s.user_id] ||= { label: s.who, sessions: [] }).sessions.push(s)
  }

  const people = [{ label: 'You', sessions: data.mine }, ...Object.values(byWho)]

  if (people.length <= 1 && data.mine.length === 0) {
    return (
      <div className="card empty-state">
        <p>Nothing to rank yet.</p>
        <p className="muted small">Add friends on your profile to compare the last 7 days.</p>
      </div>
    )
  }

  const hoursBoard = people
    .map((p) => ({ label: p.label, value: round1(hours(p.sessions)) }))
    .sort((a, b) => b.value - a.value)
  const distBoard = people
    .map((p) => ({ label: p.label, value: Math.round(dist(p.sessions)) }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="stack">
      <div className="card chart-card">
        <div className="chart-card-head">
          <span className="chart-card-title">Hours · last 7 days</span>
        </div>
        <HBars data={hoursBoard} unit="h" color="var(--both)" />
      </div>
      <div className="card chart-card">
        <div className="chart-card-head">
          <span className="chart-card-title">Distance · last 7 days</span>
        </div>
        <HBars data={distBoard} unit=" km" color="var(--cycling)" />
      </div>
    </div>
  )
}

// Coach management (your coaches, athletes you coach, invites) now lives on the
// profile, alongside friends - see PeopleCard in pages/Profile.jsx.
