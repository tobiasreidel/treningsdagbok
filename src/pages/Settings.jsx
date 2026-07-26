import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Segmented } from '../components/ui'
import { SPORTS } from '../lib/constants'
import { getSettings, saveSettings, fetchActivities, activitySport } from '../lib/intervals'
import { getShareSetting, setShareSetting } from '../lib/friends'
import { fetchSessions } from '../lib/sessions'
import { backfillSharedAnalyses } from '../lib/streams'
import { sendFeedback } from '../lib/feedback'
import { deleteAccount } from '../lib/account'
import { downloadCsv, downloadJson } from '../lib/exportData'
import { THEMES, getTheme, setTheme } from '../lib/theme'
import { useAuth } from '../context/AuthContext'
import {
  getHideRidesUnderKm,
  setHideRidesUnderKm,
  getEnabledSports,
  setEnabledSports,
  getLogPeriod,
  setLogPeriod,
  getGearSports,
  setGearSports,
  getCoachEnabled,
  setCoachEnabled,
  GEAR_SPORTS,
  ALL_SPORTS,
} from '../lib/prefs'

// What the per-sport gear toggle promises, in that sport's own vocabulary.
const GEAR_TOGGLE_LABELS = {
  cycling: 'Log bike maintenance',
  running: 'Log running shoes',
  climbing: 'Log climbing wear',
}

const DELETE_CONFIRM_WORD = 'DELETE'

