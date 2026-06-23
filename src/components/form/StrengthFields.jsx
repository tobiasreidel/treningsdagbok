import { useState } from 'react'
import { Field, NumberField, Segmented } from '../ui'
import { STRENGTH_EXERCISES } from '../../lib/constants'
import { emptyExercise, emptyHang } from '../../lib/formState'

// The strength + finger-training module. Two panels you toggle between:
//   • Strength — add multiple exercises, each with sets · reps · weight.
//   • Finger   — a campus toggle and a list of hangboard hangs.
// Everything is stored under form.extra ({ strength: [...], finger: {...} }).
export default function StrengthFields({ form, updateExtra }) {
  const e = form.extra || {}
  const exercises = e.strength || []
  const finger = e.finger || { campus: false, hangboard: [] }
  const hangs = finger.hangboard || []
  const [tab, setTab] = useState('strength')

  // ---- strength exercises ----
  const setEx = (i, patch) =>
    updateExtra({ strength: exercises.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const addEx = () => updateExtra({ strength: [...exercises, emptyExercise()] })
  const removeEx = (i) => updateExtra({ strength: exercises.filter((_, idx) => idx !== i) })

  // ---- finger training ----
  const setFinger = (patch) => updateExtra({ finger: { ...finger, ...patch } })
  const setHang = (i, patch) =>
    setFinger({ hangboard: hangs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const addHang = () => setFinger({ hangboard: [...hangs, emptyHang()] })
  const removeHang = (i) => setFinger({ hangboard: hangs.filter((_, idx) => idx !== i) })

  return (
    <div className="stack">
      <Segmented
        options={[
          { key: 'strength', label: '🏋 Strength' },
          { key: 'finger', label: '🤏 Finger' },
        ]}
        value={tab}
        onChange={setTab}
        columns={2}
      />

      {tab === 'strength' ? (
        <div className="stack">
          {exercises.length === 0 && (
            <p className="muted">No exercises yet. Add the lifts you did.</p>
          )}

          {exercises.map((ex, i) => (
            <div className="route-card" key={i}>
              <div className="route-card-head">
                <span className="route-num">#{i + 1}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove exercise"
                  onClick={() => removeEx(i)}
                >
                  ✕
                </button>
              </div>

              <Field label="Exercise">
                <select
                  value={ex.exercise}
                  onChange={(ev) => setEx(i, { exercise: ev.target.value })}
                >
                  {STRENGTH_EXERCISES.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="three-col">
                <Field label="Sets">
                  <NumberField
                    value={ex.sets}
                    onChange={(v) => setEx(i, { sets: v })}
                    placeholder="3"
                    step="1"
                    min={0}
                  />
                </Field>
                <Field label="Reps">
                  <NumberField
                    value={ex.reps}
                    onChange={(v) => setEx(i, { reps: v })}
                    placeholder="10"
                    step="1"
                    min={0}
                  />
                </Field>
                <Field label="Weight" optional>
                  <NumberField
                    value={ex.weight}
                    onChange={(v) => setEx(i, { weight: v })}
                    placeholder="0"
                    unit="kg"
                    min={0}
                  />
                </Field>
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-secondary btn-block" onClick={addEx}>
            + Add exercise
          </button>
        </div>
      ) : (
        <div className="stack">
          <Field label="Campus board">
            <Segmented
              options={[
                { key: 'yes', label: 'Did campus' },
                { key: 'no', label: 'No' },
              ]}
              value={finger.campus ? 'yes' : 'no'}
              onChange={(v) => setFinger({ campus: v === 'yes' })}
              columns={2}
            />
          </Field>

          <div>
            <span className="field-label">Hangboard</span>
            <div className="stack" style={{ marginTop: 8 }}>
              {hangs.length === 0 && <p className="muted">No hangboard sets yet.</p>}

              {hangs.map((h, i) => (
                <div className="route-card" key={i}>
                  <div className="route-card-head">
                    <span className="route-num">#{i + 1}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remove hangboard set"
                      onClick={() => removeHang(i)}
                    >
                      ✕
                    </button>
                  </div>

                  <Field label="Hands">
                    <Segmented
                      options={[
                        { key: 'two', label: 'Two hands' },
                        { key: 'one', label: 'One hand' },
                      ]}
                      value={h.hands}
                      onChange={(v) => setHang(i, { hands: v })}
                      columns={2}
                    />
                  </Field>

                  <Field
                    label="Added weight"
                    hint={h.hands === 'one' ? '+ added · − assisted (pulley)' : 'added weight'}
                  >
                    <NumberField
                      value={h.weight}
                      onChange={(v) => setHang(i, { weight: v })}
                      placeholder="0"
                      unit="kg"
                      min={h.hands === 'one' ? -500 : 0}
                    />
                  </Field>
                </div>
              ))}

              <button type="button" className="btn btn-secondary btn-block" onClick={addHang}>
                + Add hangboard set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
