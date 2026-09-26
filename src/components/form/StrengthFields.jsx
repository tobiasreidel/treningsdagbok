import { useState } from 'react'
import { Field, NumberField, Segmented } from '../ui'
import { SPORTS, STRENGTH_EXERCISES, exerciseLabel, matchExercise } from '../../lib/constants'
import { emptyExercise, emptyHang, normalizeHang, isLegacyHangSet } from '../../lib/formState'
import { GRIPS } from '../../lib/fingerLoad'
import { getBodyweight, getCustomExercises, setCustomExercises } from '../../lib/prefs'

// The strength + finger-training module. Two panels (lifts, and campus/
// hangboard), each switched on by tapping it, so a combined workout - finger
// and strength in one gym visit, or blocks inside an indoor climb - is logged
// as one session as you go. Both start closed: most indoor climbs have
// neither, and a form that opens on "add your lifts" asks a question nobody
// asked. A panel that already holds something (editing, or a prefill from the
// coach) opens by itself, because hiding logged sets behind a tap looks like
// they were lost.
//
// Time fields carve the minutes that belong to the *other* sport(s) out of the
// session's duration, and sit inside their panel:
//   • indoor climbing  → strength + finger time fields (rest stays climbing)
//   • strength session → a finger time field (rest stays strength)
//   • finger session   → a strength time field (rest stays finger)
// Everything is stored under form.extra ({ strength: [...], finger: {...},
// strength_minutes, finger_minutes }).
export default function StrengthFields({ form, updateExtra }) {
  const e = form.extra || {}
  const finger = e.finger || { campus: false, hangboard: [] }
  const liftCount = (e.strength || []).length
  const fingerCount = (finger.hangboard || []).length + (finger.campus ? 1 : 0)
  const [open, setOpen] = useState(() => ({
    strength: liftCount > 0 || Number(e.strength_minutes) > 0,
    finger: fingerCount > 0 || !!finger.pockets || Number(e.finger_minutes) > 0,
  }))
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }))

  const panels = [
    { key: 'strength', label: '🏋 Strength', count: liftCount },
    { key: 'finger', label: '🤏 Finger', count: fingerCount },
  ]

  return (
    <div className="stack">
      {/* Toggles, not tabs: both can be open at once. Closing one hides it
          and keeps what is in it, and the count says it is still there. */}
      <div className="segmented" style={{ '--cols': 2 }}>
        {panels.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`seg-btn ${open[p.key] ? 'is-active' : ''}`}
            aria-pressed={open[p.key]}
            onClick={() => toggle(p.key)}
          >
            <span>
              {p.label}
              {p.count > 0 ? ` · ${p.count}` : ''}
            </span>
          </button>
        ))}
      </div>
      {!open.strength && !open.finger && (
        <p className="muted small">Tap what you did to log it.</p>
      )}

      {open.strength && (
        <StrengthPanel
          exercises={e.strength || []}
          minutes={form.sport !== 'strength' ? e.strength_minutes ?? '' : null}
          restLabel={SPORTS[form.sport]?.label.toLowerCase() || 'session'}
          updateExtra={updateExtra}
        />
      )}
      {open.finger && (
        <FingerPanel
          finger={finger}
          minutes={form.sport !== 'finger' ? e.finger_minutes ?? '' : null}
          restLabel={SPORTS[form.sport]?.label.toLowerCase() || 'session'}
          updateExtra={updateExtra}
        />
      )}
    </div>
  )
}

// The minutes of the session that belong to this panel's sport. Null means
// the session is that sport, so there is nothing to carve out.
function PanelMinutes({ label, sportLabel, restLabel, value, onChange }) {
  if (value === null) return null
  return (
    <Field
      label={label}
      hint={`Counted as ${sportLabel}. The rest of the session stays ${restLabel} time.`}
    >
      <NumberField value={value} onChange={onChange} placeholder="0" unit="min" step="5" />
    </Field>
  )
}

const NEW_EXERCISE = '__new__'

