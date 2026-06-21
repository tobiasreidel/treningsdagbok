import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { getSettings, saveSettings, fetchCyclingActivities } from '../lib/intervals'

export default function Settings() {
  const navigate = useNavigate()
  const [athleteId, setAthleteId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState(null) // {ok, msg}
  const [error, setError] = useState(null)

  useEffect(() => {
    getSettings()
      .then((s) => {
        setAthleteId(s.athleteId)
        setApiKey(s.apiKey)
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
      await saveSettings({ athleteId, apiKey })
      navigate('/', { state: { toast: 'intervals.icu connected' } })
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
          <h2 className="step-q">Connect intervals.icu</h2>
          <p className="muted small">
            Pull your rides in automatically. Your Garmin device syncs to
            intervals.icu, and this app imports from there.
          </p>

          <Field
            label="API key"
            hint="intervals.icu → Settings → Developer Settings (bottom of the page)"
          >
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="your intervals.icu API key"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Athlete ID"
            hint="The number in your intervals.icu URL. Leave blank to use your own account."
            optional
          >
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
          {error && <p className="auth-error">{error}</p>}
        </section>
      </main>

      <footer className="wizard-foot">
        <button className="btn btn-primary btn-block" onClick={save} disabled={saving || !apiKey}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </div>
  )
}
