import { useState } from 'react'
import { Field, NumberField, Segmented } from '../ui'
import { SPORTS, STRENGTH_EXERCISES } from '../../lib/constants'
import { emptyExercise, emptyHang, normalizeHang } from '../../lib/formState'

// The strength + finger-training module. Both panels (lifts and campus/
// hangboard) are always available behind a tab toggle, so a combined workout
// — finger and strength in one gym visit, or blocks inside an indoor climb —
// is logged as one session as you go. Time fields carve the minutes that
// belong to the *other* sport(s) out of the session's duration:
//   • indoor climbing  → strength + finger time fields (rest stays climbing)
//   • strength session → a finger time field (rest stays strength)
//   • finger session   → a strength time field (rest stays finger)
// Everything is stored under form.extra ({ strength: [...], finger: {...},
// strength_minutes, finger_minutes }).
export default function StrengthFields({ form, updateExtra }) {
  const e = form.extra || {}
  const restLabel = SPORTS[form.sport]?.label.toLowerCase() || 'session'
  const [tab, setTab] = useState(form.sport === 'finger' ? 'finger' : 'strength')

  return (
    <div className="stack">
      {form.sport !== 'strength' && (
        <Field
          label="Time on strength"
          hint={`Counted as strength. The rest of the session stays ${restLabel} time.`}
        >
          <NumberField
            value={e.strength_minutes ?? ''}
            onChange={(v) => updateExtra({ strength_minutes: v })}
            placeholder="0"
            unit="min"
            step="5"
          />
        </Field>
      )}
      {form.sport !== 'finger' && (
        <Field
          label="Time on finger training"
          hint={`Counted as finger training. The rest of the session stays ${restLabel} time.`}
        >
          <NumberField
            value={e.finger_minutes ?? ''}
            onChange={(v) => updateExtra({ finger_minutes: v })}
            placeholder="0"
            unit="min"
            step="5"
          />
        </Field>
      )}

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
        <StrengthPanel exercises={e.strength || []} updateExtra={updateExtra} />
      ) : (
        <FingerPanel finger={e.finger || { campus: false, hangboard: [] }} updateExtra={updateExtra} />
      )}
    </div>
  )
}

