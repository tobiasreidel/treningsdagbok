import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HBars } from '../components/charts'
import { SPORTS } from '../lib/constants'
import { weekRange, inRange, formatDayShort, formatDuration } from '../lib/format'
import { fetchSessions } from '../lib/sessions'
import {
  loadConnections,
  friendsFeed,
  sendRequest,
  respondRequest,
  removeFriend,
} from '../lib/friends'

const round1 = (n) => Math.round(n * 10) / 10

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
    load().catch(() => setData({ friends: [], incoming: [], outgoing: [], feed: [], mine: [] }))
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
          {[
            { key: 'feed', label: 'Feed' },
            { key: 'leaderboard', label: 'Leaderboard' },
            { key: 'friends', label: 'Friends' },
          ].map((t) => (
            <button
              key={t.key}
              className={`pill ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === 'friends' && data?.incoming?.length ? (
                <span className="pill-badge">{data.incoming.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : tab === 'feed' ? (
          <Feed feed={data.feed} />
        ) : tab === 'leaderboard' ? (
          <Leaderboard data={data} />
        ) : (
          <Manage data={data} reload={load} />
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
  const grades = s.extra?.grades || []
  return [s.subtype, formatDuration(d), grades.length ? `${grades.length} grades` : null]
    .filter(Boolean)
    .join(' · ')
}

function Feed({ feed }) {
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
        <div className="card feed-item" key={s.id}>
          <div className="feed-top">
            <span className="feed-who">{s.who}</span>
            <span className="muted small">{formatDayShort(s.date)}</span>
          </div>
          <div className="feed-body">
            <span>{SPORTS[s.sport]?.emoji}</span>
            <span className="feed-summary">{summary(s)}</span>
            {s.feeling ? <span className="muted small">feeling {s.feeling}/5</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function Leaderboard({ data }) {
  const wk = weekRange()
  const hours = (arr) =>
    arr.filter((s) => inRange(s.date, wk)).reduce((a, s) => a + (Number(s.duration) || 0), 0) / 60
  const dist = (arr) =>
    arr
      .filter((s) => inRange(s.date, wk) && s.sport === 'cycling')
      .reduce((a, s) => a + (Number(s.extra?.distance_km) || 0), 0)

  // group friend feed by person
  const byWho = {}
  for (const s of data.feed) (byWho[s.who] ||= []).push(s)

  const people = [
    { label: 'You', sessions: data.mine },
    ...Object.entries(byWho).map(([label, sessions]) => ({ label, sessions })),
  ]

  if (people.length <= 1 && data.mine.length === 0) {
    return (
      <div className="card empty-state">
        <p>Nothing to rank yet.</p>
        <p className="muted small">Add friends to compare this week.</p>
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
          <span className="chart-card-title">Hours this week</span>
        </div>
        <HBars data={hoursBoard} unit="h" color="var(--both)" />
      </div>
      <div className="card chart-card">
        <div className="chart-card-head">
          <span className="chart-card-title">Distance this week</span>
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
            <p className="muted small">No friends yet — send a request above.</p>
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
