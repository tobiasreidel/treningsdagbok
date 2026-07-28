import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { Field, Scale, Segmented, PillRow, useBack } from '../components/ui'
import SignalBlock from '../components/SignalBlock'
import { coachReadout, rollingPlan } from '../lib/coach'
import { SPORTS } from '../lib/constants'

// A dev-only bench for the coach engine.
//
// The engine is a pure function from logged history to a prescription, but the
// only way to see it respond used to be to log real sessions for weeks. So you
// could not watch a constant take effect, and four bugs sat in the signals for
// months because nobody had a way to look at them changing. This screen builds a
// synthetic athlete from a handful of sliders and shows every signal at once.
//
// Not linked from anywhere in the app on purpose: /coach/simulator, typed.

const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd')

const SHAPES = [
  { key: 'indoor', label: 'Indoor bouldering' },
  { key: 'hangboard', label: 'Hangboard + climbing' },
  { key: 'rope', label: 'Rope' },
  { key: 'mixed', label: 'Mixed' },
]

// One synthetic history. Everything is deliberately crude: the point is to move
// one dial and watch the readout, not to imitate a real diary.
function buildSessions({ shape, perWeek, weeks, fingerRpe, bodyRpe, duration, hangPct, maxKg }) {
  const out = []
  const days = [1, 3, 5, 2, 4, 6, 7].slice(0, perWeek)
  for (let w = 0; w < weeks; w += 1) {
    days.forEach((wd, i) => {
      const daysAgo = w * 7 + ((new Date().getDay() + 6) % 7) - (wd - 1)
      if (daysAgo < 0) return
      const date = iso(daysAgo)
      const wantsHang = shape === 'hangboard' && i % 2 === 0
      const wantsRope = shape === 'rope' || (shape === 'mixed' && i % 3 === 2)
      if (wantsHang) {
        out.push({
          id: `h${w}-${i}`,
          date,
          sport: 'finger',
          duration: 40,
          rpe: 6,
          extra: {
            schema_version: 4,
            rpe_finger: fingerRpe,
            time_of_day: 'evening',
            finger: {
              hangboard: [
                {
                  hands: 'two',
                  grip: 'halfcrimp',
                  reps: 1,
                  sets: Array.from({ length: 4 }, () => ({
                    load_total_kg: Math.round((maxKg * hangPct) / 100),
                    time: 10,
                    edge: 20,
                  })),
                },
              ],
            },
          },
        })
        return
      }
      out.push({
        id: `s${w}-${i}`,
        date,
        sport: 'climbing',
        subtype: wantsRope ? 'sport' : 'bouldering',
        location: 'indoor',
        duration,
        rpe: bodyRpe,
        extra: {
          schema_version: 4,
          rpe_finger: fingerRpe,
          pump: wantsRope ? 4 : 3,
          time_of_day: 'evening',
        },
      })
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

function buildWellness({ weeks, sleep, fatigue }) {
  const out = []
  for (let d = Math.min(weeks * 7, 60) - 1; d >= 0; d -= 1) {
    out.push({ date: iso(d), sleep, fatigue, soreness: fatigue, stress: fatigue })
  }
  return out
}

export default function CoachSimulator() {
  const back = useBack('/coach')
  const [shape, setShape] = useState('indoor')
  const [perWeek, setPerWeek] = useState(3)
  const [weeks, setWeeks] = useState(10)
  const [fingerRpe, setFingerRpe] = useState(6)
  const [bodyRpe, setBodyRpe] = useState(7)
  const [duration, setDuration] = useState(90)
  const [hangPct, setHangPct] = useState(85)
  const [sleep, setSleep] = useState(3)
  const [fatigue, setFatigue] = useState(3)
  const [years, setYears] = useState(6)
  const [age, setAge] = useState(30)

  const maxKg = 100
  const profile = useMemo(
    () => ({
      sessions_week: perWeek,
      max_boulder_indoor: '7A',
      flash_boulder: '6C',
      max_route_indoor: '7a',
      has_hangboard: true,
      has_gym: true,
      has_spraywall: true,
      bodyweight_kg: 70,
      climbing_since: new Date().getFullYear() - years,
      birth_year: new Date().getFullYear() - age,
      preferred_days: [1, 3, 5, 2, 4, 6, 7].slice(0, perWeek).sort((a, b) => a - b),
    }),
    [perWeek, years, age],
  )

  const sessions = useMemo(
    () => buildSessions({ shape, perWeek, weeks, fingerRpe, bodyRpe, duration, hangPct, maxKg }),
    [shape, perWeek, weeks, fingerRpe, bodyRpe, duration, hangPct],
  )
  const wellness = useMemo(() => buildWellness({ weeks, sleep, fatigue }), [weeks, sleep, fatigue])
  const tests = useMemo(
    () => [
      {
        protocol: 'total_load',
        grip: 'halfcrimp',
        hands: 'two',
        value: maxKg,
        tested_on: iso(14),
      },
    ],
    [],
  )

  const readout = useMemo(
    () =>
      coachReadout(sessions, [], null, {
        profile,
        goals: [],
        wellness,
        ostrc: [],
        fingerTests: tests,
        physicalTests: [],
      }),
    [sessions, profile, wellness, tests],
  )
  const week = useMemo(
    () => rollingPlan(sessions, 'undulating', readout.daysPerWeek, [], profile, readout.suggestion),
    [sessions, readout, profile],
  )

  const { suggestion, recovery, readiness, trend, monotony } = readout

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Simulator</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <p className="muted small">
          A synthetic athlete. Nothing here is saved and nothing reads your own diary: it exists
          so a change to a constant can be watched instead of guessed at.
        </p>

        <section className="card settings-card stack">
          <h2 className="step-q">The athlete</h2>
          <Field label="What they do">
            <Segmented options={SHAPES} value={shape} onChange={setShape} columns={2} />
          </Field>
          <Field label={`Sessions a week: ${perWeek}`}>
            <Scale min={2} max={7} value={perWeek} onChange={setPerWeek} lowLabel="2" highLabel="7" />
          </Field>
          <Field label={`Weeks of history: ${weeks}`}>
            <Scale min={1} max={12} value={weeks} onChange={setWeeks} lowLabel="1" highLabel="12" />
          </Field>
          <Field label={`Years climbing: ${years}`}>
            <Scale min={1} max={15} value={years} onChange={setYears} lowLabel="1" highLabel="15" />
          </Field>
          <Field label={`Age: ${age}`}>
            <Scale min={14} max={40} value={age} onChange={setAge} lowLabel="14" highLabel="40" />
          </Field>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Every session</h2>
          <Field label={`Finger RPE: ${fingerRpe}`}>
            <Scale min={1} max={10} value={fingerRpe} onChange={setFingerRpe} lowLabel="Easy" highLabel="Max" />
          </Field>
          <Field label={`Body RPE: ${bodyRpe}`}>
            <Scale min={1} max={10} value={bodyRpe} onChange={setBodyRpe} lowLabel="Easy" highLabel="Max" />
          </Field>
          <Field label={`Duration: ${duration} min`}>
            <Scale min={30} max={180} value={duration} onChange={setDuration} lowLabel="30" highLabel="180" />
          </Field>
          <Field label={`Hangs at ${hangPct}% of max (${Math.round((maxKg * hangPct) / 100)} kg total)`}>
            <Scale min={40} max={100} value={hangPct} onChange={setHangPct} lowLabel="40%" highLabel="100%" />
          </Field>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">How they feel</h2>
          <Field label={`Sleep: ${sleep}`}>
            <Scale min={1} max={5} value={sleep} onChange={setSleep} lowLabel="Terrible" highLabel="Great" />
          </Field>
          <Field label={`Fatigue, soreness, stress: ${fatigue}`}>
            <Scale min={1} max={5} value={fatigue} onChange={setFatigue} lowLabel="Fresh" highLabel="Wrecked" />
          </Field>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">What the coach says</h2>
          <strong className="coach-suggest-title">
            {suggestion.type.emoji} {suggestion.type.label} · tier {suggestion.tier}
          </strong>
          <p className="muted small">
            {suggestion.headline}
            {suggestion.tierDrop > 0 ? ` · eased ${suggestion.tierDrop} tier${suggestion.tierDrop === 1 ? '' : 's'}` : ''}
            {suggestion.adjusted ? ` · planned was ${suggestion.plannedLabel}` : ''}
          </p>
          <div className="coach-reasons">
            {suggestion.reasons.map((r) => (
              <span className={`coach-reason ${r.changed ? 'is-changed' : ''}`} key={r.text}>
                {r.changed ? '★ ' : ''}
                {r.text}
              </span>
            ))}
          </div>
          <div className="coach-spec">
            <Row label="Session" value={suggestion.key} />
            <Row label="Exercises" value={suggestion.exercises.map((e) => e.id).join(', ') || 'none'} />
            <Row label="Grades" value={suggestion.grades?.text || '-'} />
            <Row
              label="Hang"
              value={
                suggestion.hang?.blocked
                  ? `blocked: ${suggestion.hang.reason}`
                  : suggestion.hang
                    ? `${suggestion.hang.pctText} · ${suggestion.hang.totalText}`
                    : '-'
              }
            />
          </div>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Signals</h2>
          <SignalBlock
            title="🤏 Finger tissue"
            state={recovery.label}
            tone={recovery.tone}
            hint={`${recovery.days7} hard days last 7 · ${recovery.days28} last 28 · chronic ${recovery.chronicLevel} · ${recovery.sustainedWeeks} weeks in a row`}
          />
          <SignalBlock
            title="🔋 Readiness"
            state={readiness.enough ? `${readiness.index} · ${readiness.label}` : `gated: ${readiness.reason}`}
            tone={readiness.enough ? readiness.tone : 'planned'}
            hint={
              readiness.enough
                ? `${readiness.signals.filter((s) => s.z != null).length} of ${readiness.signals.length} inputs${readiness.sustained.length ? ` · sustained: ${readiness.sustained.map((s) => s.key).join(', ')}` : ''}`
                : 'Not enough history yet'
            }
          />
          <SignalBlock
            title="📈 Load trend"
            state={trend.enough ? `${trend.pctLabel} of normal` : `gated: ${trend.reason}`}
            tone={trend.enough ? trend.tone : 'planned'}
            hint={trend.enough ? trend.label : 'No baseline yet'}
          />
          <SignalBlock
            title="🔁 Monotony"
            state={
              monotony.enough
                ? monotony.monotony == null
                  ? 'off the scale'
                  : monotony.monotony.toFixed(2)
                : `gated: ${monotony.reason}`
            }
            tone={monotony.enough ? (monotony.flag ? 'warn' : 'good') : 'planned'}
            hint={`${monotony.activeDays ?? 0} active days this week`}
          />
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">The week it builds</h2>
          <ol className="coach-week">
            {week.map((d) => (
              <li className="coach-week-item" key={d.date}>
                <div className={`coach-week-day ${d.rest ? 'is-rest' : ''} ${d.isToday ? 'is-today' : ''}`}>
                  <div className="coach-week-main">
                    <span className="coach-week-date">{format(new Date(d.date), 'EEE d')}</span>
                    <span className="coach-week-emoji">{d.rest ? '😴' : d.type.emoji}</span>
                    <span className="coach-week-label">
                      {d.rest ? 'Rest' : d.type.label}
                      {d.reduced ? ' (reduced)' : ''}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {week.sessions} sessions · {week.trainingDays} training days
            {week.doubles ? ` · ${week.doubles} double` : ''}
            {week.skippedWeekdays.length ? ` · skipping weekday ${week.skippedWeekdays.join(', ')}` : ''}
          </p>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">The history it read</h2>
          <p className="muted small">
            {sessions.length} sessions, {wellness.length} check-ins, one max test at {maxKg} kg.
          </p>
          <div className="coach-spec">
            {sessions.slice(0, 8).map((s) => (
              <Row
                key={s.id}
                label={`${s.date} ${SPORTS[s.sport]?.emoji || ''}`}
                value={`${s.duration} min · RPE ${s.rpe} · finger ${s.extra.rpe_finger}`}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="coach-spec-row">
      <span className="coach-spec-label">{label}</span>
      <span className="coach-spec-value">{value}</span>
    </div>
  )
}
