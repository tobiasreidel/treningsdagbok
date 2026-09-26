import { useState } from 'react'
import { Field, Scale, Segmented } from './ui'
import { HOOPER_ITEMS, saveWellnessDay } from '../lib/wellness'
import {
  ILLNESS_SYMPTOMS,
  symptomInfo,
  openIllness,
  addIllness,
  updateIllnessSymptoms,
  endIllness,
} from '../lib/health'
import { formatDayShort, todayISO } from '../lib/format'

const SYMPTOM_OPTIONS = ILLNESS_SYMPTOMS.map((s) => ({ key: s.key, label: s.label, emoji: s.emoji }))

// The daily check-in as a bottom sheet, shown once per day when the app opens
// (Dashboard mounts it while the coach is on and today isn't logged yet).
// Unlike the check-in page this saves on the button, not per tap - the sheet
// is an interruption, and an interruption needs a clear "done, go away".
//
// It is also where an illness gets asked after. An episode nobody closes goes
// on resting you forever, and the one moment you reliably see every morning is
// this sheet, so an open illness is the first question on it.
export default function CheckInSheet({ illnesses = [], onClose, onSaved }) {
  const [day, setDay] = useState({})
  const open = openIllness(illnesses)
  // Only asked after once it started before today: one logged today was
  // logged moments ago.
  const followUp = open && open.started < todayISO() ? open : null
  // A symptom key, 'well', or null for unanswered. The illness log can land
  // after the sheet has opened, so the follow-up shows the logged symptoms
  // until you pick something else, rather than copying them into state once.
  const [ill, setIll] = useState(null)
  const [illOpen, setIllOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const hooperAnswered = HOOPER_ITEMS.some((i) => day[i.key] != null)
  // Unchanged is not an answer worth saving: "still the same" writes nothing.
  const illChanged = ill != null && (followUp ? ill !== followUp.symptoms : !open)
  const answered = hooperAnswered || illChanged

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      if (illChanged) {
        if (!followUp) await addIllness({ started: todayISO(), symptoms: ill })
        else if (ill === 'well') await endIllness(followUp)
        else await updateIllnessSymptoms(followUp, ill)
      }
      if (hooperAnswered) await saveWellnessDay(todayISO(), day)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet checkin-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Daily check-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <strong>How are you today?</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Not now">
            ✕
          </button>
        </div>
        <p className="muted small checkin-sheet-intro">
          Ten seconds, rest days included, and that’s what readiness is built from. You can
          change today’s answers later under Check in.
        </p>

        <div className="checkin-sheet-body">
          {followUp && (
            <Field
              label={`${symptomInfo(followUp.symptoms).noun} since ${formatDayShort(followUp.started)}. Still ill?`}
              hint={ill === 'well' ? 'The coach brings you back gradually from today.' : null}
            >
              <Segmented
                options={[...SYMPTOM_OPTIONS, { key: 'well', label: 'Well again', emoji: '💪' }]}
                value={ill ?? followUp.symptoms}
                onChange={setIll}
                columns={2}
              />
            </Field>
          )}

          {HOOPER_ITEMS.map((item) => (
            <Field key={item.key} label={item.label}>
              <Scale
                min={1}
                max={5}
                value={day[item.key] ?? null}
                onChange={(v) => setDay((d) => ({ ...d, [item.key]: v }))}
                lowLabel={item.low}
                highLabel={item.high}
              />
            </Field>
          ))}

          {!open &&
            (illOpen ? (
              <Field label="What kind of ill?" hint={ill ? symptomInfo(ill).hint : null}>
                <Segmented options={SYMPTOM_OPTIONS} value={ill} onChange={setIll} columns={3} />
              </Field>
            ) : (
              <button type="button" className="link-btn illness-link" onClick={() => setIllOpen(true)}>
                🤒 I’m ill today
              </button>
            ))}
        </div>

        {error && <p className="auth-error">{error}</p>}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={save}
          disabled={!answered || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!answered && <p className="muted small">Answer at least one to save.</p>}
      </div>
    </div>
  )
}