// Lifts: multiple exercises, each with sets · reps · weight.
function StrengthPanel({ exercises, updateExtra }) {
  const setEx = (i, patch) =>
    updateExtra({ strength: exercises.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const addEx = () => updateExtra({ strength: [...exercises, emptyExercise()] })
  const removeEx = (i) => updateExtra({ strength: exercises.filter((_, idx) => idx !== i) })

  return (
    <div className="stack">
      {exercises.length === 0 && <p className="muted">No exercises yet. Add the lifts you did.</p>}

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
            <select value={ex.exercise} onChange={(ev) => setEx(i, { exercise: ev.target.value })}>
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
  )
}

// Finger training: a campus choice and a list of hangboard exercises.
function FingerPanel({ finger, updateExtra }) {
  const hangs = finger.hangboard || []
  const setFinger = (patch) => updateExtra({ finger: { ...finger, ...patch } })
  const setHang = (i, next) =>
    setFinger({ hangboard: hangs.map((x, idx) => (idx === i ? next : x)) })
  const addHang = () => setFinger({ hangboard: [...hangs, emptyHang()] })
  const removeHang = (i) => setFinger({ hangboard: hangs.filter((_, idx) => idx !== i) })

  // Back-compat: campus used to be a boolean; true now reads as a campus board.
  const campusValue = finger.campus === true ? 'board' : finger.campus || 'none'

  return (
    <div className="stack">
      <Field label="Campus">
        <Segmented
          options={[
            { key: 'none', label: 'None' },
            { key: 'board', label: 'Campus board' },
            { key: 'spray', label: 'Spray wall' },
          ]}
          value={campusValue}
          onChange={(v) => setFinger({ campus: v === 'none' ? '' : v })}
          columns={3}
        />
      </Field>

      <div>
        <span className="field-label">Hangboard</span>
        <div className="stack" style={{ marginTop: 8 }}>
          {hangs.length === 0 && <p className="muted">No hangboard exercises yet.</p>}

          {hangs.map((h, i) => (
            <HangEditor
              key={i}
              hang={h}
              index={i}
              onChange={(next) => setHang(i, next)}
              onRemove={() => removeHang(i)}
            />
          ))}

          <button type="button" className="btn btn-secondary btn-block" onClick={addHang}>
            + Add hangboard exercise
          </button>
        </div>
      </div>
    </div>
  )
}

// One hangboard exercise: hands + reps + a count of sets. Changing the set
// count grows/shrinks the list, seeding new sets from the first one; weight and
// time stay editable per set. The count is applied on blur/Enter so clearing
// the field to retype it never wipes the sets you already filled in.
function HangEditor({ hang, index, onChange, onRemove }) {
  const h = normalizeHang(hang)
  const oneHand = h.hands === 'one'
  // While the Sets field is focused we show the raw text being typed; otherwise
  // it mirrors the actual set count (so it stays correct if the list reorders).
  const [editing, setEditing] = useState(false)
  const [countText, setCountText] = useState('')
  const countDisplay = editing ? countText : String(h.sets.length)

  const applyCount = () => {
    setEditing(false)
    let count = Math.floor(Number(countText))
    if (!Number.isFinite(count) || count < 1) count = 1
    count = Math.min(count, 30)
    if (count === h.sets.length) return
    const template = h.sets[0] || { weight: '', time: '', edge: '' }
    const sets = h.sets.slice(0, count)
    while (sets.length < count) sets.push({ ...template })
    onChange({ ...h, sets })
  }

  // Editing the first set is the "default for all sets": it carries over to any
  // set that still matches the old first-set value (i.e. hasn't been customized
  // yet). Editing any other set only touches that one.
  const setSet = (i, patch) => {
    if (i !== 0) {
      onChange({ ...h, sets: h.sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
      return
    }
    const prev = h.sets[0] || {}
    const sets = h.sets.map((s, idx) => {
      if (idx === 0) return { ...s, ...patch }
      const next = { ...s }
      for (const key of Object.keys(patch)) {
        if (String(s[key] ?? '') === String(prev[key] ?? '')) next[key] = patch[key]
      }
      return next
    })
    onChange({ ...h, sets })
  }

  return (
    <div className="route-card">
      <div className="route-card-head">
        <span className="route-num">#{index + 1}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Remove hangboard exercise"
          onClick={onRemove}
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
          onChange={(v) => onChange({ ...h, hands: v })}
          columns={2}
        />
      </Field>

      <div className="two-col">
        <Field label="Reps">
          <NumberField
            value={h.reps}
            onChange={(v) => onChange({ ...h, reps: v })}
            placeholder="1"
            step="1"
            min={0}
          />
        </Field>
        <Field label="Sets">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={countDisplay}
            placeholder="5"
            onFocus={() => {
              setCountText(String(h.sets.length))
              setEditing(true)
            }}
            onChange={(e) => setCountText(e.target.value)}
            onBlur={applyCount}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </Field>
      </div>

      {Number(h.reps) > 1 && (
        <Field label="Rest between reps">
          <NumberField
            value={h.rest}
            onChange={(v) => onChange({ ...h, rest: v })}
            placeholder="3"
            unit="s"
            step="1"
            min={0}
          />
        </Field>
      )}

      <div className="set-list">
        {h.sets.map((s, i) => (
          <div className="set-row" key={i}>
            <span className="set-row-label">Set {i + 1}</span>
            <NumberField
              value={s.weight}
              onChange={(v) => setSet(i, { weight: v })}
              placeholder="0"
              unit="kg"
              min={oneHand ? -500 : 0}
            />
            <NumberField
              value={s.time}
              onChange={(v) => setSet(i, { time: v })}
              placeholder="7"
              unit="s"
              min={0}
            />
            <NumberField
              value={s.edge}
              onChange={(v) => setSet(i, { edge: v })}
              placeholder="20"
              unit="mm"
              min={0}
            />
          </div>
        ))}
      </div>
      <span className="field-hint">
        {oneHand ? 'Weight: + added · − assisted (pulley).' : 'Weight: added weight.'} Time is
        the hang in seconds. Edge is the depth in mm. The first set is the default for the rest.
      </span>
    </div>
  )
}
