import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HBars } from '../components/charts'
import { SPORTS } from '../lib/constants'
import { lastNDaysRange, inRange, formatDayShort, formatDuration } from '../lib/format'
import { fetchSessions } from '../lib/sessions'
import {
  loadConnections,
  friendsFeed,
  sendRequest,
  respondRequest,
  removeFriend,
} from '../lib/friends'
import {
  loadCoachLinks,
  sendCoachRequest,
  respondCoachRequest,
  removeCoachLink,
} from '../lib/coaches'

const EMPTY_COACH = { coaches: [], requests: [], athletes: [] }

const round1 = (n) => Math.round(n * 10) / 10

const TABS = [
  { key: 'feed', label: 'Feed' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'friends', label: 'Friends' },
  { key: 'coach', label: 'Coach' },
]

// Count waiting on me, per tab: friend requests on Friends, coaching requests
// on Coach.
const tabBadge = (key, data) => {
  if (key === 'friends') return data?.incoming?.length || 0
  if (key === 'coach') return data?.coach?.requests?.length || 0
  return 0
}

export default function Friends() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('feed')

  const load = useCallback(async () => {
    const conn = await loadConnections()
    const [feed, mine, coach] = await Promise.all([
      friendsFeed(conn.friends).catch(() => []),
      fetchSessions().catch(() => []),
      // Best-effort: coaches.sql may not be applied yet on older setups.
      loadCoachLinks().catch(() => EMPTY_COACH),
    ])
    setData({ ...conn, feed, mine, coach })
  }, [])

  useEffect(() => {
    load().catch(() =>
      setData({ friends: [], incoming: [], outgoing: [], feed: [], mine: [], coach: EMPTY_COACH }),
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
              {tabBadge(t.key, data) ? (
                <span className="pill-badge">{tabBadge(t.key, data)}</span>
              ) : null}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : tab === 'feed' ? (
          <Feed feed={data.feed} navigate={navigate} />
        ) : tab === 'leaderboard' ? (
          <Leaderboard data={data} />
        ) : tab === 'friends' ? (
          <Manage data={data} reload={load} />
        ) : (
          <CoachManager coach={data.coach || EMPTY_COACH} reload={load} navigate={navigate} />
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
  return [s.subtype, formatDuration(d), climbs].filter(Boolean).join(' · ')
}

// Each entry opens the friend's session read-only — RLS only ever returns
// shared sessions, and the detail page hides edit/delete for non-owners.
function Feed({ feed, navigate }) {
  if (!feed.length) {
    return (
      <div className="card empty-state">
        <p>No friend activity yet.</p>
        <p className="muted small">Add friends and you'll see their sessions here.</p>
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
        <p className="muted small">Add friends to compare the last 7 days.</p>
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

function Manage({ data, reload }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await sendRequest(email)
      const messages = {
        ok: { ok: true, text: 'Request sent!' },
        not_found: { ok: false, text: 'No account found with that email.' },
        self: { ok: false, text: "That's you 🙂" },
        exists: { ok: false, text: "You're already connected or have a pending request." },
      }
      setMsg(messages[res] || { ok: false, text: 'Could not send request.' })
      if (res === 'ok') {
        setEmail('')
        reload()
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn) => {
    await fn()
    reload()
  }

  const nameOf = (c) => c.profile?.display_name || c.profile?.email || 'Someone'

  return (
    <div className="stack">
      <div className="card stack">
        <label className="field">
          <span className="field-label">Add a friend by email</span>
          <input
            type="email"
            value={email}
            placeholder="friend@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
        {msg && <p className={msg.ok ? 'auth-notice' : 'auth-error'}>{msg.text}</p>}
      </div>

      {data.incoming.length > 0 && (
        <section className="section">
          <h2 className="section-title">Requests</h2>
          {data.incoming.map((c) => (
            <div className="card friend-row" key={c.id}>
              <span className="friend-name">{nameOf(c)}</span>
              <span className="friend-actions">
                <button className="btn btn-primary btn-sm" onClick={() => act(() => respondRequest(c.id, true))}>
                  Accept
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => act(() => respondRequest(c.id, false))}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Friends ({data.friends.length})</h2>
        {data.friends.length === 0 ? (
          <div className="card empty-state">
            <p className="muted small">No friends yet. Send a request above.</p>
          </div>
        ) : (
          data.friends.map((c) => (
            <div className="card friend-row" key={c.id}>
              <span className="friend-name">{nameOf(c)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => act(() => removeFriend(c.id))}>
                Remove
              </button>
            </div>
          ))
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section className="section">
          <h2 className="section-title">Pending sent</h2>
          {data.outgoing.map((c) => (
            <div className="card friend-row" key={c.id}>
              <span className="friend-name">{nameOf(c)}</span>
              <span className="muted small">pending</span>
            </div>
          ))}
        </section>
      )}

      <p className="muted small">
        Control whether friends can see your activities in Settings → privacy.
      </p>
    </div>
  )
}

// Coaches get full read-only access to your account. You add a coach by email;
// they accept. You can also accept people who ask you to coach them, and open
// any athlete you coach to see their overview and stats.
function CoachManager({ coach, reload, navigate }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const nameOf = (c) => c.profile?.display_name || c.profile?.email || 'Someone'
  const act = async (fn) => {
    await fn()
    reload()
  }

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await sendCoachRequest(email)
      const messages = {
        ok: { ok: true, text: 'Coach invited. They need to accept.' },
        not_found: { ok: false, text: 'No account found with that email.' },
        self: { ok: false, text: "That's you 🙂" },
        exists: { ok: false, text: 'That person is already your coach (or invited).' },
      }
      setMsg(messages[res] || { ok: false, text: 'Could not send invite.' })
      if (res === 'ok') {
        setEmail('')
        reload()
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <label className="field">
          <span className="field-label">Add a coach by email</span>
          <span className="field-hint">
            A coach can see everything in your account: sessions, calendar and
            stats. They can’t change anything.
          </span>
          <input
            type="email"
            value={email}
            placeholder="coach@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Invite coach'}
        </button>
        {msg && <p className={msg.ok ? 'auth-notice' : 'auth-error'}>{msg.text}</p>}
      </div>

      {coach.requests.length > 0 && (
        <section className="section">
          <h2 className="section-title">Coaching requests</h2>
          {coach.requests.map((c) => (
            <div className="card friend-row" key={c.id}>
              <span className="friend-name">{nameOf(c)} wants you to coach them</span>
              <span className="friend-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => act(() => respondCoachRequest(c.id, true))}
                >
                  Accept
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => act(() => respondCoachRequest(c.id, false))}
                >
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {coach.athletes.length > 0 && (
        <section className="section">
          <h2 className="section-title">Athletes you coach ({coach.athletes.length})</h2>
          {coach.athletes.map((c) => (
            <button
              className="card friend-row clickable-row"
              key={c.id}
              onClick={() => navigate(`/athlete/${c.otherId}`)}
            >
              <span className="friend-name">{nameOf(c)}</span>
              <span className="muted small">View ›</span>
            </button>
          ))}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Your coaches</h2>
        {coach.coaches.length === 0 ? (
          <div className="card empty-state">
            <p className="muted small">No coaches yet. Invite one above.</p>
          </div>
        ) : (
          coach.coaches.map((c) => (
            <div className="card friend-row" key={c.id}>
              <span className="friend-name">
                {nameOf(c)}
                {c.status === 'pending' && <span className="muted small"> · pending</span>}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => act(() => removeCoachLink(c.id))}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
