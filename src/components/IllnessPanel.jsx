import { useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { Field, Segmented } from './ui'
import {
  ILLNESS_SYMPTOMS,
  symptomInfo,
  openIllness,
  addIllness,
  updateIllnessSymptoms,
  endIllness,
  deleteIllness,
} from '../lib/health'
import { asDate, formatDayShort, todayISO } from '../lib/format'

const SYMPTOM_OPTIONS = ILLNESS_SYMPTOMS.map((s) => ({ key: s.key, label: s.label, emoji: s.emoji }))

// Being ill, from any screen that asks how you are: say that you are, say how
// it is as it changes, say when it is over. Every tap saves, and every write
// dispatches coach:changed, so the card, the plan and the calendar re-read.
//
// `entry` is how it looks while you are well: a full-width button where the
// question belongs (the check-in, the health card), a quiet link where it is
// an aside (the coach's Today card), or 'none'. `compact` shows an open
// illness as its one button, for a card that already says the rest.
export default function IllnessPanel({ illnesses, onChanged, entry = 'button', compact = false }) {
  const open = openIllness(illnesses)
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState(null)
  const [since, setSince] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const act = async (fn) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onChanged?.()
    } catch (e) {
      setErr(e.message || 'Could not save')
    }
    setBusy(false)
  }

  if (open) {
    const info = symptomInfo(open.symptoms)
    const day = differenceInCalendarDays(new Date(), asDate(open.started)) + 1
    // Well again on the day it started is a false alarm, not a one-day
    // illness. Kept as a row it would go on resting you for the rest of today,
    // so the button says what it does and removes it instead.
    const sameDay = open.started === todayISO()
    const button = (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={busy}
        onClick={() => act(() => (sameDay ? deleteIllness(open.id) : endIllness(open)))}
      >
        {sameDay ? 'Not ill after all' : '💪 I’m well again'}
      </button>
    )
    if (compact) {
      return (
        <>
          {button}
          {err && <p className="auth-error">{err}</p>}
        </>
      )
    }
    return (
      <div className="illness-panel stack">
        <div className="illness-head">
          <strong>
            {info.emoji} {info.noun} since {formatDayShort(open.started)}
          </strong>
          <span className="muted small">day {day}</span>
        </div>
        <Field label="How is it now?" hint={info.hint}>
          <Segmented
            options={SYMPTOM_OPTIONS}
            value={open.symptoms}
            onChange={(k) => k !== open.symptoms && act(() => updateIllnessSymptoms(open, k))}
            columns={3}
          />
        </Field>
        {button}
        {err && <p className="auth-error">{err}</p>}
      </div>
    )
  }

  if (!adding) {
    if (entry === 'none') return null
    return entry === 'link' ? (
      <button type="button" className="link-btn illness-link" onClick={() => setAdding(true)}>
        🤒 Ill? Tell the coach
      </button>
    ) : (
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setAdding(true)}>
        🤒 I’m ill
      </button>
    )
  }

  const cancel = () => {
    setAdding(false)
    setKind(null)
    setSince(todayISO())
  }

  return (
    <div className="illness-panel stack">
      <Field label="What kind of ill?">
        <Segmented options={SYMPTOM_OPTIONS} value={kind} onChange={setKind} columns={3} />
      </Field>
      {/* What each one means, before choosing: the choice is the whole
          decision the coach makes, so it can't hide behind a selection. */}
      <ul className="illness-kinds">
        {ILLNESS_SYMPTOMS.map((s) => (
          <li key={s.key} className={kind === s.key ? 'is-active' : ''}>
            <strong>{s.label}:</strong> {s.hint.charAt(0).toLowerCase() + s.hint.slice(1)}
          </li>
        ))}
      </ul>
      <Field label="Since">
        <input
          type="date"
          value={since}
          max={todayISO()}
          onChange={(e) => setSince(e.target.value)}
        />
      </Field>
      <div className="wr-row">
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!kind || !since || busy}
          onClick={() =>
            act(async () => {
              await addIllness({ started: since, symptoms: kind })
              cancel()
            })
          }
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {err && <p className="auth-error">{err}</p>}
    </div>
  )
}
