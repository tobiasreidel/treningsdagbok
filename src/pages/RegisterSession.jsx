import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Segmented, useOnline } from '../components/ui'
import DetailsFields from '../components/form/DetailsFields'
import RoutesEditor from '../components/form/RoutesEditor'
import StrengthFields from '../components/form/StrengthFields'
import NotesPhoto from '../components/form/NotesPhoto'
import NotesField from '../components/form/NotesField'
import CoachPlanField, { COACH_SPORTS } from '../components/form/CoachPlanField'
import { emptyForm, isOutdoorClimbing } from '../lib/formState'
import { SPORTS, SUBTYPES, LOCATIONS } from '../lib/constants'
import { getEnabledSports, getCoachEnabled } from '../lib/prefs'
import { createSession, notifySessionsChanged } from '../lib/sessions'

export default function RegisterSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const online = useOnline()
  // An imported intervals.icu ride arrives as a fully-shaped, pre-filled form.
  const prefill = location.state?.prefill
  const [form, setForm] = useState(() => {
    if (prefill) return { ...emptyForm(), ...prefill, extra: { ...prefill.extra } }
    const f = emptyForm()
    if (location.state?.date) f.date = location.state.date
    return f
  })
  // A prefilled form already knows its sport, its subtype and - when it came
  // from the coach - whether it was the planned session. Start on the first
  // step it hasn't answered rather than a fixed index, which quietly landed on
  // the wrong question as soon as the coach added a step.
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))
  const updateExtra = (patch) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, ...patch } }))

  const enabledSports = getEnabledSports()

  // Step list is dynamic:
  //   • strength / finger → no subtype; a single training step
  //   • outdoor climbing  → a routes step
  //   • indoor climbing   → an (optional) strength + finger step
  //   • coach on          → a "was this the plan?" step for the sports it covers
  const steps = useMemo(() => {
    const plan = getCoachEnabled() && COACH_SPORTS.includes(form.sport) ? ['plan'] : []
    if (form.sport === 'strength') return ['sport', ...plan, 'details', 'strength', 'notes']
    if (form.sport === 'finger') return ['sport', ...plan, 'details', 'finger', 'notes']
    const s = ['sport', 'subtype', ...plan, 'details']
    if (isOutdoorClimbing(form)) s.push('routes')
    else if (form.sport === 'climbing' && form.location === 'indoor') s.push('strength')
    s.push('notes')
    return s
  }, [form.sport, form.location])

  // Jump past what the prefill already answered, once (steps depend on the
  // sport, which the prefill is what sets).
  const [skipped, setSkipped] = useState(!prefill)
  useEffect(() => {
    if (skipped) return
    const answered = new Set(['sport', 'subtype'])
    if (prefill.extra?.coach) answered.add('plan')
    const first = steps.findIndex((k) => !answered.has(k))
    setStep(first === -1 ? steps.length - 1 : first)
    setSkipped(true)
  }, [skipped, prefill, steps])

  const current = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1

  const selectSport = (sport) => {
    // Reset sport-specific bits when (re)choosing a sport, keep the date.
    setForm((f) => ({ ...emptyForm(), date: f.date, sport }))
    setStep(1)
  }

  const canAdvance = () => {
    if (current === 'sport') return !!form.sport
    if (current === 'subtype') {
      if (!form.subtype) return false
      if (form.sport === 'climbing' && !form.location) return false
      return true
    }
    // Duration is required: you can't leave the details step without one.
    if (current === 'details') return Number(form.duration) > 0
    return true
  }

  const back = () => {
    if (step === 0) navigate('/')
    else setStep((s) => Math.max(0, s - 1))
  }

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await createSession(form)
      notifySessionsChanged()
      navigate('/', {
        state: { toast: res.pending ? 'Saved offline. Will sync when online.' : 'Session saved' },
      })
    } catch (err) {
      setError(err.message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Register session</h1>
          {!online && <span className="offline-tag">offline</span>}
        </div>
        <div className="wizard-progress">
          {steps.map((s, i) => (
            <span key={s} className={`dot ${i <= step ? 'is-done' : ''}`} />
          ))}
        </div>
      </header>

      <main className="wizard-body">
        {current === 'sport' && (
          <section>
            <h2 className="step-q">What did you do?</h2>
            <Segmented
              options={enabledSports.map((k) => SPORTS[k])}
              value={form.sport}
              onChange={selectSport}
              columns={Math.min(enabledSports.length, 3)}
            />
          </section>
        )}

        {current === 'subtype' && (
          <section className="stack">
            <div>
              <h2 className="step-q">Type</h2>
              <Segmented
                options={SUBTYPES[form.sport]}
                value={form.subtype}
                onChange={(v) => update({ subtype: v })}
                columns={Math.min(SUBTYPES[form.sport]?.length || 2, 3)}
              />
            </div>
            {form.sport === 'climbing' && (
              <div>
                <h2 className="step-q">Where</h2>
                <Segmented
                  options={LOCATIONS}
                  value={form.location}
                  onChange={(v) => update({ location: v })}
                  columns={2}
                />
              </div>
            )}
          </section>
        )}

        {current === 'plan' && (
          <section className="stack">
            <h2 className="step-q">The plan</h2>
            <CoachPlanField form={form} updateExtra={updateExtra} />
          </section>
        )}

        {current === 'details' && (
          <section className="stack">
            <div>
              <h2 className="step-q">Details</h2>
              <DetailsFields form={form} update={update} updateExtra={updateExtra} />
            </div>
            <NotesField form={form} update={update} />
          </section>
        )}

        {current === 'routes' && (
          <section>
            <h2 className="step-q">Routes &amp; boulders</h2>
            <RoutesEditor form={form} update={update} />
          </section>
        )}

        {(current === 'strength' || current === 'finger') && (
          <section className="stack">
            <div>
              <h2 className="step-q">Strength &amp; finger</h2>
              <StrengthFields form={form} updateExtra={updateExtra} />
            </div>
            <NotesField form={form} update={update} />
          </section>
        )}

        {current === 'notes' && (
          <section>
            <h2 className="step-q">Notes &amp; photo</h2>
            <NotesPhoto form={form} update={update} />
          </section>
        )}

        {error && <p className="auth-error">{error}</p>}
      </main>

      <footer className="wizard-foot">
        {!isLast ? (
          <button
            className="btn btn-primary btn-block"
            onClick={next}
            disabled={!canAdvance()}
          >
            Next
          </button>
        ) : (
          <button className="btn btn-primary btn-block" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save session'}
          </button>
        )}
      </footer>
    </div>
  )
}