// Lifts: multiple exercises, each with sets · reps · weight. The list is the
// built-ins plus your own; "Your own…" adds one there and then, and it stays
// on the list for next time.
function StrengthPanel({ exercises, minutes, restLabel, updateExtra }) {
  const [customs, setCustoms] = useState(getCustomExercises)
  // The row whose exercise is being typed in, and what has been typed.
  const [naming, setNaming] = useState(null)
  const [name, setName] = useState('')

  const setEx = (i, patch) =>
    updateExtra({ strength: exercises.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const addEx = () => updateExtra({ strength: [...exercises, emptyExercise()] })
  const removeEx = (i) => {
    if (naming === i) setNaming(null)
    updateExtra({ strength: exercises.filter((_, idx) => idx !== i) })
  }

  const choose = (i, value) => {
    if (value === NEW_EXERCISE) {
      setNaming(i)
      setName('')
      return
    }
    setEx(i, { exercise: value })
  }

  const saveName = (i) => {
    const key = matchExercise(name, customs)
    if (!key) return
    const known = STRENGTH_EXERCISES.some((o) => o.key === key) || customs.includes(key)
    if (!known) {
      const next = [...customs, key]
      setCustomExercises(next)
      setCustoms(next)
    }
    setEx(i, { exercise: key })
    setNaming(null)
  }

  // An exercise on a session that is on neither list (removed since, or
  // logged before this list existed) still has to show as what it was.
  const optionsFor = (current) => {
    const opts = [
      ...STRENGTH_EXERCISES.map((o) => ({ key: o.key, label: o.label })),
      ...customs.map((c) => ({ key: c, label: c })),
    ]
    if (current && !opts.some((o) => o.key === current)) {
      opts.push({ key: current, label: exerciseLabel(current) })
    }
    return opts
  }

  return (
    <div className="stack">
      <PanelMinutes
        label="Time on strength"
        sportLabel="strength"
        restLabel={restLabel}
        value={minutes}
        onChange={(v) => updateExtra({ strength_minutes: v })}
      />

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
            {naming === i ? (
              <div className="wr-row">
                <input
                  type="text"
                  value={name}
                  maxLength={60}
                  autoFocus
                  placeholder="e.g. Bench press"
                  onChange={(ev) => setName(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault()
                      saveName(i)
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => setNaming(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!name.trim()}
                  onClick={() => saveName(i)}
                >
                  Add
                </button>
              </div>
            ) : (
              <select value={ex.exercise} onChange={(ev) => choose(i, ev.target.value)}>
                {optionsFor(ex.exercise).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
                <option value={NEW_EXERCISE}>＋ Your own…</option>
              </select>
            )}
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
function FingerPanel({ finger, minutes, restLabel, updateExtra }) {
  const hangs = finger.hangboard || []
  const bodyweight = getBodyweight()
  const setFinger = (patch) => updateExtra({ finger: { ...finger, ...patch } })
  const setHang = (i, next) =>
    setFinger({ hangboard: hangs.map((x, idx) => (idx === i ? next : x)) })
  const addHang = () => setFinger({ hangboard: [...hangs, emptyHang()] })
  const removeHang = (i) => setFinger({ hangboard: hangs.filter((_, idx) => idx !== i) })

  // Back-compat: campus used to be a boolean; true now reads as a campus board.
  const campusValue = finger.campus === true ? 'board' : finger.campus || 'none'

  return (
    <div className="stack">
      <PanelMinutes
        label="Time on finger training"
        sportLabel="finger training"
        restLabel={restLabel}
        value={minutes}
        onChange={(v) => updateExtra({ finger_minutes: v })}
      />

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

      {/* Two-finger and pocket work carries pulley and lumbrical risk out of
          proportion to how hard it feels, and nothing else in the log reveals
          it - so the coach can't see it unless it's asked for. */}
      <label className="toggle-row">
        <span className="toggle-label">
          <span className="toggle-emoji">🤞</span>
          Two-finger / pocket work
        </span>
        <span className="switch">
          <input
            type="checkbox"
            checked={!!finger.pockets}
            onChange={() => setFinger({ pockets: !finger.pockets })}
          />
          <span className="switch-track" />
          <span className="switch-thumb" />
        </span>
      </label>

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
              bodyweight={bodyweight}
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
function HangEditor({ hang, index, onChange, onRemove, bodyweight }) {
  const h = normalizeHang(hang)
  const legacySets = h.sets.filter(isLegacyHangSet).length
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
    const template = h.sets[0] || { load_total_kg: '', time: '', edge: '' }
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

      {/* Grip matters: half-crimp and open-hand maxima commonly differ by
          ~20%, so a session logged without one can only be compared against a
          generic number. */}
      <Field label="Grip">
        <select value={h.grip} onChange={(e) => onChange({ ...h, grip: e.target.value })}>
          {GRIPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
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
              value={s.load_total_kg}
              onChange={(v) => setSet(i, { load_total_kg: v, weight: '' })}
              placeholder={bodyweight ? String(Math.round(bodyweight)) : 'total'}
              unit="kg"
              min={0}
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
        <strong>Load is total kilos, your bodyweight included.</strong> Hanging at
        bodyweight with 10 kg on the harness
        {bodyweight ? ` is ${Math.round(bodyweight) + 10} kg` : ' is bodyweight + 10'}; hanging
        with 10 kg taken off by a pulley
        {bodyweight ? ` is ${Math.round(bodyweight) - 10} kg` : ' is bodyweight − 10'}. This
        matches how your max is recorded, so “85% of max” means the same thing in both places.
        Time is the hang in seconds, edge the depth in mm. The first set is the default for the
        rest.
      </span>
      {legacySets > 0 && (
        <span className="field-hint">
          {legacySets} set{legacySets === 1 ? '' : 's'} in this session were logged as{' '}
          <em>added</em> weight by an older version.{' '}
          {bodyweight
            ? 'They are read as bodyweight + added.'
            : 'Add your bodyweight in the coach setup so they can be read at all.'}
        </span>
      )}
    </div>
  )
}
