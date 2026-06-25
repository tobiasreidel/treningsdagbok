import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Segmented } from '../components/ui'
import { getSettings, saveSettings, fetchActivities, isClimbingActivity } from '../lib/intervals'
import { getMyProfile, setDisplayName, getShareSetting, setShareSetting } from '../lib/friends'
import { getHideRidesUnderKm, setHideRidesUnderKm } from '../lib/prefs'

export default function Settings() {
  const navigate = useNavigate()
  const [athleteId, setAthleteId] = useState('')
  const [apiKey, setApiKey] = useState('') // only holds a newly-typed key
  const [savedKey, setSavedKey] = useState('') // existing key, never bound to a field
  const [replacing, setReplacing] = useState(false) // user chose to enter a new key
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

  // The key to actually use/save: a freshly-typed one when replacing (or when
  // none is stored yet), otherwise the existing key left untouched.
  const keyToUse = replacing || !savedKey ? apiKey.trim() : savedKey

  useEffect(() => {
    Promise.all([getSettings(), getMyProfile().catch(() => ({})), getShareSetting().catch(() => true)])
      .then(([s, profile, shareVal]) => {
        setAthleteId(s.athleteId)
        setSavedKey(s.apiKey)
        setDisplayNameState(profile?.display_name || '')
        setShare(shareVal)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const testConnection = async () => {
    setTest({ pending: true })
    try {
      const acts = await fetchActivities({ athleteId, apiKey: keyToUse, sinceDays: 60 })
      const climbs = acts.filter(isClimbingActivity).length
      const rides = acts.length - climbs
      const parts = [
        `${rides} ride${rides === 1 ? '' : 's'}`,
        `${climbs} climb${climbs === 1 ? '' : 's'}`,
      ]
      setTest({ ok: true, msg: `Connected — found ${parts.join(' · ')} in the last 60 days.` })
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
      await saveSettings({ athleteId, apiKey: keyToUse })
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
            Rides and climbs also import automatically each time you open the app.
          </p>
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
