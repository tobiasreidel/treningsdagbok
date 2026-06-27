import { Field, Scale, NumberField, Chips, Segmented } from '../ui'
import { FEELING_LABELS, gradesFor } from '../../lib/constants'
import { avgSpeedFrom, pacePerKm, pacePer100m } from '../../lib/format'

// Step 3 fields: subjective ratings, duration, and sport-specific numbers.
export default function DetailsFields({ form, update, updateExtra }) {
  const isCycling = form.sport === 'cycling'
  const isClimbing = form.sport === 'climbing'
  const isRunning = form.sport === 'running'
  const isSwimming = form.sport === 'swimming'

  return (
    <div className="stack">
      <Field label="Date">
        <input
          type="date"
          value={form.date}
          onChange={(e) => update({ date: e.target.value })}
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

      <Field label="RPE" hint="Perceived exertion">
        <Scale
          min={1}
          max={10}
          value={form.rpe}
          onChange={(v) => update({ rpe: v })}
          lowLabel="Easy"
          highLabel="Max"
        />
      </Field>

      <Field label="Duration">
        <NumberField
          value={form.duration}
          onChange={(v) => update({ duration: v })}
          placeholder="60"
          unit="min"
          step="1"
        />
      </Field>

      {isCycling && <CyclingFields form={form} updateExtra={updateExtra} />}
      {isClimbing && <ClimbingFields form={form} updateExtra={updateExtra} />}
      {isRunning && <RunningFields form={form} updateExtra={updateExtra} />}
      {isSwimming && <SwimmingFields form={form} updateExtra={updateExtra} />}
    </div>
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
  const grades = e.grades || []
  return (
    <Field
      label="Grades worked"
      hint="French grades for a general sense of the session"
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
