import { useEffect, useState } from 'react'
import { ChipSelect, Field } from '../ui'
import { fetchSessions } from '../../lib/sessions'
import { fetchInjuries } from '../../lib/health'
import { fetchIcuFitnessData } from '../../lib/fitness'
import { fetchCoachProfile, fetchGoals } from '../../lib/coachProfile'
import { fetchWellness, fetchOstrc } from '../../lib/wellness'
import { coachReadout } from '../../lib/coach'
import { getCoachModel } from '../../lib/prefs'
import {
  FINGER_EXERCISES,
  BOULDER_EXERCISES,
  ROPE_EXERCISES,
  GYM_EXERCISES,
  STRETCH_EXERCISES,
  EXERCISE_MAP,
} from '../../lib/exercises'
import { todayISO } from '../../lib/format'

// Sports the plan's library covers - the question isn't asked on a bike ride.
export const COACH_SPORTS = ['climbing', 'finger', 'strength']

const GROUPS = [
  ['🤏 Finger', FINGER_EXERCISES],
  ['🪨 Bouldering', BOULDER_EXERCISES],
  ['🧗 Rope', ROPE_EXERCISES],
  ['🏋 Strength', GYM_EXERCISES],
  ['🧘 Mobility', STRETCH_EXERCISES],
]

// "Was this the planned session?" - only rendered while the coach is on.
// Naming the session from the library is what lets the coach read the log
// back: the named exercise's finger cost feeds the recovery window, and the
// plan ticks the day off with what was actually done, not just "a session".
//
// Stored as extra.coach = { followed: 'planned' | 'other', type, exercise }.
export default function CoachPlanField({ form, updateExtra }) {
  const coach = form.extra?.coach || null
  const isToday = form.date === todayISO()
  // Today's suggestion, so "as planned" can say what the plan actually was.
  // Lazy: fetched only when this field renders, absent for back-dated sessions.
  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(isToday)

  useEffect(() => {
    if (!isToday) {
      setPlanLoading(false)
      return undefined
    }
    let alive = true
    Promise.allSettled([
      fetchSessions(),
      fetchInjuries(),
      fetchIcuFitnessData(),
      fetchCoachProfile(),
      fetchGoals(),
      fetchWellness(),
      fetchOstrc(),
    ]).then(([s, inj, fit, prof, gls, well, ost]) => {
      if (!alive) return
      const val = (r, fb) => (r.status === 'fulfilled' ? r.value : fb)
      const p = val(prof, null)
      const readout = coachReadout(val(s, []), val(inj, []), val(fit, {})?.wellness ?? null, {
        model: getCoachModel(),
        profile: p?.missingTable ? null : p,
        goals: val(gls, []),
        wellness: val(well, []),
        ostrc: val(ost, []),
      })
      setPlan(readout.suggestion)
      setPlanLoading(false)
    })
    return () => {
      alive = false
    }
  }, [isToday])

  const setCoach = (patch) => updateExtra({ coach: patch })

  const choose = (followed) => {
    if (!followed) {
      setCoach(null)
      return
    }
    if (followed === 'planned') {
      setCoach({
        followed: 'planned',
        type: plan?.key ?? null,
        exercise: plan?.exercises?.[0]?.id ?? null,
      })
    } else {
      setCoach({ followed: 'other', type: null, exercise: coach?.exercise ?? null })
    }
  }

  // Back-dated sessions can't be compared to "today's plan" - just ask which
  // library session it was, which is the part the coach can actually use.
  if (!isToday) {
    return (
      <Field
        label="Which session was it?"
        hint="Optional. Naming it from the library lets the coach count it correctly — a max hangboard day and easy mileage load the fingers very differently."
        optional
      >
        <ExerciseSelect
          value={coach?.exercise ?? ''}
          onChange={(id) =>
            setCoach(id ? { followed: 'other', type: null, exercise: id } : null)
          }
        />
      </Field>
    )
  }

  return (
    <div className="stack">
      <Field label="Did you do the planned session?" optional>
        <ChipSelect
          options={[
            {
              key: 'planned',
              label: planLoading
                ? 'The planned session'
                : plan
                  ? `As planned · ${plan.type.emoji} ${plan.type.label}`
                  : 'As planned',
            },
            { key: 'other', label: 'Something else' },
          ]}
          value={coach?.followed ?? null}
          onChange={choose}
        />
      </Field>

      {coach?.followed === 'planned' && plan && plan.exercises.length > 0 && (
        <Field label="Which one?" hint="The plan's suggestions for today.">
          <select
            value={coach.exercise ?? ''}
            onChange={(e) =>
              setCoach({ ...coach, exercise: e.target.value || null })
            }
          >
            {plan.exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.id} · {ex.name}
              </option>
            ))}
            <option value="">Just the session type, no named exercise</option>
          </select>
        </Field>
      )}

      {coach?.followed === 'other' && (
        <Field
          label="What did you do instead?"
          hint="From the exercise library, so the coach understands what the session was."
        >
          <ExerciseSelect
            value={coach.exercise ?? ''}
            onChange={(id) => setCoach({ ...coach, exercise: id || null })}
          />
        </Field>
      )}

      {coach?.exercise && EXERCISE_MAP[coach.exercise] && (
        <p className="muted small">
          {EXERCISE_MAP[coach.exercise].how || 'In the library under ' + coach.exercise + '.'}
        </p>
      )}
    </div>
  )
}

function ExerciseSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {GROUPS.map(([label, list]) => (
        <optgroup label={label} key={label}>
          {list.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.id} · {ex.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
