import { useEffect, useState } from 'react'
import { ChipSelect, Field } from '../ui'
import { loadCoachInputs, readoutFrom } from '../../lib/coachData'
import {
  FINGER_EXERCISES,
  BOULDER_EXERCISES,
  ROPE_EXERCISES,
  GYM_EXERCISES,
  STRETCH_EXERCISES,
  EXERCISE_MAP,
} from '../../lib/exercises'
import { todayISO } from '../../lib/format'
import { BODY_AREAS } from '../../lib/wellness'

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
// back: the named session's finger cost feeds the recovery window, and the
// plan ticks the day off with what was actually done, not just "a session".
//
// A list, not one name. An afternoon at the gym is routinely slab, then
// campus, then 4x4s, and a mobility session is a routine of stretches - it was
// never true that a session was one library entry. The coach takes the hardest
// part as the floor rather than summing them (see fingerDose), so naming
// everything you did makes the recovery window more accurate, not less.
//
// Stored as extra.coach = { followed: 'planned' | 'other', type, exercises: [] }.
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
    // Same inputs as /coach, so "as planned" means the session the coach page
    // actually showed you - including the one you picked yourself.
    loadCoachInputs().then((inputs) => {
      if (!alive) return
      setPlan(readoutFrom(inputs).suggestion)
      setPlanLoading(false)
    })
    return () => {
      alive = false
    }
  }, [isToday])

  // Sessions logged before this was a list carry a single `exercise`.
  const chosen = Array.isArray(coach?.exercises)
    ? coach.exercises
    : coach?.exercise
      ? [coach.exercise]
      : []

  const setCoach = (patch) => updateExtra({ coach: patch })

  const setChosen = (ids) => {
    if (!coach) {
      setCoach(ids.length ? { followed: 'other', type: null, exercises: ids } : null)
      return
    }
    setCoach({ ...coach, exercise: undefined, exercises: ids })
  }

  const choose = (followed) => {
    if (!followed) {
      setCoach(null)
      return
    }
    if (followed === 'planned') {
      setCoach({
        followed: 'planned',
        type: plan?.key ?? null,
        // The picked session to start with; add the rest of what you did.
        exercises: plan?.exercises?.[0] ? [plan.exercises[0].id] : [],
      })
    } else {
      setCoach({ followed: 'other', type: null, exercises: chosen })
    }
  }

  // Back-dated sessions can't be compared to "today's plan" - just ask which
  // library sessions it was, which is the part the coach can actually use.
  // Nor can a session on a day you are ill: the plan for it is rest, so there
  // is no planned session it could have been.
  if (!isToday || plan?.key === 'sick') {
    return (
      <div className="stack">
        <Field
          label="Which sessions were these?"
          hint="You can name more than one. A max hangboard day and easy mileage load the fingers very differently."
          optional
        >
          <ExercisePicker
            value={chosen}
            onChange={(ids) =>
              ids.length
                ? setCoach({ ...(coach || {}), followed: coach?.followed || 'other', type: coach?.type ?? null, exercises: ids })
                : setCoach(null)
            }
          />
        </Field>
        {coach && chosen.length > 0 && <OutcomeField coach={coach} setCoach={setCoach} />}
      </div>
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

      {coach && (
        <Field
          label={coach.followed === 'planned' ? 'What did it consist of?' : 'What did you do?'}
          hint={
            coach.followed === 'planned'
              ? "Today's suggestions are at the top. Add anything else you did in the same session."
              : 'From the exercise library, so the coach understands what the session was.'
          }
        >
          <ExercisePicker
            value={chosen}
            onChange={setChosen}
            suggested={coach.followed === 'planned' ? plan?.sheet?.parts?.filter((p) => p.role !== 'warmup' && p.exercise).map((p) => p.exercise) ?? plan?.exercises : null}
          />
        </Field>
      )}

      {coach && chosen.length > 0 && <OutcomeField coach={coach} setCoach={setCoach} />}
    </div>
  )
}

// How the session went, in four words. This is the answer a coach asks for at
// the door, and it is what moves the next prescription: two sessions to plan
// at a load earn the next step, a cut-short one holds it, pain drops it and
// routes the week around the area. Optional, because a session without an
// answer still counts; but the hangboard load cannot progress from a blank.
const OUTCOMES = [
  { key: 'nailed', label: 'Nailed it', hint: 'Every set, with something in reserve. Two of these at a load and it goes up.' },
  { key: 'done', label: 'As planned', hint: 'Did what it said. The load holds until it has gone to plan twice.' },
  { key: 'short', label: 'Cut short', hint: 'Stopped early, or dropped sets. The load stays where it is next time.' },
  { key: 'pain', label: 'Pain', hint: 'Stopped, or should have, for pain. The coach routes around the area for a week and the load comes back lighter.' },
]

function OutcomeField({ coach, setCoach }) {
  const current = OUTCOMES.find((o) => o.key === coach.outcome) || null
  return (
    <div className="stack">
      <Field
        label="How did it go?"
        hint={current ? current.hint : 'What the next prescription is built from.'}
        optional
      >
        <ChipSelect
          options={OUTCOMES.map((o) => ({ key: o.key, label: o.label }))}
          value={coach.outcome ?? null}
          onChange={(v) =>
            setCoach({
              ...coach,
              outcome: v || undefined,
              pain_area: v === 'pain' ? coach.pain_area : undefined,
            })
          }
        />
      </Field>
      {coach.outcome === 'pain' && (
        <Field label="Where?" hint="Fingers is assumed if you leave it blank.">
          <ChipSelect
            options={BODY_AREAS.map((a) => ({ key: a.key, label: `${a.emoji} ${a.label}` }))}
            value={coach.pain_area ?? null}
            onChange={(v) => setCoach({ ...coach, pain_area: v || undefined })}
          />
          <span className="auth-error small">
            Pain is the real signal. Persistent pain is a reason to see a professional, not
            to adjust a plan.
          </span>
        </Field>
      )}
    </div>
  )
}

// Pick any number of library sessions: chosen ones show as removable rows, and
// the select below adds another. A 40-entry library is too long for a chip
// grid, and too long to scan twice - so what you picked stays visible while
// the list to pick from stays collapsed.
function ExercisePicker({ value, onChange, suggested }) {
  const add = (id) => {
    if (id && !value.includes(id)) onChange([...value, id])
  }
  const remove = (id) => onChange(value.filter((x) => x !== id))

  // Today's suggestions as one-tap chips, minus what's already chosen.
  const quick = (suggested || []).filter((ex) => !value.includes(ex.id))

  return (
    <div className="stack ex-picker">
      {value.length > 0 && (
        <div className="stack">
          {value.map((id) => {
            const ex = EXERCISE_MAP[id]
            return (
              <div className="picked-row" key={id}>
                <div className="goal-main">
                  <span className="goal-title">
                    {id}
                    {ex ? ` · ${ex.name}` : ''}
                  </span>
                  {ex?.how && <span className="muted small">{ex.how}</span>}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => remove(id)}
                  aria-label={`Remove ${ex?.name || id}`}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {quick.length > 0 && (
        <div className="chips">
          {quick.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="chip"
              onClick={() => add(ex.id)}
            >
              + {ex.id} · {ex.name}
            </button>
          ))}
        </div>
      )}

      <select value="" onChange={(e) => add(e.target.value)}>
        <option value="">{value.length ? '+ Add another…' : 'Choose from the library…'}</option>
        {GROUPS.map(([label, list]) => (
          <optgroup label={label} key={label}>
            {list
              .filter((ex) => !value.includes(ex.id))
              .map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.id} · {ex.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
