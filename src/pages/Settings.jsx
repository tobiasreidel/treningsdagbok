import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Segmented } from '../components/ui'
import { getSettings, saveSettings, fetchCyclingActivities } from '../lib/intervals'
import { getMyProfile, setDisplayName, getShareSetting, setShareSetting } from '../lib/friends'
import { getHideRidesUnderKm, setHideRidesUnderKm } from '../lib/prefs'

export default function Settings() {
  const navigate = useNavigate()
  const [athleteId, setAthleteId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [displayName, setDisplayNameState] = useState('')
  const [share, setShare] = useState(true)
  const [hideKm, setHideKm] = useState(() => {
    const v = getHideRidesUnderKm()
    return v > 0 ? String(v) : ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getSettings(), getMyProfile().catch(() => ({})), getShareSetting().catch(() => true)])
      .then(([s, profile, shareVal]) => {
        setAthleteId(s.athleteId)
        setApiKey(s.apiKey)
        setDisplayNameState(profile?.display_name || '')
        setShare(shareVal)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const testConnection = async () => {
    setTest({ pending: true })
    try {
      const rides = await fetchCyclingActivities({ athleteId, apiKey, sinceDays: 60 })
      setTest({ ok: true, msg: `Connected — found ${rides.length} ride${rides.length === 1 ? '' : 's'} in the last 60 days.` })
    } catch (err) {
      setTest({ ok: false, msg: err.message })
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Profile/privacy are best-effort: they depend on friends.sql having been
      // run, and shouldn't block saving the intervals.icu connection.
      await setDisplayName(displayName).catch(() => {})
      await setShareSetting(share).catch(() => {})
      setHideRidesUnderKm(hideKm)
      await saveSettings({ athleteId, apiKey })
      navigate('/', { state: { toast: 'Settings saved' } })
    } catch (err) {
      setError(err.message || 'Could not save')
      setSaving(false)
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
        <section className="stack">
          <h2 className="step-q">Profile</h2>
          <Field label="Display name" hint="Shown to friends">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayNameState(e.target.value)}
              placeholder="Your name"
            />
          </Field>
          <Field label="Activity privacy">
            <Segmented
              options={[
                { key: 'on', label: 'Friends can see' },
                { key: 'off', label: 'Private' },
              ]}
              value={share ? 'on' : 'off'}
              onChange={(v) => setShare(v === 'on')}
              columns={2}
            />
          </Field>
        </section>

        <section className="stack">
          <h2 className="step-q">Dashboard</h2>
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
                placeholder="e.g. 10"
              />
              <span className="suffix">km</span>
            </div>
          </Field>
        </section>

        <section className="stack">
          <h2 className="step-q">Connect intervals.icu</h2>
          <p className="muted small">
            Pull your rides in automatically. Your Garmin device syncs to
            intervals.icu, and this app imports from there.
          </p>
          <Field label="API key" hint="intervals.icu → Settings → Developer Settings (bottom of the page)">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="your intervals.icu API key"
              autoComplete="off"
            />
          </Field>
          <Field label="Athlete ID" hint="Leave blank to use your own account." optional>
            <input
              type="text"
              inputMode="numeric"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              placeholder="0"
            />
          </Field>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={testConnection}
            disabled={!apiKey || test?.pending}
          >
            {test?.pending ? 'Testing…' : 'Test connection'}
          </button>
          {test && !test.pending && (
            <p className={test.ok ? 'auth-notice' : 'auth-error'}>{test.msg}</p>
          )}
        </section>

        {error && <p className="auth-error">{error}</p>}
      </main>

      <footer className="wizard-foot">
        <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </div>
  )
}
