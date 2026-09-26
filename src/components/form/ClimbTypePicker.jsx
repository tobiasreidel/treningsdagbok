import { SUBTYPES } from '../../lib/constants'
import { formDisciplines, toggleDiscipline } from '../../lib/formState'

// Bouldering, sport, trad: any of them, in one session. A gym visit that
// starts on the boulders and ends on the ropes is one session, not two, so
// these are toggles rather than a single choice. The first one tapped is the
// session's main type; the order says nothing else.
export default function ClimbTypePicker({ form, update }) {
  const picked = formDisciplines(form)
  const options = SUBTYPES.climbing
  return (
    <>
      <div className="segmented" style={{ '--cols': options.length }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`seg-btn ${picked.includes(o.key) ? 'is-active' : ''}`}
            aria-pressed={picked.includes(o.key)}
            onClick={() => update(toggleDiscipline(form, o.key))}
          >
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Did more than one? Tap them all.</p>
    </>
  )
}
