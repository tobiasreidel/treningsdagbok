import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Field } from '../components/ui'
import Avatar from '../components/Avatar'
import { SettingsIcon, PencilIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { getMyProfile, setDisplayName } from '../lib/friends'
import { getAvatarUrl, uploadAvatar, removeAvatar } from '../lib/profile'
import { fetchSessions } from '../lib/sessions'
import { sumHours, currentWeekStreak, round1 } from '../lib/stats'
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
import { getLogPeriod, getAvatarEmoji, setAvatarEmoji } from '../lib/prefs'

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
      .then((rows) =>
        setLifetime({
          count: rows.length,
          hours: round1(sumHours(rows)),
          streak: currentWeekStreak(rows),
        }),
      )
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

// Injury log: note + start date; "Healed" stamps the end date, ✕ deletes.
// Data is owner-only (see supabase/health.sql). Includes a small stats row so
// the injury history reads at a glance.
function InjuriesCard() {
  const [injuries, setInjuries] = useState(null) // null = loading
  const [loadErr, setLoadErr] = useState(false)
  const [note, setNote] = useState('')
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
      await addInjury(note, started)
      setNote('')
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
          Couldn’t load injuries. Has supabase/health.sql been run?
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
                <span className="muted small">since {formatDayShort(i.started)} · active</span>
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
