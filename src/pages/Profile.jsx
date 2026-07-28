import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Field, Segmented } from '../components/ui'
import { SPORTS } from '../lib/constants'
import Avatar from '../components/Avatar'
import { SettingsIcon, PencilIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import {
  getMyProfile,
  setDisplayName,
  loadConnections,
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
import { setSignalSharing } from '../lib/squad'
import { getAvatarUrl, uploadAvatar, removeAvatar } from '../lib/profile'
import { fetchSessions } from '../lib/sessions'
import { sumHours, currentWeekStreak, round1 } from '../lib/stats'
import { BODY_AREAS, areaLabel } from '../lib/wellness'
import {
  fetchPeriodDays,
  analyzeCycle,
  cycleInfoFor,
  fetchInjuries,
  addInjury,
  endInjury,
  deleteInjury,
  injuryDays,
} from '../lib/health'
import { formatDayShort, todayISO } from '../lib/format'
import {
  getLogPeriod,
  getAvatarEmoji,
  setAvatarEmoji,
  getHrZoneCount,
  setHrZoneCount,
  getMaxHr,
  setMaxHr,
  getCustomHrCeilings,
  setCustomHrCeilings,
  standardHrCeilings,
  getUseIcuZones,
  setUseIcuZones,
  getGearSports,
} from '../lib/prefs'
import { ZONE_COLORS } from '../lib/constants'
import {
  fetchGearItems,
  addGearItem,
  setMainGearItem,
  deleteGearItem,
  itemTotalWear,
  fetchGearEvents,
  addGearEvent,
  deleteGearEvent,
  gearStatus,
  formatWear,
  GEAR_NOUN,
  GEAR_SUGGESTIONS,
} from '../lib/gear'

// Stand-in avatars for anyone who'd rather not upload a photo.
const AVATAR_EMOJI = ['🚴', '🏃', '🏊', '🧗', '💪', '🔥', '⚡', '🏔️', '🐐', '🦄']

export default function Profile() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [displayName, setDisplayNameState] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [emoji, setEmoji] = useState(getAvatarEmoji)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState(null)
  const [lifetime, setLifetime] = useState(null) // {count, hours, streak}
  const [sessions, setSessions] = useState([]) // full rows, for the gear card
  const [cycle, setCycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)
  const savedName = useRef('')
  const flashTimer = useRef()
  const fileRef = useRef(null)
  const logPeriod = getLogPeriod() // toggle itself lives in Settings now

  useEffect(() => {
    Promise.all([getMyProfile().catch(() => ({})), getAvatarUrl().catch(() => null)])
      .then(([profile, url]) => {
        setDisplayNameState(profile?.display_name || '')
        savedName.current = profile?.display_name || ''
        setAvatarUrl(url)
      })
      .finally(() => setLoading(false))
    // Lifetime numbers make it feel like an athlete page, not a form.
    fetchSessions()
      .then((rows) => {
        setSessions(rows)
        setLifetime({
          count: rows.length,
          hours: round1(sumHours(rows)),
          streak: currentWeekStreak(rows),
        })
      })
      .catch(() => {})
    return () => clearTimeout(flashTimer.current)
  }, [])

  // Cycle stats need the logged days - only fetched while tracking is on.
  useEffect(() => {
    if (!logPeriod) return undefined
    let alive = true
    fetchPeriodDays()
      .then((days) => alive && setCycle(analyzeCycle(days)))
      .catch(() => alive && setCycle(null))
    return () => {
      alive = false
    }
  }, [logPeriod])

  const showFlash = (msg = 'Saved') => {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1600)
  }

  const commitName = () => {
    setEditingName(false)
    if (displayName === savedName.current) return
    savedName.current = displayName
    setDisplayName(displayName).catch(() => {})
    showFlash()
  }

  const pickPhoto = () => fileRef.current?.click()

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setAvatarBusy(true)
    setAvatarErr(null)
    try {
      await uploadAvatar(file)
      setAvatarUrl(await getAvatarUrl())
      setEditingAvatar(false)
      showFlash('Photo updated')
    } catch (err) {
      setAvatarErr(err.message || 'Could not upload the photo')
    } finally {
      setAvatarBusy(false)
    }
  }

  const onRemovePhoto = async () => {
    setAvatarBusy(true)
    setAvatarErr(null)
    try {
      await removeAvatar()
      setAvatarUrl(null)
      showFlash('Photo removed')
    } catch (err) {
      setAvatarErr(err.message || 'Could not remove the photo')
    } finally {
      setAvatarBusy(false)
    }
  }

  const chooseEmoji = (e) => {
    const next = emoji === e ? '' : e
    setEmoji(next)
    setAvatarEmoji(next)
    showFlash()
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  const phase = cycle?.lastStart ? cycleInfoFor(cycle, todayISO()) : null
  const joined = user?.created_at ? format(new Date(user.created_at), 'MMMM yyyy') : null

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Profile</h1>
        </div>
        <button
          className="icon-btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      <main className="wizard-body stack">
        <section className="profile-hero">
          <div className="profile-avatar-wrap">
            <Avatar url={avatarUrl} emoji={emoji} name={displayName || user?.email} size={96} />
            <button
              type="button"
              className="avatar-edit"
              onClick={() => setEditingAvatar((v) => !v)}
              aria-label="Change profile picture"
              title="Change picture"
            >
              <PencilIcon size={13} />
            </button>
          </div>

          {editingName ? (
            <input
              className="profile-name-input"
              type="text"
              value={displayName}
              autoFocus
              placeholder="Your name"
              onChange={(e) => setDisplayNameState(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') {
                  setDisplayNameState(savedName.current)
                  setEditingName(false)
                }
              }}
            />
          ) : (
            <div className="profile-name-row">
              <span className="profile-name">{displayName || 'Unnamed athlete'}</span>
              <button
                type="button"
                className="name-edit"
                onClick={() => setEditingName(true)}
                aria-label="Edit name"
                title="Edit name"
              >
                <PencilIcon size={13} />
              </button>
            </div>
          )}

          {user?.email && <span className="muted small">{user.email}</span>}
          {joined && <span className="profile-joined muted small">Training here since {joined}</span>}

          {lifetime && (
            <div className="profile-stats">
              <div className="profile-stat">
                <span className="profile-stat-num">{lifetime.count}</span>
                <span className="profile-stat-label">Activities</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{lifetime.hours}</span>
                <span className="profile-stat-label">Hours</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-num">{lifetime.streak}</span>
                <span className="profile-stat-label">Week streak</span>
              </div>
            </div>
          )}
        </section>

        {editingAvatar && (
          <section className="card settings-card stack">
            <div className="avatar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={pickPhoto}
                disabled={avatarBusy}
              >
                {avatarBusy ? '…' : avatarUrl ? 'Upload new photo' : 'Upload photo'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onRemovePhoto}
                  disabled={avatarBusy}
                >
                  Remove photo
                </button>
              )}
            </div>
            {avatarErr && <p className="auth-error">{avatarErr}</p>}
            {!avatarUrl && (
              <Field label="Or pick an avatar" hint="Tap again to go back to initials.">
                <div className="chips">
                  {AVATAR_EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={`chip chip-emoji ${emoji === e ? 'is-active' : ''}`}
                      onClick={() => chooseEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </section>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPhoto}
          style={{ display: 'none' }}
        />

        <PeopleCard />

        <section className="card settings-card stack">
          <h2 className="step-q">Health</h2>

          {logPeriod && cycle?.lastStart && (
            <div className="stack" style={{ gap: 10 }}>
              <span className="field-label">Cycle</span>
              <div className="tile-grid tile-grid-compact">
                <div className="tile">
                  <span className="tile-label">Cycle length</span>
                  <span className="tile-value">
                    {cycle.avgCycle}
                    <small> days</small>
                  </span>
                </div>
                <div className="tile">
                  <span className="tile-label">Period length</span>
                  <span className="tile-value">
                    {cycle.avgPeriodLen}
                    <small> days</small>
                  </span>
                </div>
                {cycle.nextStart && (
                  <div className="tile">
                    <span className="tile-label">Next period</span>
                    <span className="tile-value">{formatDayShort(cycle.nextStart)}</span>
                  </div>
                )}
                {phase && (
                  <div className="tile">
                    <span className="tile-label">Today</span>
                    <span className="tile-value">
                      Day {phase.day}
                      {phase.key !== 'overdue' && <small> {phase.label}</small>}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <InjuriesCard />
        </section>

        <GearCard sessions={sessions} onSaved={showFlash} />

        <HrZonesCard onSaved={showFlash} />

        <section className="card settings-card stack">
          <button
            type="button"
            className="btn btn-secondary btn-block settings-link-row"
            onClick={() => navigate('/settings')}
          >
            <span>⚙️ App settings</span>
            <span className="settings-link-arrow">›</span>
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={signOut}>
            Sign out
          </button>
        </section>
      </main>

      {flash && <div className="toast">{flash}</div>}
    </div>
  )
}

const personName = (c) => c.profile?.display_name || c.profile?.email || 'Someone'
const EMPTY_COACH = { coaches: [], requests: [], athletes: [] }

// Everyone you're connected with, side by side: friends on the left, coaches on
// the right. Both used to live behind the Friends tab - the profile is a more
// natural home. The two sides load together so the whole card refreshes as one.
function PeopleCard() {
  const [data, setData] = useState(null)

  const load = () =>
    Promise.all([
      loadConnections().catch(() => ({ friends: [], incoming: [], outgoing: [] })),
      // Best-effort: coaches.sql may not be applied on older setups.
      loadCoachLinks().catch(() => EMPTY_COACH),
    ]).then(([conn, coach]) => setData({ ...conn, coach }))

  useEffect(() => {
    load()
  }, [])

  return (
    <section className="card people-card">
      {!data ? (
        <div className="splash inline">
          <div className="spinner" />
        </div>
      ) : (
        <div className="people-grid">
          <FriendColumn data={data} reload={load} />
          <CoachColumn data={data} reload={load} />
        </div>
      )}
    </section>
  )
}

// Left column: friends, requests waiting on you, and adding one by email.
function FriendColumn({ data, reload }) {
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const friends = data.friends || []
  const incoming = data.incoming || []
  const outgoing = data.outgoing || []

  const act = async (fn) => {
    await fn()
    reload()
  }

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await sendRequest(email)
      const messages = {
        ok: { ok: true, text: 'Request sent!' },
        not_found: { ok: false, text: 'No account with that email.' },
        self: { ok: false, text: "That's you 🙂" },
        exists: { ok: false, text: 'Already connected or pending.' },
      }
      setMsg(messages[res] || { ok: false, text: 'Could not send.' })
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

  const removeF = (c) => {
    if (!window.confirm(`Remove ${personName(c)} as a friend?`)) return
    act(() => removeFriend(c.id))
  }

  const empty = !friends.length && !incoming.length && !outgoing.length

  return (
    <div className="people-col">
      <div className="people-head">
        <span className="people-title">
          Friends
          {friends.length > 0 && <span className="friends-count">{friends.length}</span>}
        </span>
        <button
          type="button"
          className={`people-add-btn ${adding ? 'is-open' : ''}`}
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? 'Close' : 'Add a friend'}
          title={adding ? 'Close' : 'Add a friend'}
        >
          {adding ? '×' : '+'}
        </button>
      </div>

      {adding && (
        <div className="people-add">
          <input
            type="email"
            value={email}
            placeholder="friend@email.com"
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn btn-primary btn-sm btn-block" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
          {msg && <p className={msg.ok ? 'auth-notice' : 'auth-error'}>{msg.text}</p>}
        </div>
      )}

      {incoming.length > 0 && (
        <div className="people-group">
          <span className="field-label">
            Requests <span className="pill-badge">{incoming.length}</span>
          </span>
          {incoming.map((c) => (
            <div className="person" key={c.id}>
              <div className="person-row">
                <Avatar name={personName(c)} size={30} />
                <span className="person-name">{personName(c)}</span>
              </div>
              <div className="person-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => act(() => respondRequest(c.id, true))}
                >
                  Accept
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => act(() => respondRequest(c.id, false))}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friends.length > 0 && (
        <div className="people-group">
          {friends.map((c) => (
            <div className="person-row" key={c.id}>
              <Avatar name={personName(c)} size={30} />
              <span className="person-name">{personName(c)}</span>
              <button
                type="button"
                className="person-x"
                aria-label={`Remove ${personName(c)}`}
                title="Remove friend"
                onClick={() => removeF(c)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="people-group">
          <span className="field-label">Pending</span>
          {outgoing.map((c) => (
            <div className="person-row is-pending" key={c.id}>
              <Avatar name={personName(c)} size={30} />
              <span className="person-name">{personName(c)}</span>
            </div>
          ))}
        </div>
      )}

      {empty && !adding && (
        <p className="muted small">No friends yet. Tap + to add one by email.</p>
      )}
    </div>
  )
}

// Right column: your coaches, athletes you coach, coaching requests, and
// inviting a coach by email. A coach gets read-only access to your whole
// account (see lib/coaches).
function CoachColumn({ data, reload }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const coach = data.coach || EMPTY_COACH

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
        ok: { ok: true, text: 'Invite sent. They must accept.' },
        not_found: { ok: false, text: 'No account with that email.' },
        self: { ok: false, text: "That's you 🙂" },
        exists: { ok: false, text: 'Already your coach or invited.' },
      }
      setMsg(messages[res] || { ok: false, text: 'Could not send.' })
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

  const removeC = (c) => {
    if (!window.confirm(`Remove ${personName(c)}?`)) return
    act(() => removeCoachLink(c.id))
  }

  const empty = !coach.coaches.length && !coach.requests.length && !coach.athletes.length

  return (
    <div className="people-col">
      <div className="people-head">
        <span className="people-title">Coach</span>
        <button
          type="button"
          className={`people-add-btn ${adding ? 'is-open' : ''}`}
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? 'Close' : 'Invite a coach'}
          title={adding ? 'Close' : 'Invite a coach'}
        >
          {adding ? '×' : '+'}
        </button>
      </div>

      {adding && (
        <div className="people-add">
          <input
            type="email"
            value={email}
            placeholder="coach@email.com"
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn btn-primary btn-sm btn-block" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : 'Invite coach'}
          </button>
          {msg && <p className={msg.ok ? 'auth-notice' : 'auth-error'}>{msg.text}</p>}
          <p className="muted small">A coach sees everything in your account, read-only.</p>
        </div>
      )}

      {coach.requests.length > 0 && (
        <div className="people-group">
          <span className="field-label">
            Requests <span className="pill-badge">{coach.requests.length}</span>
          </span>
          {coach.requests.map((c) => (
            <div className="person" key={c.id}>
              <div className="person-row">
                <Avatar name={personName(c)} size={30} />
                <span className="person-name">{personName(c)}</span>
              </div>
              <span className="muted xsmall">wants you to coach them</span>
              <div className="person-actions">
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
              </div>
            </div>
          ))}
        </div>
      )}

      {coach.athletes.length > 0 && (
        <div className="people-group">
          <span className="field-label">You coach</span>
          {coach.athletes.map((c) => (
            <button
              type="button"
              className="person-row person-tappable"
              key={c.id}
              onClick={() => navigate(`/athlete/${c.otherId}`)}
            >
              <Avatar name={personName(c)} size={30} />
              <span className="person-name">
                {personName(c)}
                {c.sharesSignals && <span className="muted small"> · sharing signals</span>}
              </span>
              <span className="person-chevron">›</span>
            </button>
          ))}
          {coach.athletes.some((c) => c.sharesSignals) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-block settings-link-row"
              onClick={() => navigate('/squad')}
            >
              <span>🩺 Squad, this week</span>
              <span className="settings-link-arrow">›</span>
            </button>
          )}
        </div>
      )}

      {coach.coaches.length > 0 && (
        <div className="people-group">
          <span className="field-label">Your coaches</span>
          {coach.coaches.map((c) => (
            <div className="person-row-stack" key={c.id}>
              <div className="person-row">
                <Avatar name={personName(c)} size={30} />
                <span className="person-name">
                  {personName(c)}
                  {c.status === 'pending' && <span className="muted small"> · pending</span>}
                </span>
                <button
                  type="button"
                  className="person-x"
                  aria-label={`Remove ${personName(c)}`}
                  title="Remove"
                  onClick={() => removeC(c)}
                >
                  ✕
                </button>
              </div>
              {/* A separate, revocable grant from the session access the link
                  itself carries. They get the derived numbers and your weekly
                  overuse answers, never your daily check-in entries or notes. */}
              {c.status === 'accepted' && (
                <label className="toggle-row">
                  <span className="toggle-label">
                    <span className="toggle-emoji">🩺</span>
                    Share my signals and overuse answers
                  </span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={!!c.sharesSignals}
                      onChange={() => act(() => setSignalSharing(c.id, !c.sharesSignals))}
                    />
                    <span className="switch-track" />
                    <span className="switch-thumb" />
                  </span>
                </label>
              )}
            </div>
          ))}
          <p className="muted small">
            Sharing signals shows a coach your readiness and finger-load state and your weekly
            overuse answers. It never shows your daily sleep, fatigue, soreness or stress
            entries, or anything you typed in a note. You can turn it off at any time.
          </p>
        </div>
      )}

      {empty && !adding && (
        <p className="muted small">No coach yet. Tap + to invite one by email.</p>
      )}
    </div>
  )
}

// Gear, unlocked per sport in Settings. Each sport lists its equipment
// (bikes, shoe pairs) - one is "main" and absorbs every session that doesn't
// name an item. Tapping an item opens its maintenance table: wear since each
// latest event, a "↻ Today" to log the same work done today, chips + free
// text + date to log anything else (or back-log with an earlier date).
function GearCard({ sessions, onSaved }) {
  const gearSports = getGearSports()
  const [items, setItems] = useState(null) // null = loading
  const [events, setEvents] = useState(null)
  const [loadErr, setLoadErr] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () =>
    Promise.all([fetchGearItems(), fetchGearEvents()])
      .then(([its, evs]) => {
        setItems(its)
        setEvents(evs)
        setLoadErr(false)
      })
      .catch(() => {
        setItems([])
        setEvents([])
        setLoadErr(true)
      })

  useEffect(() => {
    if (getGearSports().length) load()
  }, [])

  if (!gearSports.length) return null

  const act = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await load()
      onSaved()
    } catch {
      setLoadErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card settings-card stack">
      <h2 className="step-q">Gear</h2>
      {loadErr && (
        <p className="auth-error">
          Couldn’t load gear. Have the migrations been applied?
        </p>
      )}
      {gearSports.map((sport) => (
        <GearSportBlock
          key={sport}
          sport={sport}
          items={(items || []).filter((i) => i.sport === sport)}
          events={events || []}
          sessions={sessions}
          ready={items !== null}
          busy={busy}
          act={act}
        />
      ))}
    </section>
  )
}

function GearSportBlock({ sport, items, events, sessions, ready, busy, act }) {
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(todayISO())
  const meta = SPORTS[sport]
  const noun = GEAR_NOUN[sport]

  // Tap selects; main (or the only item) is open by default.
  const main = items.find((i) => i.is_main)
  const selected = items.find((i) => i.id === selectedId) || main || items[0] || null
  const rows = selected ? gearStatus(events, sessions, selected, items) : []

  const addItem = () =>
    act(async () => {
      // The first bike / pair automatically becomes the main one.
      await addGearItem(sport, name, items.length === 0)
      setName('')
      setAdding(false)
    })

  const removeItem = (item) => {
    if (!window.confirm(`Delete ${item.name} and its maintenance log?`)) return
    act(() => deleteGearItem(item.id))
  }

  const logEvent = () =>
    act(async () => {
      await addGearEvent(sport, label, date, selected.id)
      setLabel('')
      setDate(todayISO())
    })

  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="field-label">
        {meta.emoji} {meta.label}
      </span>

      {ready && items.length === 0 && (
        <p className="muted small">
          Add your {noun} first, then log maintenance on it and see the wear
          since. Sessions count toward your main {noun} unless a session says
          otherwise.
        </p>
      )}

      {items.length > 0 && (
        <div className="gear-items">
          {items.map((item) => (
            <div
              key={item.id}
              className={`gear-item ${selected?.id === item.id ? 'is-selected' : ''}`}
            >
              <button
                type="button"
                className="gear-item-tap"
                onClick={() => setSelectedId(item.id)}
              >
                <span className="gear-item-name">
                  {item.name}
                  {item.is_main && <span className="gear-main-badge">main</span>}
                </span>
                <span className="muted small">
                  {formatWear(itemTotalWear(sessions, item, items), sport)} total
                </span>
              </button>
              {!item.is_main && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => act(() => setMainGearItem(sport, item.id))}
                >
                  Make main
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${item.name}`}
                disabled={busy}
                onClick={() => removeItem(item)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="wr-row">
          <input
            type="text"
            value={name}
            maxLength={60}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder={sport === 'cycling' ? 'e.g. Canyon Ultimate' : 'e.g. Scarpa Instinct'}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: '0 0 auto' }}
            disabled={!name.trim() || busy}
            onClick={addItem}
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setAdding(true)}
        >
          + Add {noun}
        </button>
      )}

      {selected && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="muted small gear-table-title">
            Maintenance · {selected.name}
          </span>

          {rows.length > 0 && (
            <div className="gear-table">
              {rows.map((r) => (
                <div className="gear-row" key={r.id}>
                  <span className="gear-cell">
                    <span className="gear-label">{r.label}</span>
                    <span className="muted small">since {formatDayShort(r.date)}</span>
                  </span>
                  <span className="gear-wear">{formatWear(r.value, sport)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Done again today - resets the counter"
                    disabled={busy}
                    onClick={() => act(() => addGearEvent(sport, r.label, todayISO(), selected.id))}
                  >
                    ↻ Today
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete latest ${r.label}`}
                    disabled={busy}
                    onClick={() => act(() => deleteGearEvent(r.id))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {ready && rows.length === 0 && (
            <p className="muted small">
              Nothing logged for {selected.name} yet. Log when something was
              last replaced or serviced, and the wear since shows here.
            </p>
          )}

          <div className="chips">
            {GEAR_SUGGESTIONS[sport].map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${label === s ? 'is-active' : ''}`}
                onClick={() => setLabel(label === s ? '' : s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="wr-row">
            <input
              type="text"
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                sport === 'cycling'
                  ? 'e.g. New front tire'
                  : sport === 'climbing'
                    ? 'e.g. Resoled'
                    : 'e.g. New insoles'
              }
            />
          </div>
          <div className="wr-row">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ flex: '0 0 160px' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={!label.trim() || !date || busy}
              onClick={logEvent}
            >
              + Log
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Heart rate zone editor: set a max HR to get the standard zones, then adjust
// any boundary by hand; 5 or 7 zones. Local display prefs (see lib/prefs) -
// session analysis re-buckets the recorded HR stream with these zones, and
// falls back to intervals.icu's zones when nothing is set here.
function HrZonesCard({ onSaved }) {
  const [useIcu, setUseIcuState] = useState(getUseIcuZones)
  const [count, setCountState] = useState(getHrZoneCount)
  const [maxHr, setMaxHrInput] = useState(() => (getMaxHr() ? String(getMaxHr()) : ''))
  const [rev, setRev] = useState(0) // bumped after each commit to re-read prefs

  const custom = getCustomHrCeilings(count)
  const resolved = custom ?? standardHrCeilings(count, getMaxHr())
  // Drafts of the editable ceilings (strings while typing); re-synced from the
  // committed prefs whenever those change.
  const [draft, setDraft] = useState(() => (resolved ? resolved.map(String) : null))
  useEffect(() => {
    setDraft(resolved ? resolved.map(String) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, rev])

  const toggleUseIcu = () => {
    setUseIcuState((prev) => {
      setUseIcuZones(!prev)
      return !prev
    })
    setRev((r) => r + 1)
    onSaved()
  }

  const commitMaxHr = () => {
    const v = Number(maxHr)
    const next = Number.isFinite(v) && v > 0 ? Math.round(v) : null
    if (next === getMaxHr()) return
    setMaxHr(next)
    setMaxHrInput(next ? String(next) : '')
    setRev((r) => r + 1)
    onSaved()
  }

  const chooseCount = (v) => {
    const n = Number(v)
    setHrZoneCount(n)
    setCountState(n)
    setRev((r) => r + 1)
    onSaved()
  }

  const editCeiling = (i, val) =>
    setDraft((d) => d.map((s, j) => (j === i ? val : s)))

  // All ceilings save together on blur; anything non-numeric or out of order
  // simply reverts to the last saved state.
  const commitCeilings = () => {
    const arr = draft.map((s) => Math.round(Number(s)))
    if (resolved && arr.every((v, i) => v === resolved[i])) return
    const ok = arr.every((v, i) => Number.isFinite(v) && v > 0 && (i === 0 || v > arr[i - 1]))
    if (!ok) {
      setDraft(resolved ? resolved.map(String) : null)
      return
    }
    setCustomHrCeilings(count, arr)
    setRev((r) => r + 1)
    onSaved()
  }

  const resetToStandard = () => {
    setCustomHrCeilings(count, null)
    setRev((r) => r + 1)
    onSaved('Standard zones')
  }

  // Lower bound shown for a zone row: one above the previous zone's ceiling.
  const floorOf = (i) => {
    const v = Number(draft[i - 1])
    return Number.isFinite(v) && v > 0 ? `${v + 1}–` : '–'
  }

  const pcts =
    count === 5 ? '60 · 70 · 80 · 90% of max' : '65 · 75 · 82 · 89 · 94 · 97% of max'

  return (
    <section className="card settings-card stack">
      <h2 className="step-q">Heart rate zones</h2>
      <div className="toggle-list">
        <label className="toggle-row">
          <span className="toggle-label">Use intervals.icu zones</span>
          <span className="switch">
            <input type="checkbox" checked={useIcu} onChange={toggleUseIcu} />
            <span className="switch-track" />
            <span className="switch-thumb" />
          </span>
        </label>
      </div>

      {useIcu ? (
        <p className="muted small">
          “Time in zones” shows the zones exactly as set up on intervals.icu:
          5 or 7, whatever you use there. Turn this off to define your own
          zones instead.
        </p>
      ) : (
        <>
      <Field label="Max heart rate" hint="The standard zone boundaries are computed from this.">
        <div className="input-suffix">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={maxHr}
            onChange={(e) => setMaxHrInput(e.target.value)}
            onBlur={commitMaxHr}
            placeholder="e.g. 190"
          />
          <span className="suffix">bpm</span>
        </div>
      </Field>
      <Field label="Zones">
        <Segmented
          options={[
            { key: '5', label: '5 zones' },
            { key: '7', label: '7 zones' },
          ]}
          value={String(count)}
          onChange={chooseCount}
          columns={2}
        />
      </Field>

      {draft ? (
        <div className="stack" style={{ gap: 6 }}>
          {draft.map((val, i) => (
            <div className="hrz-row" key={i}>
              <span className="hrz-dot" style={{ background: ZONE_COLORS[i] }} />
              <span className="hrz-label">Z{i + 1}</span>
              <span className="hrz-from muted small">{i === 0 ? 'up to' : floorOf(i)}</span>
              <input
                className="hrz-input"
                type="number"
                inputMode="numeric"
                value={val}
                onChange={(e) => editCeiling(i, e.target.value)}
                onBlur={commitCeilings}
              />
              <span className="muted small">bpm</span>
            </div>
          ))}
          <div className="hrz-row">
            <span className="hrz-dot" style={{ background: ZONE_COLORS[count - 1] }} />
            <span className="hrz-label">Z{count}</span>
            <span className="hrz-from muted small">
              above {Number(draft[draft.length - 1]) || '…'} bpm
            </span>
          </div>
          {custom && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetToStandard}>
              Reset to standard ({pcts})
            </button>
          )}
        </div>
      ) : (
        <p className="muted small">
          Set your max heart rate to get the standard zones ({pcts}), then
          adjust any boundary.
        </p>
      )}

      <p className="muted small">
        Used for “Time in zones” on a session’s analysis.
      </p>
        </>
      )}
    </section>
  )
}

// Injury log: note + start date; "Healed" stamps the end date, ✕ deletes.
// Data is owner-only (see supabase/migrations/20260101000500_health.sql). Includes a small stats row so
// the injury history reads at a glance.
function InjuriesCard() {
  const [injuries, setInjuries] = useState(null) // null = loading
  const [loadErr, setLoadErr] = useState(false)
  const [note, setNote] = useState('')
  const [region, setRegion] = useState('')
  const [started, setStarted] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const load = () =>
    fetchInjuries()
      .then((rows) => {
        setInjuries(rows)
        setLoadErr(false)
      })
      .catch(() => {
        setInjuries([])
        setLoadErr(true)
      })

  useEffect(() => {
    load()
  }, [])

  const act = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch {
      setLoadErr(true)
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    act(async () => {
      await addInjury(note, started, region)
      setNote('')
      setRegion('')
      setStarted(todayISO())
    })

  const active = (injuries || []).filter((i) => !i.ended)
  const healed = (injuries || []).filter((i) => i.ended)
  // Injured days this calendar year, across all logged injuries.
  const year = String(new Date().getFullYear())
  const daysThisYear = [...injuryDays(injuries || []).keys()].filter((d) =>
    d.startsWith(year),
  ).length

  return (
    <div className="stack">
      <span className="field-label">Injuries</span>
      {loadErr && (
        <p className="auth-error">
          Couldn’t load injuries. Have the migrations been applied?
        </p>
      )}

      {injuries !== null && injuries.length > 0 && (
        <div className="tile-grid tile-grid-compact">
          <div className="tile">
            <span className="tile-label">Active</span>
            <span className="tile-value">{active.length}</span>
          </div>
          <div className="tile">
            <span className="tile-label">Healed</span>
            <span className="tile-value">{healed.length}</span>
          </div>
          <div className="tile">
            <span className="tile-label">Days this year</span>
            <span className="tile-value">{daysThisYear}</span>
          </div>
        </div>
      )}

      {injuries !== null && injuries.length === 0 && !loadErr && (
        <p className="muted small">No injuries logged. 🤞</p>
      )}

      {active.length > 0 && (
        <div className="toggle-list">
          {active.map((i) => (
            <div className="injury-row" key={i.id}>
              <span className="injury-main">
                <span className="injury-note">{i.note}</span>
                <span className="muted small">
                  {i.region ? `${areaLabel(i.region)} · ` : ''}since {formatDayShort(i.started)} · active
                </span>
              </span>
              <span className="injury-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => act(() => endInjury(i.id))}
                >
                  Healed
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Delete injury"
                  disabled={busy}
                  onClick={() => act(() => deleteInjury(i.id))}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {healed.length > 0 && (
        <div className="toggle-list">
          {healed.map((i) => (
            <div className="injury-row" key={i.id}>
              <span className="injury-main">
                <span className="injury-note muted">{i.note}</span>
                <span className="muted small">
                  {formatDayShort(i.started)} – {formatDayShort(i.ended)} · healed
                </span>
              </span>
              <span className="injury-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Delete injury"
                  disabled={busy}
                  onClick={() => act(() => deleteInjury(i.id))}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Field label="Log an injury" optional>
        <div className="stack" style={{ gap: 8 }}>
          <input
            type="text"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. A2 pulley, right ring finger"
          />
          {/* Region lets the training coach route around the affected
              structure instead of guessing: prescribing antagonist work,
              which is mostly shoulder and push, is the worst possible answer
              to a shoulder injury. */}
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Which part? (optional)</option>
            {BODY_AREAS.map((a) => (
              <option key={a.key} value={a.key}>{a.emoji} {a.label}</option>
            ))}
          </select>
          <div className="wr-row">
            <input
              type="date"
              value={started}
              onChange={(e) => setStarted(e.target.value)}
              style={{ flex: '0 0 160px' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={!note.trim() || !started || busy}
              onClick={add}
            >
              + Add
            </button>
          </div>
        </div>
      </Field>
    </div>
  )
}