export default function Settings() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [exporting, setExporting] = useState(null)
  const [exportNote, setExportNote] = useState(null)
  const [athleteId, setAthleteId] = useState('')
  const [apiKey, setApiKey] = useState('') // only holds a newly-typed key
  const [savedKey, setSavedKey] = useState('') // existing key, never bound to a field
  const [replacing, setReplacing] = useState(false) // user chose to enter a new key
  const [hideKm, setHideKm] = useState(() => {
    const v = getHideRidesUnderKm()
    return v > 0 ? String(v) : ''
  })
  const [enabledSports, setEnabledSportsState] = useState(getEnabledSports)
  const [logPeriod, setLogPeriodState] = useState(getLogPeriod)
  const [coach, setCoachState] = useState(getCoachEnabled)
  const [gearSports, setGearSportsState] = useState(getGearSports)
  const [share, setShare] = useState(true)
  const [theme, setThemeState] = useState(getTheme)
  const [loading, setLoading] = useState(true)
  const [test, setTest] = useState(null)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null) // transient "Saved" confirmation
  // Last-persisted values, so a blur with no change doesn't re-hit the server.
  const savedHideKm = useRef('')
  const savedAthleteId = useRef('')
  const flashTimer = useRef()
  // Bug report / feature request widget (bottom of the page).
  const [fbType, setFbType] = useState('bug')
  const [fbMessage, setFbMessage] = useState('')
  const [fb, setFb] = useState(null) // { pending } | { ok, msg } | { error, msg }
  // Sharing chart data for older activities. Runs by itself whenever
  // "Friends can see" is on - the whole point of that setting is that friends
  // can see, and a button they'd have to know to press doesn't deliver it.
  // { running, done, total, msg }
  const [backfill, setBackfill] = useState(null)
  const stopBackfill = useRef(false)
  const backfillStarted = useRef(false)
  // Delete-account danger zone: hidden behind a reveal + typed confirmation
  // so it can't be triggered by a stray tap.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // The key to actually use/save: a freshly-typed one when replacing (or when
  // none is stored yet), otherwise the existing key left untouched.
  const keyToUse = replacing || !savedKey ? apiKey.trim() : savedKey

  useEffect(() => {
    Promise.all([getSettings(), getShareSetting().catch(() => true)])
      .then(([s, shareVal]) => {
        setAthleteId(s.athleteId)
        setSavedKey(s.apiKey)
        setShare(shareVal)
        savedAthleteId.current = s.athleteId
        savedHideKm.current = hideKm
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => clearTimeout(flashTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Briefly show a "Saved" pill. Settings auto-save, so this is the only
  // feedback that a change stuck.
  const showFlash = (msg = 'Saved') => {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1600)
  }

  // Sport toggles persist immediately (local pref) - independent of Save.
  const toggleSport = (key) => {
    setEnabledSportsState((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      // Keep at least one sport enabled.
      const result = next.length ? next : prev
      setEnabledSports(result)
      return result
    })
  }

  // Theme applies live (and persists) the moment it's tapped - no Save needed.
  const chooseTheme = (key) => setThemeState(setTheme(key))

  const toggleLogPeriod = () => {
    setLogPeriodState((prev) => {
      setLogPeriod(!prev)
      return !prev
    })
    showFlash()
  }

  const toggleCoach = () => {
    setCoachState((prev) => {
      setCoachEnabled(!prev)
      return !prev
    })
    showFlash()
  }

  const toggleGearSport = (key) => {
    setGearSportsState((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      setGearSports(next)
      return next
    })
    showFlash()
  }

  const runBackfill = async () => {
    stopBackfill.current = false
    setBackfill({ running: true, done: 0, total: null })
    try {
      const sessions = await fetchSessions()
      const res = await backfillSharedAnalyses(sessions, {
        onProgress: (p) => setBackfill({ running: true, ...p }),
        shouldStop: () => stopBackfill.current,
      })
      // Nothing to do is the normal steady state - stay quiet about it.
      setBackfill(
        res.shared > 0
          ? {
              running: false,
              msg: `Charts shared for ${res.shared} activit${res.shared === 1 ? 'y' : 'ies'}.`,
            }
          : null,
      )
    } catch (err) {
      setBackfill({
        running: false,
        msg: err?.code === 'no-table'
          ? 'Sharing isn’t set up yet — run supabase/session_streams.sql.'
          : err.message || 'Could not share activities.',
      })
    }
  }

  // Share charts for anything not shared yet, whenever "Friends can see" is
  // on. Cheap when there's nothing to do: one query, then it stops.
  useEffect(() => {
    if (loading || !share || backfillStarted.current) return undefined
    backfillStarted.current = true
    runBackfill()
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, share])

  // Leaving the page stops an in-flight run; it picks up where it left off
  // next time, since shared activities are skipped.
  useEffect(() => () => {
    stopBackfill.current = true
  }, [])

  const commitShare = (v) => {
    setShare(v)
    setShareSetting(v).catch(() => {})
    if (!v) {
      // Going private: stop sharing work immediately, and arm it to run again
      // if they turn it back on.
      stopBackfill.current = true
      backfillStarted.current = false
      setBackfill(null)
    }
    showFlash()
  }

  const submitFeedback = async () => {
    const msg = fbMessage.trim()
    if (!msg) return
    setFb({ pending: true })
    try {
      await sendFeedback(fbType, msg)
      setFb({ ok: true, msg: 'Thanks, sent! 🙌' })
      setFbMessage('')
    } catch (err) {
      setFb({ error: true, msg: err.message || 'Could not send.' })
    }
  }

  const cancelDelete = () => {
    setConfirmingDelete(false)
    setDeleteText('')
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (deleteText.trim() !== DELETE_CONFIRM_WORD) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
      await signOut()
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(err.message || 'Could not delete account')
      setDeleting(false)
    }
  }

  const runExport = async (kind) => {
    setExporting(kind)
    setExportNote(null)
    try {
      const n = kind === 'csv' ? await downloadCsv() : await downloadJson()
      setExportNote(`Saved ${n} session${n === 1 ? '' : 's'} to your downloads.`)
    } catch (err) {
      setExportNote(err.message || 'Could not build the export.')
    }
    setExporting(null)
  }

  const testConnection = async () => {
    setTest({ pending: true })
    try {
      const acts = await fetchActivities({ athleteId, apiKey: keyToUse, sinceDays: 60 })
      const counts = { cycling: 0, running: 0, swimming: 0, climbing: 0 }
      for (const a of acts) counts[activitySport(a)] += 1
      const word = { cycling: 'ride', running: 'run', swimming: 'swim', climbing: 'climb' }
      const parts = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${word[k]}${n === 1 ? '' : 's'}`)
      setTest({
        ok: true,
        msg: parts.length
          ? `Connected. Found ${parts.join(' · ')} in the last 60 days.`
          : 'Connected. No importable activities in the last 60 days.',
      })
    } catch (err) {
      setTest({ ok: false, msg: err.message })
    }
  }

  // ---- auto-save -----------------------------------------------------------
  // Each field persists on its own: text inputs on blur (so we don't write a
  // character at a time).
  const commitHideKm = () => {
    if (hideKm === savedHideKm.current) return
    savedHideKm.current = hideKm
    setHideRidesUnderKm(hideKm)
    showFlash()
  }

  // Athlete id + API key live in one row, so they save together.
  const commitIntervals = async () => {
    const keyChanged = (replacing || !savedKey) && apiKey.trim() && apiKey.trim() !== savedKey
    const athleteChanged = athleteId !== savedAthleteId.current
    if (!keyChanged && !athleteChanged) return
    setError(null)
    try {
      await saveSettings({ athleteId, apiKey: keyToUse })
      savedAthleteId.current = athleteId
      if (keyChanged) {
        setSavedKey(apiKey.trim())
        setReplacing(false)
        setApiKey('')
      }
      showFlash()
    } catch (err) {
      setError(err.message || 'Could not save')
    }
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Settings</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <button
          type="button"
          className="btn btn-secondary btn-block settings-link-row"
          onClick={() => navigate('/profile')}
        >
          <span>👤 Profile &amp; health</span>
          <span className="settings-link-arrow">›</span>
        </button>

        <section className="card settings-card stack">
          <h2 className="step-q">Appearance</h2>
          <p className="muted small">Pick a colour theme. Applies instantly.</p>
          <ThemePicker value={theme} onChange={chooseTheme} />
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Sports</h2>
          <p className="muted small">
            Choose which sports you track. Turning one off hides it from logging,
            cards and stats. Your past sessions are kept and still show in the
            calendar.
          </p>
          <div className="toggle-list">
            {ALL_SPORTS.map((key) => {
              const sport = SPORTS[key]
              const on = enabledSports.includes(key)
              const isLastOn = on && enabledSports.length === 1
              return (
                <label className="toggle-row" key={key}>
                  <span className="toggle-label">
                    <span className="toggle-emoji">{sport.emoji}</span>
                    {sport.label}
                  </span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={isLastOn}
                      onChange={() => toggleSport(key)}
                    />
                    <span className="switch-track" />
                    <span className="switch-thumb" />
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Health</h2>
          <div className="toggle-list">
            <label className="toggle-row">
              <span className="toggle-label">
                <span className="toggle-emoji">🩸</span>
                Log period
              </span>
              <span className="switch">
                <input type="checkbox" checked={logPeriod} onChange={toggleLogPeriod} />
                <span className="switch-track" />
                <span className="switch-thumb" />
              </span>
            </label>
          </div>
          <p className="muted small">
            Log period days by tapping a day in the dashboard calendar. Cycle
            stats show on your profile. Only you can ever see this, never
            friends or coaches.
          </p>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">
            Training coach <span className="beta-tag">beta</span>
          </h2>
          <div className="toggle-list">
            <label className="toggle-row">
              <span className="toggle-label">
                <span className="toggle-emoji">🧭</span>
                Suggest today’s session
              </span>
              <span className="switch">
                <input type="checkbox" checked={coach} onChange={toggleCoach} />
                <span className="switch-track" />
                <span className="switch-thumb" />
              </span>
            </label>
          </div>
          <p className="muted small">
            Adds a card to your dashboard: a finger-tissue recovery status (days
            since your last hard finger session, from the ~48–72 h collagen
            rebuild window), a readiness score, a load trend and a suggested
            session — all read from what you already log.
          </p>
          <p className="muted small">
            Still beta: the thresholds are educated starting points, not settled
            science. It’s a training-awareness aid, not medical advice, and it
            deliberately never gives you an injury-risk number.
          </p>
          {coach && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-block settings-link-row"
                onClick={() => navigate('/coach')}
              >
                <span>🧭 Open the coach</span>
                <span className="settings-link-arrow">›</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block settings-link-row"
                onClick={() => navigate('/checkin')}
              >
                <span>📋 Daily check-in</span>
                <span className="settings-link-arrow">›</span>
              </button>
            </>
          )}
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Gear</h2>
          <p className="muted small">
            Track wear and maintenance — new tires, chain oiling, shoe resoles.
            Turn it on per sport; logging lives on your profile.
          </p>
          <div className="toggle-list">
            {GEAR_SPORTS.filter((k) => enabledSports.includes(k)).map((key) => {
              const sport = SPORTS[key]
              return (
                <label className="toggle-row" key={key}>
                  <span className="toggle-label">
                    <span className="toggle-emoji">{sport.emoji}</span>
                    {GEAR_TOGGLE_LABELS[key]}
                  </span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={gearSports.includes(key)}
                      onChange={() => toggleGearSport(key)}
                    />
                    <span className="switch-track" />
                    <span className="switch-thumb" />
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Privacy</h2>
          <Field label="Activity privacy">
            <Segmented
              options={[
                { key: 'on', label: 'Friends can see' },
                { key: 'off', label: 'Private' },
              ]}
              value={share ? 'on' : 'off'}
              onChange={(v) => commitShare(v === 'on')}
              columns={2}
            />
          </Field>

          {share && (
            <>
              {backfill?.running && (
                <p className="muted small">
                  <span className="spinner spinner-inline" /> Sharing charts with
                  friends
                  {backfill.total ? ` · ${backfill.done} / ${backfill.total}` : '…'}
                </p>
              )}
              {backfill?.msg && !backfill.running && (
                <p className="muted small">{backfill.msg}</p>
              )}
              <p className="muted small">
                Friends can’t read your activities from intervals.icu, so a copy
                of each activity’s charts is shared for them — automatically,
                while this is on. Your route is never shared, only the charts,
                zones and laps.
              </p>
            </>
          )}
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Dashboard</h2>
          <button
            type="button"
            className="btn btn-secondary btn-block settings-link-row"
            onClick={() => navigate('/widgets')}
          >
            <span>Customize widgets</span>
            <span className="settings-link-arrow">›</span>
          </button>
          <Field
            label="Hide short rides"
            hint="Keep short commutes out of the “Last 7 days” list. Leave blank to show all."
            optional
          >
            <div className="input-suffix">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={hideKm}
                onChange={(e) => setHideKm(e.target.value)}
                onBlur={commitHideKm}
                placeholder="e.g. 10"
              />
              <span className="suffix">km</span>
            </div>
          </Field>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Connect intervals.icu</h2>
          <p className="muted small">
            Pull your activities in automatically. Your Garmin device syncs to
            intervals.icu, and this app imports from there.
          </p>
          <Field label="API key" hint="intervals.icu → Settings → Developer Settings (bottom of the page)">
            {savedKey && !replacing ? (
              <div className="saved-key">
                <span className="saved-key-mask">Key saved · ••••{savedKey.slice(-4)}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setReplacing(true)
                    setApiKey('')
                  }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={commitIntervals}
                placeholder="your intervals.icu API key"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Athlete ID" hint="Leave blank to use your own account." optional>
            <input
              type="text"
              inputMode="numeric"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              onBlur={commitIntervals}
              placeholder="0"
            />
          </Field>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={testConnection}
            disabled={!keyToUse || test?.pending}
          >
            {test?.pending ? 'Testing…' : 'Test connection'}
          </button>
          {test && !test.pending && (
            <p className={test.ok ? 'auth-notice' : 'auth-error'}>{test.msg}</p>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => navigate('/import')}
          >
            ⬇ Import sessions from intervals.icu
          </button>
          <p className="muted small">
            Activities also import automatically each time you open the app.
          </p>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Your data</h2>
          <p className="muted small">
            Everything you have logged, in a file you keep. Worth doing now and then —
            this app is the only place your training lives.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={exporting !== null}
            onClick={() => runExport('csv')}
          >
            {exporting === 'csv' ? 'Preparing…' : '⬇ Sessions as a spreadsheet (CSV)'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={exporting !== null}
            onClick={() => runExport('json')}
          >
            {exporting === 'json' ? 'Preparing…' : '⬇ Everything, as stored (JSON)'}
          </button>
          {exportNote && <p className="muted small">{exportNote}</p>}
          <p className="muted small">
            The JSON holds your sessions, health log, check-ins, coach profile, goals,
            tests and gear. Photos aren’t included — they stay in storage. Your
            intervals.icu key is left out on purpose.
          </p>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">About</h2>
          <button
            type="button"
            className="btn btn-secondary btn-block settings-link-row"
            onClick={() => navigate('/changelog')}
          >
            <span>✨ What’s new</span>
            <span className="settings-link-arrow">›</span>
          </button>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Feedback</h2>
          <p className="muted small">
            Hit a bug or wish the app did something? Send it straight to Tobias.
          </p>
          <Segmented
            options={[
              { key: 'bug', label: '🐞 Report a bug' },
              { key: 'feature', label: '💡 Request a feature' },
            ]}
            value={fbType}
            onChange={(v) => {
              setFbType(v)
              setFb(null)
            }}
            columns={2}
          />
          <Field label={fbType === 'bug' ? 'What went wrong?' : 'What would you like?'}>
            <textarea
              rows={4}
              maxLength={2000}
              value={fbMessage}
              onChange={(e) => setFbMessage(e.target.value)}
              placeholder={
                fbType === 'bug'
                  ? 'Describe the bug: what you did and what happened…'
                  : 'Describe the feature you’d like…'
              }
            />
          </Field>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={submitFeedback}
            disabled={!fbMessage.trim() || fb?.pending}
          >
            {fb?.pending ? 'Sending…' : fbType === 'bug' ? 'Send bug report' : 'Send request'}
          </button>
          {fb && !fb.pending && (
            <p className={fb.ok ? 'auth-notice' : 'auth-error'}>{fb.msg}</p>
          )}
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Account</h2>
          <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>
            Sign out
          </button>

          {!confirmingDelete ? (
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete account
            </button>
          ) : (
            <div className="stack">
              <p className="auth-error">
                This permanently deletes your account and all your data (sessions,
                stats, friends). This cannot be undone.
              </p>
              <Field label={`Type ${DELETE_CONFIRM_WORD} to confirm`}>
                <input
                  type="text"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder={DELETE_CONFIRM_WORD}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              {deleteError && <p className="auth-error">{deleteError}</p>}
              <div className="settings-danger-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cancelDelete}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDelete}
                  disabled={deleteText.trim() !== DELETE_CONFIRM_WORD || deleting}
                >
                  {deleting ? 'Deleting…' : 'Permanently delete account'}
                </button>
              </div>
            </div>
          )}
        </section>

        {error && <p className="auth-error">{error}</p>}

        <p className="muted small settings-autosave">Changes are saved automatically.</p>
      </main>

      {flash && <div className="toast">{flash}</div>}
    </div>
  )
}

// Swatch grid for choosing a colour theme. Each tile previews the theme's
// background, a surface bar and the accent colour.
function ThemePicker({ value, onChange }) {
  return (
    <div className="theme-grid">
      {THEMES.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`theme-swatch ${value === t.key ? 'is-active' : ''}`}
          onClick={() => onChange(t.key)}
          aria-pressed={value === t.key}
        >
          <span
            className="theme-preview"
            style={{ '--sw-bg': t.bg, '--sw-surface': t.surface, '--sw-accent': t.accent }}
          >
            <span className="theme-preview-bar" />
            <span className="theme-preview-dot" />
          </span>
          <span className="theme-swatch-label">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
