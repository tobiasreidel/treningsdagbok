import { useState } from 'react'
import { Field, Scale } from './ui'
import { HOOPER_ITEMS, saveWellnessDay } from '../lib/wellness'
import { todayISO } from '../lib/format'

// The daily check-in as a bottom sheet, shown once per day when the app opens
// (Dashboard mounts it while the coach is on and today isn't logged yet).
// Unlike the check-in page this saves on the button, not per tap - the sheet
// is an interruption, and an interruption needs a clear "done, go away".
export default function CheckInSheet({ onClose, onSaved }) {
  const [day, setDay] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const answered = HOOPER_ITEMS.some((i) => day[i.key] != null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveWellnessDay(todayISO(), day)
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
