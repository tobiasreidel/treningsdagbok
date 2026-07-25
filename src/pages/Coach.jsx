import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Segmented } from '../components/ui'
import { fetchSessions } from '../lib/sessions'
import { fetchInjuries } from '../lib/health'
import { fetchIcuFitnessData } from '../lib/fitness'
import { coachReadout, weekPlan, COACH_MODELS, hangTestAge } from '../lib/coach'
import { fetchWellness, fetchOstrc, hasLoggedToday, areaLabel } from '../lib/wellness'
import { pumpLabel, STRETCH_PROTOCOL } from '../lib/exercises'
import {
  fetchCoachProfile,
  fetchGoals,
  isProfileComplete,
  goalKind,
} from '../lib/coachProfile'
import { getCoachModel, setCoachModel } from '../lib/prefs'
import { formatDayShort } from '../lib/format'

// The full training-coach view: today's prescription with a real workout
// attached, the signals behind it, the goal it's building toward, and this
// week's shape. The dashboard card is the summary; this is the detail.
export default function Coach() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [injuries, setInjuries] = useState([])
  const [icu, setIcu] = useState(null)
  const [profile, setProfile] = useState(null)
  const [goals, setGoals] = useState([])
  const [wellness, setWellness] = useState([])
  const [ostrc, setOstrc] = useState([])
  const [loading, setLoading] = useState(true)
  const [model, setModelState] = useState(getCoachModel)

  const load = useCallback(async () => {
    const [s, inj, fit, prof, gls, well, ost] = await Promise.allSettled([
      fetchSessions(),
      fetchInjuries(),
      fetchIcuFitnessData(),
      fetchCoachProfile(),
      fetchGoals(),
      fetchWellness(),
      fetchOstrc(),
    ])
    setSessions(s.status === 'fulfilled' ? s.value : [])
    setInjuries(inj.status === 'fulfilled' ? inj.value : [])
    // Not connected to intervals.icu is normal, not an error - readiness just
    // runs on the signals that are available.
    setIcu(fit.status === 'fulfilled' ? fit.value.wellness : null)
    // A missing table means "not set up", not "a profile that answered no to
    // everything" - normalise it away so nothing downstream treats it as one.
    const p = prof.status === 'fulfilled' ? prof.value : null
    setProfile(p?.missingTable ? null : p)
    setGoals(gls.status === 'fulfilled' ? gls.value : [])
    setWellness(well.status === 'fulfilled' ? well.value : [])
    setOstrc(ost.status === 'fulfilled' ? ost.value : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('coach:changed', load)
    return () => window.removeEventListener('coach:changed', load)
  }, [load])

  const readout = useMemo(
    () => coachReadout(sessions, injuries, icu, { model, profile, goals, wellness, ostrc }),
    [sessions, injuries, icu, model, profile, goals, wellness, ostrc],
  )
  const week = useMemo(
    () => weekPlan(sessions, model, readout.daysPerWeek, goals, profile),
    [sessions, model, readout.daysPerWeek, goals, profile],
  )

  const chooseModel = (k) => {
    setModelState(k)
    setCoachModel(k)
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  const { suggestion, recovery, readiness, trend, monotony, goalPhase, problems } = readout
  const setUp = isProfileComplete(profile)

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>
            Coach <span className="beta-tag">beta</span>
          </h1>
        </div>
        <button className="icon-btn" onClick={() => navigate('/coach/setup')} aria-label="About you">
          ⚙
        </button>
      </header>

      <main className="wizard-body stack">
        {!setUp && (
          <section className="card settings-card stack">
            <h2 className="step-q">Tell the coach about you</h2>
            <p className="muted small">
              Until it knows what you climb, how often you train and what you have access
              to, it can only give you generic advice. Takes a minute.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate('/coach/setup')}
            >
              Set up the coach
            </button>
          </section>
        )}

        {!hasLoggedToday(wellness) && (
          <button
            type="button"
            className="btn btn-primary btn-block settings-link-row"
            onClick={() => navigate('/checkin')}
          >
            <span>How are you today? Check in →</span>
            <span className="settings-link-arrow">›</span>
          </button>
        )}

        {problems.length > 0 && (
          <section className="card settings-card stack">
            <h2 className="step-q">Reported problems</h2>
            {problems.map((p) => (
              <SignalBlock
                key={p.area}
                title={`⚠️ ${areaLabel(p.area)}`}
                state={`${p.severity}/100${p.substantial ? ' · substantial' : ''}`}
                tone={p.substantial ? 'warn' : 'ok'}
                hint={
                  p.substantial
                    ? 'You reported a moderate-or-worse effect on training or performance this week. The coach is routing around it — but a problem at this level is worth a professional’s opinion, not an app’s.'
                    : 'Reported this week. The coach avoids sessions that load this area.'
                }
              />
            ))}
          </section>
        )}

        {/* ---- today ---- */}
        <section className="card settings-card stack">
          <div className="coach-head">
            <span className="coach-title">🧭 Today</span>
            <span className={`coach-dot coach-dot-${suggestion.tone}`} aria-hidden="true" />
          </div>
          <strong className="coach-suggest-title">
            {suggestion.type.emoji} {suggestion.type.label}
          </strong>
          <p className="muted small coach-detail">{suggestion.type.goal}</p>
          {suggestion.reasons.length > 0 && (
            <div className="coach-reasons">
              {suggestion.reasons.map((r) => (
                <span className="coach-reason" key={r}>{r}</span>
              ))}
            </div>
          )}
          {suggestion.adjusted && (
            <p className="muted small">
              Your plan called for <strong>{suggestion.plannedLabel}</strong> — swapped
              because {suggestion.headline.toLowerCase()}.
            </p>
          )}

          <div className="coach-spec">
            {suggestion.grades && (
              <SpecRow
                label="Grades"
                value={
                  suggestion.grades.label
                    ? `${suggestion.grades.text} ${suggestion.grades.label}`
                    : suggestion.grades.text
                }
              />
            )}
            {suggestion.type.effort && (
              <SpecRow label="Effort" value={suggestion.type.effort} />
            )}
            <SpecRow label="Volume" value={suggestion.type.volume} />
            <SpecRow label="Rest" value={suggestion.type.rest} />
            <SpecRow label="Target RPE" value={suggestion.type.rpe} />
          </div>

          {suggestion.exercises.length > 0 && (
            <>
              <h3 className="coach-sub">
                {suggestion.key === 'deload' || suggestion.key === 'mobility' ? 'Mobility routine' : 'Sessions that fit'}
              </h3>
              {(suggestion.key === 'deload' || suggestion.key === 'mobility') && (
                <p className="muted small">{STRETCH_PROTOCOL}</p>
              )}
              <div className="stack">
                {suggestion.exercises.map((ex, i) => (
                  <ExerciseCard key={ex.id} ex={ex} primary={i === 0 && suggestion.key !== 'deload' && suggestion.key !== 'mobility'} profile={profile} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ---- goal ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Goal</h2>
          {goalPhase ? (
            <>
              <div className="coach-goal-head">
                <span className="goal-emoji">{goalKind(goalPhase.goal.kind).emoji}</span>
                <div className="goal-main">
                  <span className="goal-title">{goalPhase.goal.title}</span>
                  <span className="muted small">
                    {goalPhase.discipline
                      ? `${
                          goalPhase.combined
                            ? 'Boulder & Lead'
                            : goalPhase.discipline === 'rope'
                              ? 'Rope'
                              : 'Bouldering'
                        } · `
                      : ''}
                    {goalPhase.style
                      ? `${goalPhase.style === 'comp' ? 'Comp' : 'Outdoor'} · `
                      : ''}
                    {formatDayShort(goalPhase.goal.target_date)} ·{' '}
                    {goalPhase.days === 0
                      ? 'today'
                      : `${goalPhase.days} day${goalPhase.days === 1 ? '' : 's'} away`}
                  </span>
                </div>
              </div>
              <div className={`coach-finger coach-finger-${goalPhase.phase.key === 'taper' ? 'ok' : 'good'}`}>
                <div className="coach-finger-row">
                  <span className="coach-finger-label">Phase</span>
                  <span className="coach-finger-state">{goalPhase.phase.label}</span>
                </div>
                <p className="muted small coach-finger-hint">{goalPhase.plan.note}</p>
              </div>
              {goalPhase.combined && (
                <p className="muted small">
                  A combined event, so the week alternates: two bouldering sessions, then
                  two on rope. Each discipline gets a hard day and an easy one rather than
                  bouldering taking all the hard days.
                </p>
              )}
              <p className="muted small">
                {goalPhase.weeks === 0
                  ? 'Under a week out.'
                  : `${goalPhase.weeks} week${goalPhase.weeks === 1 ? '' : 's'} to go — the phase moves on by itself as the date gets closer.`}
              </p>
            </>
          ) : (
            <>
              {suggestion.emphasis ? (
                <p className="muted small">
                  Working toward <strong>{suggestion.emphasis.goal.title}</strong>. With no
                  date there’s nothing to count back from, so it can’t build a peak — what
                  it does instead is point your hard days at{' '}
                  {suggestion.emphasis.label.toLowerCase()}. Add a date if you want a plan
                  that peaks.
                </p>
              ) : (
                <p className="muted small">
                  No goal yet. Add a competition or a trip and the plan stops being a loop
                  and starts counting down to it.
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-block settings-link-row"
                onClick={() => navigate('/coach/setup')}
              >
                <span>Add a goal</span>
                <span className="settings-link-arrow">›</span>
              </button>
            </>
          )}
        </section>

        {/* ---- signals ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Signals</h2>

          <SignalBlock
            title="🤏 Finger tissue"
            state={recovery.label}
            tone={recovery.tone}
            hint={recovery.hint}
          />

          {readiness.enough ? (
            <SignalBlock
              title="🔋 Readiness"
              state={`${readiness.index} · ${readiness.label}`}
              tone={readiness.tone}
              hint={
                readiness.subjectiveMissing
                  ? 'Your own normal is 50 — but this is running on objective data only. Daily check-ins carry half the weight when they exist, and they are the part that actually tracks how you feel.'
                  : "Your own normal is 50. Built from your daily check-ins plus HRV, resting heart rate and form — each measured against your own baseline, not anyone else's."
              }
            >
              <div className="coach-zrow">
                {readiness.signals.map((s) => (
                  <span
                    key={s.key}
                    className={`coach-z ${s.z == null ? 'is-off' : s.z >= 0 ? 'is-up' : 'is-down'}`}
                  >
                    {s.label}
                    {s.z == null ? ' —' : ` ${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)}`}
                  </span>
                ))}
              </div>
            </SignalBlock>
          ) : (
            <SignalBlock
              title="🔋 Readiness"
              state="Building baseline"
              tone="ok"
              hint={
                readiness.reason === 'signals'
                  ? 'You have the history, but nothing to measure against yet. Check in daily — that is what this is built from.'
                  : `Needs about ${readiness.needDays ?? 14} days of history before it means anything. Keep logging.`
              }
            />
          )}

          <SignalBlock
            title="📈 Load trend"
            state={trend.enough ? `${trend.pctLabel} of normal` : 'No baseline yet'}
            tone={trend.enough ? trend.tone : 'ok'}
            hint={
              trend.enough
                ? `${trend.label}. ${trend.hint}`
                : 'Needs a few weeks of steady training before “more than usual” means anything.'
            }
          />

          {monotony.enough && (
            <SignalBlock
              title="🔁 Monotony"
              state={monotony.monotony == null ? 'Very high' : monotony.monotony.toFixed(1)}
              tone={monotony.flag ? 'warn' : 'good'}
              hint={
                monotony.flag
                  ? 'Your days look much the same. Making hard days harder and easy days easier tends to beat a flat week.'
                  : 'Good spread between your hard and easy days.'
              }
            />
          )}
        </section>

        {/* ---- the plan ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">This week</h2>
          <p className="muted small">
            {goalPhase
              ? `${goalPhase.phase.label} phase · ${readout.daysPerWeek} sessions a week.`
              : `Week ${suggestion.cycle.blockWeek + 1} of 4${
                  suggestion.cycle.blockWeek === 3
                    ? ' — a deload week. Planned recovery is the best-supported part of any training cycle.'
                    : `${model === 'linear' ? ` · ${suggestion.cycle.block.label} block` : ''}.`
                }`}
          </p>
          <ol className="coach-week">
            {week.map((d, i) => (
              <li
                key={i}
                className={`coach-week-day ${d.done ? 'is-done' : ''} ${d.next ? 'is-next' : ''}`}
              >
                <div className="coach-week-main">
                  {d.weekday && (
                    <span className="coach-week-weekday">
                      {['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.weekday]}
                    </span>
                  )}
                  <span className="coach-week-emoji">{d.type.emoji}</span>
                  <span className="coach-week-label">{d.type.label}</span>
                  {d.next && <span className="coach-week-tag">next</span>}
                </div>
                {d.second && (
                  <div className="coach-week-second">
                    <span className="coach-week-emoji">{d.second.type.emoji}</span>
                    <span className="coach-week-label">{d.second.type.label}</span>
                    <span className="coach-week-pm">2nd · 6 h later</span>
                  </div>
                )}
              </li>
            ))}
            {Array.from({ length: week.restDays }, (_, i) => (
              <li className="coach-week-day is-rest" key={`rest-${i}`}>
                <div className="coach-week-main">
                  <span className="coach-week-emoji">😴</span>
                  <span className="coach-week-label">Rest</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {week.sessions} session{week.sessions === 1 ? '' : 's'} across{' '}
            {week.trainingDays} day{week.trainingDays === 1 ? '' : 's'}
            {week.doubles > 0
              ? `, including ${week.doubles} double${week.doubles === 1 ? '' : 's'}. Second sessions stay light and come at least ~6 hours after the first.`
              : '.'}{' '}
            Hard finger days are spaced so two never land back to back, and there’s always
            at least one full rest day.
          </p>
          {!week.weekdaysKnown && (
            <p className="muted small">
              Tell the coach which days you train and it can space the hard ones properly
              — right now it can only put them in order.
            </p>
          )}
          {week.minHardGap != null && week.minHardGap < 2 && (
            <p className="auth-error">
              Your training days put two hard finger days {week.minHardGap} day apart. That
              is inside the rebuild window — the coach will swap the second one at the time,
              but spreading the days out would serve you better.
            </p>
          )}
        </section>

        {/* ---- settings ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Plan</h2>
          {goalPhase ? (
            <p className="muted small">
              While you have a dated goal, the phase comes from how far out it is rather
              than a repeating cycle.
            </p>
          ) : (
            <>
              <Field label="Periodisation">
                <Segmented
                  options={COACH_MODELS.map((m) => ({ key: m.key, label: m.label }))}
                  value={model}
                  onChange={chooseModel}
                  columns={2}
                />
              </Field>
              <p className="muted small">{COACH_MODELS.find((m) => m.key === model)?.desc}</p>
              <p className="muted small">
                No climbing study shows one model beating another, so pick whichever you’ll
                actually stick to — that matters more than the choice.
              </p>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-block settings-link-row"
            onClick={() => navigate('/coach/setup')}
          >
            <span>About you &amp; goals</span>
            <span className="settings-link-arrow">›</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block settings-link-row"
            onClick={() => navigate('/coach/library')}
          >
            <span>📚 Exercise library</span>
            <span className="settings-link-arrow">›</span>
          </button>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">How much to trust this</h2>
          <p className="muted small">
            The finger-recovery window and the idea of a load baseline are reasonably well
            established. The exact numbers — how many points a signal moves the score,
            where a “sharp” ramp begins — are starting points, not findings.
          </p>
          <p className="muted small">
            There is deliberately no injury-risk percentage here. Predicting injury for one
            person isn’t something sports science can currently do, and a number would only
            make it look like it can.
          </p>
          <p className="muted small">
            A training-awareness tool, not medical advice. Pain is your real signal — see a
            professional for persistent symptoms.
          </p>
        </section>
      </main>
    </div>
  )
}

function SpecRow({ label, value }) {
  return (
    <div className="coach-spec-row">
      <span className="coach-spec-label">{label}</span>
      <span className="coach-spec-value">{value}</span>
    </div>
  )
}

function SignalBlock({ title, state, tone, hint, children }) {
  return (
    <div className={`coach-finger coach-finger-${tone}`}>
      <div className="coach-finger-row">
        <span className="coach-finger-label">{title}</span>
        <span className="coach-finger-state">{state}</span>
      </div>
      <p className="muted small coach-finger-hint">{hint}</p>
      {children}
    </div>
  )
}

// One prescribed workout. Max hangs turn into real kilos once the athlete has
// entered a hang max — but only while that test is recent enough to mean
// anything. A percentage of a number from six months ago is a number nobody
// knows, so past the staleness cut-off it goes back to describing the effort.
export function ExerciseCard({ ex, primary, profile }) {
  const age = hangTestAge(profile)
  const canQuoteKilos = profile?.hang_max_kg && !age.stale
  const load =
    ex.id === 'F1' && canQuoteKilos
      ? `${Math.round(profile.hang_max_kg * 0.8)}–${Math.round(profile.hang_max_kg * 0.9)} kg added`
      : ex.load
  const edge = ex.id === 'F1' && profile?.hang_edge_mm ? `${profile.hang_edge_mm} mm` : ex.edge
  const staleNote =
    ex.id === 'F1' && profile?.hang_max_kg && age.stale
      ? `Your max test is ${age.weeks} weeks old — retest before working off percentages.`
      : null

  return (
    <div className={`ex-card ${primary ? 'is-primary' : ''}`}>
      <div className="ex-head">
        <span className="ex-id">{ex.id}</span>
        <span className="ex-name">{ex.name}</span>
        {primary && <span className="coach-week-tag">pick</span>}
      </div>
      <p className="muted small ex-how">{ex.how}</p>
      {staleNote && <p className="auth-error small">{staleNote}</p>}
      <div className="ex-meta">
        {ex.time && <Meta label="Time" value={ex.time} />}
        {ex.hold && <Meta label="Hold" value={ex.hold} />}
        {ex.reps && <Meta label="Reps" value={ex.reps} />}
        {ex.sets && <Meta label="Sets" value={ex.sets} />}
        {ex.rest && <Meta label="Rest" value={ex.rest} />}
        {load && <Meta label="Load" value={load} />}
        {edge && <Meta label="Edge" value={edge} />}
        {ex.minutes && <Meta label="Duration" value={`~${ex.minutes} min`} />}
        {ex.pump && (
          <Meta
            label="Pump"
            value={
              ex.pump[0] === ex.pump[1]
                ? `${ex.pump[0]} · ${pumpLabel(ex.pump[0])}`
                : `${ex.pump[0]}–${ex.pump[1]}`
            }
          />
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <span className="ex-meta-item">
      <span className="ex-meta-label">{label}</span>
      <span className="ex-meta-value">{value}</span>
    </span>
  )
}
