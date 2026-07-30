import { useEffect, useState } from 'react'
import { Field, Scale, NumberField, Chips, Segmented } from '../ui'
import { FEELING_LABELS, gradesFor, formatGrade } from '../../lib/constants'
import { PUMP_SCALE } from '../../lib/exercises'
import { avgSpeedFrom, pacePerKm, pacePer100m } from '../../lib/format'
import { getGearSports } from '../../lib/prefs'
import { fetchGearItems, GEAR_NOUN } from '../../lib/gear'
import { TIMES_OF_DAY } from '../../lib/sessionShape'

const num = (v) => Number(v) || 0

// Step 3 fields: subjective ratings, duration, and sport-specific numbers.
//
// Field order follows how much each number actually does. Duration and finger
// RPE feed the coach; feeling feeds a trend line on the stats page and nothing
// else, so it sits below the fold rather than first.
export default function DetailsFields({ form, update, updateExtra }) {
  const isCycling = form.sport === 'cycling'
  const isClimbing = form.sport === 'climbing'
  const isRunning = form.sport === 'running'
  const isSwimming = form.sport === 'swimming'
  const isFinger = form.sport === 'finger'
  const isIndoorClimbing = isClimbing && form.location === 'indoor'
  const extra = form.extra || {}

  return (
    <div className="stack">
      <Field label="Date">
        <input
          type="date"
          value={form.date}
          onChange={(e) => update({ date: e.target.value })}
        />
      </Field>

      <Field label="Duration" required>
        <NumberField
          value={form.duration}
          onChange={(v) => update({ duration: v })}
          placeholder="60"
          unit="min"
          step="1"
        />
        {/* Common lengths, one tap instead of typing. */}
        <div className="chips duration-chips">
          {[30, 45, 60, 90, 120].map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${Number(form.duration) === m ? 'is-active' : ''}`}
              onClick={() => update({ duration: String(m) })}
            >
              {m}m
            </button>
          ))}
        </div>
      </Field>

      <Field label="RPE">
        <Scale
          min={1}
          max={10}
          value={form.rpe}
          onChange={(v) => update({ rpe: v })}
          lowLabel="Easy"
          highLabel="Max"
        />
      </Field>

      {/* Fingers and forearms get their own ratings on climbing and finger
          sessions, and they are deliberately two scales rather than one.
          Crimping strains pulleys and tendons, which recover over days; pump is
          metabolic and gone in hours. A pumpy endurance session and a session
          of hard crimping can share a whole-body RPE and leave the fingers in
          completely different states - only the first number feeds the coach's
          finger-recovery window.

          It sits directly under duration because those two are the inputs the
          coach leans on hardest. */}
      {(isClimbing || isFinger) && (
        <Field label="Finger RPE" hint={fingerRpeHint(extra.rpe_finger)} optional>
          <Scale
            min={1}
            max={10}
            value={num(extra.rpe_finger) || null}
            onChange={(v) => updateExtra({ rpe_finger: v })}
            lowLabel="Easy"
            highLabel="Max"
          />
        </Field>
      )}

      {(isClimbing || isFinger) && (
        <Field label="Pump" hint={pumpHint(extra.pump)} optional>
          <Scale
            min={1}
            max={5}
            value={num(extra.pump) || null}
            onChange={(v) => updateExtra({ pump: v })}
            lowLabel="None"
            highLabel="Maxed"
          />
        </Field>
      )}

      {/* Indoor sessions have no route log, so this is the only way the
          coach can see that the session had real attempts near your limit.
          Without it, a mostly-indoor climber's difficulty is invisible
          except through finger RPE. */}
      {isIndoorClimbing && (
        <Field
          label="Attempts within a grade of your limit"
          hint="Counts toward the finger load the same way logged outdoor attempts do. Leave blank if none."
          optional
        >
          <NumberField
            value={extra.near_limit_attempts ?? ''}
            onChange={(v) => updateExtra({ near_limit_attempts: v })}
            placeholder="0"
            step="1"
          />
        </Field>
      )}

      {/* Coarse on purpose, and enough to stop counting calendar days: a
          Monday evening to a Wednesday morning is 34 hours, and calling
          that two days let the recovery window clear early. */}
      <Field
        label="Time of day"
        hint="Used to count the recovery window in hours instead of days."
        optional
      >
        <Segmented
          options={TIMES_OF_DAY.map((t) => ({ key: t.key, label: t.label }))}
          value={extra.time_of_day || null}
          onChange={(v) => updateExtra({ time_of_day: v })}
          columns={3}
        />
      </Field>

      <Field label="Feeling" hint={feelingHint(form.feeling)}>
        <Scale
          min={1}
          max={5}
          value={form.feeling}
          onChange={(v) => update({ feeling: v })}
          lowLabel="Weak"
          highLabel="Strong"
        />
      </Field>

      {/* Warm-up and rehab ride along on any sport: minutes + a short note.
          Display-only extras - they never split hours or add calendar dots. */}
      <Field label="Warm-up" optional>
        <div className="wr-row">
          <NumberField
            value={extra.warmup_minutes}
            onChange={(v) => updateExtra({ warmup_minutes: v })}
            placeholder="0"
            unit="min"
            step="5"
          />
          <input
            type="text"
            value={extra.warmup_note ?? ''}
            onChange={(e) => updateExtra({ warmup_note: e.target.value })}
            placeholder="what you did"
          />
        </div>
      </Field>

      <Field label="Rehab" optional>
        <div className="wr-row">
          <NumberField
            value={extra.rehab_minutes}
            onChange={(v) => updateExtra({ rehab_minutes: v })}
            placeholder="0"
            unit="min"
            step="5"
          />
          <input
            type="text"
            value={extra.rehab_note ?? ''}
            onChange={(e) => updateExtra({ rehab_note: e.target.value })}
            placeholder="what you did"
          />
        </div>
      </Field>

      <GearPicker sport={form.sport} extra={extra} updateExtra={updateExtra} />

      {isCycling && <CyclingFields form={form} updateExtra={updateExtra} />}
      {isClimbing && <ClimbingFields form={form} updateExtra={updateExtra} />}
      {isRunning && <RunningFields form={form} updateExtra={updateExtra} />}
      {isSwimming && <SwimmingFields form={form} updateExtra={updateExtra} />}
    </div>
  )
}

// Which bike / pair of shoes the session was on (extra.gear_id). Only shows
// when gear logging is on for the sport AND there's a real choice - with one
// item (or none) the main one is assumed and nothing needs asking. Sessions
// that never stored a choice fall to the main item in the wear math, so the
// default selection here is just made visible, not stored.
function GearPicker({ sport, extra, updateExtra }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    if (!getGearSports().includes(sport)) {
      setItems(null)
      return undefined
    }
    fetchGearItems()
      .then((all) => alive && setItems(all.filter((i) => i.sport === sport)))
      .catch(() => alive && setItems(null))
    return () => {
      alive = false
    }
  }, [sport])

  if (!items || items.length < 2) return null

  const main = items.find((i) => i.is_main)
  const selected = extra.gear_id ?? main?.id ?? null

  return (
    <Field label={sport === 'cycling' ? 'Bike' : 'Shoes'}>
      <Segmented
        options={items.map((i) => ({ key: i.id, label: i.name }))}
        value={selected}
        onChange={(v) => updateExtra({ gear_id: v })}
        columns={2}
      />
    </Field>
  )
}

function RunningFields({ form, updateExtra }) {
  const e = form.extra || {}
  const pace = pacePerKm(e.distance_km, form.duration)
  return (
    <>
      <div className="two-col">
        <Field label="Distance" hint={pace ? `${pace} /km` : null}>
          <NumberField
            value={e.distance_km}
            onChange={(v) => updateExtra({ distance_km: v })}
            placeholder="0"
            unit="km"
          />
        </Field>
        <Field label="Elevation" optional>
          <NumberField
            value={e.elevation_m}
            onChange={(v) => updateExtra({ elevation_m: v })}
            placeholder="0"
            unit="m"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Avg HR" optional>
          <NumberField
            value={e.avg_hr}
            onChange={(v) => updateExtra({ avg_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
        <Field label="Max HR" optional>
          <NumberField
            value={e.max_hr}
            onChange={(v) => updateExtra({ max_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Cadence" optional>
          <NumberField
            value={e.cadence}
            onChange={(v) => updateExtra({ cadence: v })}
            placeholder="0"
            unit="spm"
            step="1"
          />
        </Field>
        <Field label="Calories" optional>
          <NumberField
            value={e.calories}
            onChange={(v) => updateExtra({ calories: v })}
            placeholder="0"
            unit="kcal"
            step="1"
          />
        </Field>
      </div>
    </>
  )
}

function SwimmingFields({ form, updateExtra }) {
  const e = form.extra || {}
  const pace = pacePer100m(e.distance_m, form.duration)
  return (
    <>
      <Field label="Distance" hint={pace ? `${pace} /100m` : null}>
        <NumberField
          value={e.distance_m}
          onChange={(v) => updateExtra({ distance_m: v })}
          placeholder="0"
          unit="m"
          step="50"
        />
      </Field>

      <div className="two-col">
        <Field label="Avg HR" optional>
          <NumberField
            value={e.avg_hr}
            onChange={(v) => updateExtra({ avg_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
        <Field label="Max HR" optional>
          <NumberField
            value={e.max_hr}
            onChange={(v) => updateExtra({ max_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
      </div>

      <Field label="Calories" optional>
        <NumberField
          value={e.calories}
          onChange={(v) => updateExtra({ calories: v })}
          placeholder="0"
          unit="kcal"
          step="1"
        />
      </Field>
    </>
  )
}

function feelingHint(v) {
  return v ? FEELING_LABELS[v] : null
}

// Anchored on purpose. An unanchored self-report scale drifts over months, and
// this one feeds the finger-recovery model, so what "8" means has to stay put.
const FINGER_RPE_ANCHORS = {
  2: '2 · jugs, fingers barely involved',
  4: '4 · noticeable, nowhere near failing',
  6: '6 · small holds, working hard',
  8: '8 · failing ON holds, not on moves',
  10: '10 · absolute max, skin and tendons feel it',
}

function fingerRpeHint(v) {
  const n = Number(v) || 0
  if (!n) return 'How hard it was on your fingers: crimping, small holds, pockets. 8 = failing on holds, not on moves.'
  const keys = Object.keys(FINGER_RPE_ANCHORS).map(Number)
  const nearest = keys.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
  return FINGER_RPE_ANCHORS[nearest]
}

function pumpHint(v) {
  const p = PUMP_SCALE.find((x) => x.level === Number(v))
  return p ? `${p.label} · ${p.quality}` : 'Forearm pump: the endurance side, separate from finger load'
}

function CyclingFields({ form, updateExtra }) {
  const e = form.extra || {}
  const suggested = avgSpeedFrom(e.distance_km, form.duration)
  return (
    <>
      <Field label="Ride location">
        <Segmented
          options={[
            { key: 'outdoor', label: 'Outdoor' },
            { key: 'indoor', label: 'Indoor / trainer' },
          ]}
          value={e.indoor ? 'indoor' : 'outdoor'}
          onChange={(v) => updateExtra({ indoor: v === 'indoor' })}
          columns={2}
        />
      </Field>

      <div className="two-col">
        <Field label="Distance">
          <NumberField
            value={e.distance_km}
            onChange={(v) => updateExtra({ distance_km: v })}
            placeholder="0"
            unit="km"
          />
        </Field>
        <Field label="Elevation">
          <NumberField
            value={e.elevation_m}
            onChange={(v) => updateExtra({ elevation_m: v })}
            placeholder="0"
            unit="m"
          />
        </Field>
      </div>

      <Field label="Avg speed" optional>
        <div className="inline-row">
          <NumberField
            value={e.avg_speed}
            onChange={(v) => updateExtra({ avg_speed: v })}
            placeholder={suggested ? String(suggested) : '0'}
            unit="km/h"
          />
          {suggested ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => updateExtra({ avg_speed: suggested })}
            >
              ↺ from time
            </button>
          ) : null}
        </div>
      </Field>

      <div className="two-col">
        <Field label="Max speed" optional>
          <NumberField
            value={e.max_speed}
            onChange={(v) => updateExtra({ max_speed: v })}
            placeholder="0"
            unit="km/h"
          />
        </Field>
        <Field label="Cadence" optional>
          <NumberField
            value={e.cadence}
            onChange={(v) => updateExtra({ cadence: v })}
            placeholder="0"
            unit="rpm"
            step="1"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Avg power" optional>
          <NumberField
            value={e.avg_power}
            onChange={(v) => updateExtra({ avg_power: v })}
            placeholder="0"
            unit="W"
            step="1"
          />
        </Field>
        <Field label="Norm power" optional>
          <NumberField
            value={e.norm_power}
            onChange={(v) => updateExtra({ norm_power: v })}
            placeholder="0"
            unit="W"
            step="1"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Avg HR" optional>
          <NumberField
            value={e.avg_hr}
            onChange={(v) => updateExtra({ avg_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
        <Field label="Max HR" optional>
          <NumberField
            value={e.max_hr}
            onChange={(v) => updateExtra({ max_hr: v })}
            placeholder="0"
            unit="bpm"
            step="1"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Training load" optional>
          <NumberField
            value={e.training_load}
            onChange={(v) => updateExtra({ training_load: v })}
            placeholder="0"
            unit="TSS"
            step="1"
          />
        </Field>
        <Field label="Intensity (IF)" optional>
          <NumberField
            value={e.if_factor}
            onChange={(v) => updateExtra({ if_factor: v })}
            placeholder="0.00"
            step="0.01"
          />
        </Field>
      </div>

      <div className="two-col">
        <Field label="Work" optional>
          <NumberField
            value={e.work_kj}
            onChange={(v) => updateExtra({ work_kj: v })}
            placeholder="0"
            unit="kJ"
            step="1"
          />
        </Field>
        <Field label="Calories" optional>
          <NumberField
            value={e.calories}
            onChange={(v) => updateExtra({ calories: v })}
            placeholder="0"
            unit="kcal"
            step="1"
          />
        </Field>
      </div>
    </>
  )
}

function ClimbingFields({ form, updateExtra }) {
  const e = form.extra || {}
  // Match selection against the canonical case for the subtype so grades saved
  // before the boulder=UPPERCASE convention still light up (and re-save fixed).
  const grades = (e.grades || []).map((g) => formatGrade(g, form.subtype))
  return (
    <Field
      label="Grades worked"
      hint="French grades"
      optional
    >
      <Chips
        options={gradesFor(form.subtype)}
        value={grades}
        onChange={(next) => updateExtra({ grades: next, grading_system: 'french' })}
      />
    </Field>
  )
}
