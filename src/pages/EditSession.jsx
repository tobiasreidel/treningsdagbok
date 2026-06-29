import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Segmented } from '../components/ui'
import DetailsFields from '../components/form/DetailsFields'
import RoutesEditor from '../components/form/RoutesEditor'
import StrengthFields from '../components/form/StrengthFields'
import NotesPhoto from '../components/form/NotesPhoto'
import { sessionToForm, isOutdoorClimbing, usesStrengthModule } from '../lib/formState'
import { SPORTS, SUBTYPES, LOCATIONS } from '../lib/constants'
import { getSession, updateSession, deleteSession, getSignedPhotoUrl } from '../lib/sessions'
import { notifySessionsChanged } from '../App'

export default function EditSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [session, setSession] = useState(null)
  const [photoSrc, setPhotoSrc] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const isPending = id?.startsWith('local-')

  useEffect(() => {
    if (isPending) return
    let alive = true
    getSession(id)
      .then(async (s) => {
        if (!alive) return
        setSession(s)
        setForm(sessionToForm(s))
        if (s.photo_url) setPhotoSrc(await getSignedPhotoUrl(s.photo_url))
      })
      .catch((err) => alive && setLoadError(err.message || 'Could not load session'))
    return () => {
      alive = false
    }
  }, [id, isPending])

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))
  const updateExtra = (patch) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, ...patch } }))

  const save = async () => {
    // Duration is required (matches the register flow).
    if (!(Number(form.duration) > 0)) {
      setError('Add a duration before saving.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateSession(id, form)
      notifySessionsChanged()
      // Pop back to the detail screen we came from rather than pushing a new
      // entry — otherwise the edit screen stays in the history and Back walks
      // through it on the way out. SessionDetail re-fetches on mount.
      navigate(-1)
    } catch (err) {
      setError(err.message || 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this session? This cannot be undone.')) return
    setSaving(true)
    try {
      await deleteSession(session)
      notifySessionsChanged()
      navigate('/', { state: { toast: 'Session deleted' } })
    } catch (err) {
      setError(err.message || 'Could not delete')
      setSaving(false)
    }
  }

  if (isPending) {
    return (
      <div className="page">
        <SimpleHead onBack={() => navigate('/')} title="Session" />
        <main className="wizard-body">
          <p className="muted">
            This session is still saved offline and will sync when you're back
            online. You can edit it once it has synced.
          </p>
        </main>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page">
        <SimpleHead onBack={() => navigate('/')} title="Session" />
        <main className="wizard-body">
          <p className="auth-error">{loadError}</p>
        </main>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  const sport = SPORTS[form.sport]

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>
            {sport?.emoji} Edit session
          </h1>
        </div>
        <button className="icon-btn danger" onClick={remove} aria-label="Delete">
          🗑
        </button>
      </header>

      <main className="wizard-body stack">
        {SUBTYPES[form.sport] && (
          <section>
            <h2 className="step-q">Type</h2>
            <Segmented
              options={SUBTYPES[form.sport]}
              value={form.subtype}
              onChange={(v) => update({ subtype: v })}
              columns={form.sport === 'climbing' ? 3 : 2}
            />
          </section>
        )}

        {form.sport === 'climbing' && (
          <section>
            <h2 className="step-q">Where</h2>
            <Segmented
              options={LOCATIONS}
              value={form.location}
              onChange={(v) => update({ location: v })}
              columns={2}
            />
          </section>
        )}

        <section>
          <h2 className="step-q">Details</h2>
          <DetailsFields form={form} update={update} updateExtra={updateExtra} />
        </section>

        {isOutdoorClimbing(form) && (
          <section>
            <h2 className="step-q">Routes &amp; boulders</h2>
            <RoutesEditor form={form} update={update} />
          </section>
        )}

        {usesStrengthModule(form) && (
          <section>
            <h2 className="step-q">
              {form.sport === 'finger'
                ? 'Finger training'
                : form.sport === 'strength'
                  ? 'Strength training'
                  : 'Strength & finger'}
            </h2>
            <StrengthFields form={form} updateExtra={updateExtra} />
          </section>
        )}

        <section>
          <h2 className="step-q">Notes &amp; photo</h2>
          <NotesPhoto form={form} update={update} existingPhotoSrc={photoSrc} />
        </section>

        {error && <p className="auth-error">{error}</p>}
      </main>

      <footer className="wizard-foot">
        <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </div>
  )
}

function SimpleHead({ onBack, title }) {
  return (
    <header className="wizard-head">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        ‹
      </button>
      <div className="wizard-title">
        <h1>{title}</h1>
      </div>
      <span style={{ width: 40 }} />
    </header>
  )
}
