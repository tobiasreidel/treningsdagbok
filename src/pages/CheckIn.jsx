import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Scale, Segmented } from '../components/ui'
import {
  HOOPER_ITEMS,
  OSTRC_QUESTIONS,
  BODY_AREAS,
  getWellnessDay,
  saveWellnessDay,
  fetchOstrc,
  saveOstrc,
  currentWeekStart,
  thisWeeksOstrc,
  ostrcSeverity,
  isSubstantial,
  areaLabel,
} from '../lib/wellness'
import { todayISO, formatDayShort } from '../lib/format'

// Daily wellness + the weekly overuse questionnaire.
//
// Kept off the session form on purpose: wellness logged only when you train is
// sampled exactly when you feel well enough to train, which is the wrong half
// of the data. The daily check-in takes about ten seconds.
export default function CheckIn() {
  const navigate = useNavigate()
  const [day, setDay] = useState(null)
  const [ostrc, setOstrc] = useState([])
  const [tab, setTab] = useState('today')
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([getWellnessDay(todayISO()), fetchOstrc()])
      setDay(d || {})
      setOstrc(o)
    } catch (err) {
      setError(err.message || 'Could not load')
      setDay({})
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const show = (m) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1500)
  }

  const setItem = async (key, value) => {
    const next = { ...day, [key]: value }
    setDay(next)
    try {
      const { user_id, created_at, date, ...rest } = next
      await saveWellnessDay(todayISO(), rest)
      setError(null)
      show('Saved')
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
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Check in</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <Segmented
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This week' },
          ]}
          value={tab}
          onChange={setTab}
          columns={2}
        />

        {tab === 'today' ? (
          <section className="card settings-card stack">
            <h2 className="step-q">How are you today?</h2>
            <p className="muted small">
              Ten seconds, every day — including rest days. That’s the point: if this
              only got filled in on training days it would only ever see you on the days
              you felt good enough to train.
            </p>
            {HOOPER_ITEMS.map((item) => (
              <Field key={item.key} label={item.label} hint={item.hint}>
                <Scale
                  min={1}
                  max={5}
                  value={day?.[item.key] ?? null}
                  onChange={(v) => setItem(item.key, v)}
                  lowLabel={item.low}
                  highLabel={item.high}
                />
              </Field>
            ))}
            {error && <p className="auth-error">{error}</p>}
          </section>
        ) : (
          <OstrcSection rows={ostrc} onSaved={load} />
        )}
      </main>

      {flash && <div className="toast">{flash}</div>}
    </div>
  )
}

// The OSTRC Overuse Injury Questionnaire, once a week per body area.
function OstrcSection({ rows, onSaved }) {
  const week = currentWeekStart()
  const done = thisWeeksOstrc(rows)
  const [area, setArea] = useState('fingers')
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const existing = done.find((r) => r.area === area)
  const current = { ...(existing || {}), ...answers }
  const complete = OSTRC_QUESTIONS.every((q) => current[q.key] != null)

  const save = async () => {
    setBusy(true)
    try {
      await saveOstrc(week, area, {
        q1: current.q1, q2: current.q2, q3: current.q3, q4: current.q4,
      })
      setAnswers({})
      setErr(null)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    }
    setBusy(false)
  }

  return (
    <>
      <section className="card settings-card stack">
        <h2 className="step-q">Weekly overuse check</h2>
        <p className="muted small">
          Four questions about the last seven days, from the OSTRC Overuse Injury
          Questionnaire — a validated instrument built at the Oslo Sports Trauma Research
          Centre, precisely because counting only injuries that stop you training misses
          most overuse problems. Answering it lets the coach react to something building,
          instead of waiting until you call it an injury.
        </p>

        <Field label="Body area">
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {BODY_AREAS.map((a) => (
              <option key={a.key} value={a.key}>{a.emoji} {a.label}</option>
            ))}
          </select>
        </Field>

        {OSTRC_QUESTIONS.map((q, i) => (
          <div className="stack" key={q.key}>
            <span className="field-label">
              {i + 1}. {q.text.replace('{area}', areaLabel(area).toLowerCase())}
            </span>
            <div className="ostrc-options">
              {q.options.map((o) => (
                <button
                  key={o.score}
                  type="button"
                  className={`ostrc-opt ${current[q.key] === o.score ? 'is-active' : ''}`}
                  onClick={() => setAnswers({ ...answers, [q.key]: o.score })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {err && <p className="auth-error">{err}</p>}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={save}
          disabled={!complete || busy}
        >
          {busy ? 'Saving…' : existing ? 'Update this week' : 'Save this week'}
        </button>
        {!complete && <p className="muted small">Answer all four to save.</p>}
      </section>

      {done.length > 0 && (
        <section className="card settings-card stack">
          <h2 className="step-q">Reported this week</h2>
          {done.map((r) => {
            const sev = ostrcSeverity(r)
            return (
              <div className="coach-spec-row" key={r.area}>
                <span className="coach-spec-label">{areaLabel(r.area)}</span>
                <span className="coach-spec-value">
                  {sev}/100{isSubstantial(r) ? ' · substantial' : sev > 0 ? ' · problem' : ' · clear'}
                </span>
              </div>
            )
          })}
          <p className="muted small">Week of {formatDayShort(week)}.</p>
        </section>
      )}
    </>
  )
}
