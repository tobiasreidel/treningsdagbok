import { Field, ChipSelect } from '../ui'
import { SEND_TYPES, gradesFor, formatGrade } from '../../lib/constants'
import { emptyRoute } from '../../lib/formState'

// Step 4 (outdoor climbing only): log individual routes / boulders.
export default function RoutesEditor({ form, update }) {
  const routes = form.routes || []
  const grades = gradesFor(form.subtype)

  const setRoute = (idx, patch) => {
    const next = routes.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    update({ routes: next })
  }
  const addRoute = () => update({ routes: [...routes, emptyRoute()] })
  const removeRoute = (idx) => update({ routes: routes.filter((_, i) => i !== idx) })

  return (
    <div className="stack">
      {routes.length === 0 && (
        <p className="muted">No routes yet. Add the climbs you did, one by one.</p>
      )}

      {routes.map((route, idx) => (
        <div className="route-card" key={idx}>
          <div className="route-card-head">
            <span className="route-num">#{idx + 1}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove route"
              onClick={() => removeRoute(idx)}
            >
              ✕
            </button>
          </div>

          <Field label="Name" optional>
            <input
              type="text"
              value={route.name}
              placeholder="e.g. La Rambla"
              onChange={(e) => setRoute(idx, { name: e.target.value })}
            />
          </Field>

          <Field label="Grade">
            <select
              value={formatGrade(route.grade, form.subtype) || ''}
              onChange={(e) => setRoute(idx, { grade: e.target.value || null })}
            >
              <option value="">Grade</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Send">
            <ChipSelect
              options={SEND_TYPES}
              value={route.send_type}
              onChange={(v) => setRoute(idx, { send_type: v })}
              isActive={isSendActive}
            />
          </Field>
        </div>
      ))}

      <button type="button" className="btn btn-secondary btn-block" onClick={addRoute}>
        + Add route
      </button>
    </div>
  )
}

// A 2nd-go send is also a redpoint, so selecting "2. go" lights up both chips.
function isSendActive(key, sendType) {
  if (key === 'redpoint') return sendType === 'redpoint' || sendType === 'secondgo'
  return sendType === key
}
