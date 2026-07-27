import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Field, PillRow, Segmented, useBack } from '../components/ui'
import CoachTests from '../components/CoachTests'
import {
  rollingPlan,
  phaseTimeline,
  pickExercises,
  gradeRange,
  COACH_MODELS,
  hangTestAge,
} from '../lib/coach'
import {
  loadCoachInputs,
  readoutFrom,
  sessionFromSuggestion,
  EMPTY_COACH_INPUTS,
} from '../lib/coachData'
import { hasLoggedToday, areaLabel } from '../lib/wellness'
import {
  pumpLabel,
  STRETCH_PROTOCOL,
  tierLabel,
  sessionExercises,
} from '../lib/exercises'
import { maxTotalFor, prescribeHang } from '../lib/fingerLoad'
import { isProfileComplete, goalKind, saveCoachProfile } from '../lib/coachProfile'
import { getCoachModel, setCoachModel, getSessionPick, setSessionPick } from '../lib/prefs'
import { formatDayShort, asDate, todayISO } from '../lib/format'
import { format } from 'date-fns'
import { SPORTS } from '../lib/constants'
import SignalBlock from '../components/SignalBlock'

// The full training-coach view: today's prescription with a real workout
// attached, the signals behind it, the goal it's building toward, and this
// week's shape. The dashboard card is the summary; this is the detail.
// Three tabs rather than one nine-section scroll. Today is what you came for
// on a training day; the plan and the tests are things you look at now and
// then, and having them all in one column meant the answer to "what do I do
// today" was five screens from the bottom of the page.
const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'plan', label: 'The plan' },
  { key: 'tests', label: 'Tests' },
]

export default function Coach() {
  const navigate = useNavigate()
  const back = useBack('/')
  const { pathname } = useLocation()
  const tabParam = pathname.split('/')[2]
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : 'today'
  const [inputs, setInputs] = useState(EMPTY_COACH_INPUTS)
  const [loading, setLoading] = useState(true)
  const [model, setModelState] = useState(getCoachModel)
  const [pick, setPick] = useState(() => getSessionPick(todayISO()))

  const load = useCallback(async () => {
    setInputs(await loadCoachInputs())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('coach:changed', load)
    return () => window.removeEventListener('coach:changed', load)
  }, [load])

  const { sessions, goals, profile, fingerTests } = inputs
  const readout = useMemo(
    () => readoutFrom(inputs, { model, pick }),
    [inputs, model, pick],
  )
  const week = useMemo(
    () => rollingPlan(sessions, model, readout.daysPerWeek, goals, profile, readout.suggestion),
    [sessions, model, readout, goals, profile],
  )
  const timeline = useMemo(
    () => phaseTimeline(goals, sessions, model),
    [goals, sessions, model],
  )

  // The one profile write the tests tab makes: converting a legacy
  // added-weight max into a total-load test clears the old field.
  const saveProfilePatch = async (patch) => {
    await saveCoachProfile(patch).catch(() => {})
    load()
  }

  const chooseModel = (k) => {
    setModelState(k)
    setCoachModel(k)
  }

  // Tapping the session already on top hands the choice back to the coach,
  // rather than freezing today on a card that happens to match its own pick.
  const choosePick = (id) => {
    const next = id === readout.suggestion.exercises[0]?.id ? null : id
    setSessionPick(todayISO(), next)
    setPick(next)
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
  // Null for the handful of library entries the diary has no sport for.
  const logPrefill = sessionFromSuggestion(suggestion)

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
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
        <PillRow
          options={TABS}
          value={tab}
          onChange={(k) => navigate(k === 'today' ? '/coach' : `/coach/${k}`, { replace: true })}
          wide
        />

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

        {tab === 'today' && (
        <>
        {!hasLoggedToday(inputs.wellness) && (
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
            <h2 className="step-q">Something to work around</h2>
            {problems.map((p) => (
              <SignalBlock
                key={p.fromTest || p.area}
                // A pain-stopped test says exactly which test it was. "Other"
                // is what the questionnaire's area vocabulary can offer, and
                // it isn't what you'd want to read here.
                title={`⚠️ ${p.fromTest ? `${p.fromTest} — stopped by pain` : areaLabel(p.area)}`}
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
            <SpecRow
              label="Intensity"
              value={
                suggestion.tierDrop > 0
                  ? `Tier ${suggestion.tier} · ${tierLabel(suggestion.tier)} (eased from ${suggestion.plannedTier})`
                  : `Tier ${suggestion.tier} · ${tierLabel(suggestion.tier)}`
              }
            />
          </div>
          {suggestion.tierDrop > 0 && (
            <p className="muted small">
              Same session, dialled down — you keep the training intent instead of being
              swapped onto something unrelated. The grades above already reflect it.
            </p>
          )}
          {suggestion.deloadWeek && (
            <p className="muted small">
              Deload week: do this session at <strong>about half your usual volume</strong>{' '}
              — same intensity, fewer sets and attempts, stop while it still feels good.
              Cutting volume is what sheds the fatigue; cutting intensity is what makes you
              lose the adaptation you just built.
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

          {logPrefill && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate('/new', { state: { prefill: logPrefill } })}
            >
              Log this session
            </button>
          )}

          {suggestion.exercises.length > 0 && (
            <>
              <h3 className="coach-sub">
                {suggestion.key === 'mobility' ? 'The routine' : 'What to do'}
              </h3>
              {suggestion.key === 'mobility' ? (
                <p className="muted small">{STRETCH_PROTOCOL}</p>
              ) : (
                <p className="muted small">
                  {suggestion.pickedByYou
                    ? 'Your choice for today. Tap it again to hand the choice back to the coach.'
                    : 'Tap another to swap to it — same session type, so the grades and load above still apply.'}
                </p>
              )}
              {/* Only the chosen session is spelled out. The alternatives sit
                  as one line each: three full cards was most of the page, and
                  the choice is easier to make when you can see all of it. */}
              <div className="stack">
                {suggestion.exercises.map((ex, i) =>
                  i === 0 || suggestion.key === 'mobility' ? (
                    <ExerciseCard
                      key={ex.id}
                      ex={ex}
                      primary={i === 0 && suggestion.key !== 'mobility'}
                      youPicked={i === 0 && suggestion.pickedByYou}
                      onPick={suggestion.key === 'mobility' ? null : () => choosePick(ex.id)}
                      profile={profile}
                      tests={fingerTests}
                    />
                  ) : (
                    <AlternativeRow key={ex.id} ex={ex} onPick={() => choosePick(ex.id)} />
                  ),
                )}
              </div>
            </>
          )}
        </section>

        {/* ---- signals ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Where you’re at</h2>
          <p className="muted small">What the coach read to land on today’s session. Tap any of them for the history behind it.</p>

          <SignalBlock
            title="🤏 Finger tissue"
            state={recovery.label}
            tone={recovery.tone}
            hint={recovery.hint}
            onPress={() => navigate('/coach/signals/finger')}
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
              onPress={() => navigate('/coach/signals/readiness')}
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
              onPress={() => navigate('/coach/signals/readiness')}
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
            onPress={() => navigate('/coach/signals/load')}
          />

          {readout.asymmetry.length > 0 && (
            <SignalBlock
              title="⚖️ Side-to-side"
              state={`${readout.asymmetry[0].pct}% ${readout.asymmetry[0].strong} side`}
              tone="ok"
              hint={`${readout.asymmetry[0].test}. A gap that persists across retests is worth training out — the coach will favour one-arm variants meanwhile. This is a training observation, not a diagnosis; a persistent gap alongside pain is a reason to see a qualified clinician.`}
            />
          )}

          <SignalBlock
            title="🔁 Monotony"
            state={
              !monotony.enough
                ? 'Quiet week'
                : monotony.monotony == null
                  ? 'Very high'
                  : monotony.monotony.toFixed(1)
            }
            tone={!monotony.enough ? 'ok' : monotony.flag ? 'warn' : 'good'}
            hint={
              !monotony.enough
                ? 'Too few training days this week to judge the spread.'
                : monotony.flag
                  ? 'Your days look much the same. Making hard days harder and easy days easier tends to beat a flat week.'
                  : 'Good spread between your hard and easy days.'
            }
            onPress={() => navigate('/coach/signals/monotony')}
          />
        </section>
        </>
        )}

        {tab === 'plan' && (
        <>
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
              {timeline.mode === 'goal' && (
                <>
                  <h3 className="coach-sub">The blocks to {formatDayShort(goalPhase.goal.target_date)}</h3>
                  <BlockTimeline blocks={timeline.blocks} />
                  <p className="muted small">
                    Deload weeks land at 4-week marks counting back from the date — recover,
                    then move on. The phase advances by itself as the date gets closer.
                  </p>
                </>
              )}
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

        {/* ---- the plan ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Your week</h2>
          <p className="muted small">
            {goalPhase
              ? `${goalPhase.phase.label} phase · ${readout.daysPerWeek} sessions a week.`
              : `Week ${suggestion.cycle.blockWeek + 1} of 4${
                  model === 'linear' ? ` · ${suggestion.cycle.block.label} block` : ''
                } · ${readout.daysPerWeek} sessions a week.`}
            {week.deloadNow &&
              ' A deload week — planned recovery is the best-supported part of any training cycle.'}
          </p>
          <p className="muted small">Tap a session to see what it involves.</p>
          <ol className="coach-week">
            {week.map((d) => (
              <li key={d.date} className="coach-week-item">
                {week.phaseChange && week.phaseChange.date === d.date && (
                  <div className="coach-week-divider">
                    {d.deload ? 'Deload week' : `${d.phaseLabel} ${goalPhase ? 'phase' : 'block'}`}{' '}
                    from here
                  </div>
                )}
                <PlanDay
                  d={d}
                  profile={profile}
                  limits={readout.limits}
                  suggestion={suggestion}
                  goalStyle={goalPhase?.style || null}
                  tests={fingerTests}
                  onOpenSession={(id) => navigate(`/session/${id}`)}
                />
              </li>
            ))}
          </ol>
          {(week.phaseChange?.deload || week.deloadNow) && (
            <p className="muted small">
              A deload is <strong>less volume, not less intensity</strong> — it keeps the
              phase’s quality session at about half the usual sets and attempts, gives the
              other days back, and skips any doubles.{' '}
              {goalPhase
                ? `It lands four weeks out from ${goalPhase.goal.title}, so the block before it can be absorbed before you peak.`
                : 'Every fourth week backs off so the previous three can sink in.'}
            </p>
          )}
          <p className="muted small">
            {week.sessions} session{week.sessions === 1 ? '' : 's'} across{' '}
            {week.trainingDays} day{week.trainingDays === 1 ? '' : 's'} a week
            {week.doubles > 0
              ? `, including ${week.doubles} double${week.doubles === 1 ? '' : 's'}. Second sessions stay light and come at least ~6 hours after the first.`
              : '.'}{' '}
            The plan re-shapes itself as you log sessions and daily check-ins — today’s
            slot always shows what the coach actually suggests today.
          </p>
          {!week.weekdaysKnown && (
            <p className="muted small">
              Tell the coach which days you train and the plan can land on your real days —
              right now it spreads your {week.trainingDays} sessions evenly across the week.
            </p>
          )}
          {week.minHardGap != null && week.minHardGap < 2 && (
            <p className="auth-error">
              Your training days put two hard finger days back to back. That is inside the
              rebuild window — the coach will swap the second one at the time, but spreading
              the days out would serve you better.
            </p>
          )}
        </section>

        {/* ---- the cycle (only without a dated goal; with one, the blocks
             live in the Goal card) ---- */}
        {timeline.mode === 'cycle' && (
          <section className="card settings-card stack">
            <h2 className="step-q">The cycle</h2>
            <BlockTimeline blocks={timeline.blocks} />
            <p className="muted small">
              Four weeks, repeating: three of training, then a deload so it can sink in.
              Add a dated goal and this turns into a countdown that peaks on the date.
            </p>
          </section>
        )}

        {/* ---- settings ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">How the plan is built</h2>
          <SignalBlock
            title="🎚 Level"
            state={readout.level.label}
            tone={readout.level.hard ? 'good' : 'ok'}
            hint={levelNote(readout.level)}
          />
          {suggestion.youth && (
            <p className="muted small">
              Under 18: campus and feet-off dynamic board work are off the list, and no more
              than two of the same kind of session land in a week. Controlled finger training
              is <em>not</em> blocked — the Norwegian Climbing Federation no longer advises
              against dead-hangs for growing climbers, on the reasoning that a controlled hang
              loads the fingers less than finger-heavy bouldering does. Hangs are capped at
              80% and a set shorter. Any finger pain should be assessed by qualified health
              personnel.
            </p>
          )}
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
        </>
        )}

        {tab === 'tests' && (
          <CoachTests
            tests={inputs.physicalTests}
            fingerTests={fingerTests}
            profile={profile}
            onProfilePatch={saveProfilePatch}
            onChanged={load}
          />
        )}
      </main>
    </div>
  )
}

// What the level actually changes, said plainly - it decides how hard the week
// is pitched, so it should never be a number the app keeps to itself.
function levelNote(level) {
  const from = level.known
    ? `From your grades${level.years != null ? ` and ${level.years} years climbing` : ''}.`
    : 'Add your grades and when you started climbing in “About you” — without them the plan is pitched down the middle.'
  if (!level.known) return from
  return level.hard
    ? `${from} You get the harder weeks: no technique-and-mileage filler, a real finger session in every week that lacks one, and a higher ceiling on hard finger days before the coach starts backing you off.`
    : `${from} The plan keeps technique and volume days in the week — they build the base that hard sessions are spent from.`
}

function SpecRow({ label, value }) {
  return (
    <div className="coach-spec-row">
      <span className="coach-spec-label">{label}</span>
      <span className="coach-spec-value">{value}</span>
    </div>
  )
}

// What a logged session was, in one line: the named plan session when it was
// tagged at logging time, the sport otherwise.
function loggedLabel(s) {
  const named = sessionExercises(s)
  // Two names fit the row; beyond that it's a count, since the point here is
  // "that day is ticked off", not the full contents.
  if (named.length === 1) return `${named[0].id} · ${named[0].name}`
  if (named.length === 2) return named.map((e) => e.id).join(' + ') + ` · ${named[0].name} +1`
  if (named.length > 2) return `${named.map((e) => e.id).join(' + ')} · ${named.length} sessions`
  const parts = [SPORTS[s.sport]?.label]
  if (s.subtype) parts.push(s.subtype)
  return parts.filter(Boolean).join(' · ')
}

// The countdown (or cycle) as consecutive blocks, current one marked. This is
// the answer to "what stage am I in and what comes next" - including the
// deload weeks that would otherwise ambush the 7-day view unexplained.
function BlockTimeline({ blocks }) {
  return (
    <ol className="coach-road">
      {blocks.map((b, i) => (
        <li
          key={`${b.label}-${i}`}
          className={`coach-road-row ${b.current ? 'is-now' : ''} ${b.past ? 'is-past' : ''}`}
        >
          <span className="coach-week-emoji">{b.emoji}</span>
          <span className="coach-road-label">{b.label}</span>
          <span className="coach-road-dates">
            {b.weeks > 1 ? `${b.weeks} wks · ` : ''}
            {formatDayShort(b.from)}–{formatDayShort(b.to)}
          </span>
          {b.current && <span className="coach-week-tag">now</span>}
        </li>
      ))}
    </ol>
  )
}

// One row of the rolling plan: a real date carrying either what was logged
// (ticked off - tap to open the session), the planned session (tap to see
// what it involves), or rest.
function PlanDay({ d, profile, limits, suggestion, goalStyle, tests, onOpenSession }) {
  const [open, setOpen] = useState(false)
  const logged = d.logged.length > 0
  const expandable = !logged && !d.rest && !!d.type
  const cls = [
    'coach-week-day',
    d.rest && !logged ? 'is-rest' : '',
    logged ? 'is-logged' : '',
    d.next && !d.isToday ? 'is-next' : '',
    d.isToday ? 'is-today' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const main = (
    <>
      <span className="coach-week-weekday">
        {d.isToday ? 'Today' : format(asDate(d.date), 'EEE d')}
      </span>
      {logged ? (
        <>
          <span className="coach-week-emoji">{SPORTS[d.logged[0].sport]?.emoji || '✓'}</span>
          <span className="coach-week-label">
            {d.logged.map((s) => loggedLabel(s)).join(' + ')}
          </span>
          <span className="coach-week-check" aria-label="Logged">
            ✓
          </span>
          <span className="coach-week-caret" aria-hidden="true">
            ›
          </span>
        </>
      ) : d.rest ? (
        <>
          <span className="coach-week-emoji">😴</span>
          <span className="coach-week-label">Rest</span>
        </>
      ) : (
        <>
          <span className="coach-week-emoji">{d.type.emoji}</span>
          <span className="coach-week-label">{d.type.label}</span>
        </>
      )}
      {d.next && !logged && <span className="coach-week-tag">next</span>}
      {expandable && (
        <span className={`coach-week-caret ${open ? 'is-open' : ''}`} aria-hidden="true">
          ›
        </span>
      )}
    </>
  )

  return (
    <div className={cls}>
      {logged ? (
        <button
          type="button"
          className="coach-week-main coach-week-btn"
          onClick={() => onOpenSession(d.logged[0].id)}
        >
          {main}
        </button>
      ) : expandable ? (
        <button
          type="button"
          className="coach-week-main coach-week-btn"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {main}
        </button>
      ) : (
        <div className="coach-week-main">{main}</div>
      )}
      {open && expandable && (
        <PlanDayDetail
          d={d}
          profile={profile}
          limits={limits}
          suggestion={suggestion}
          goalStyle={goalStyle}
          tests={tests}
        />
      )}
      {d.adjusted && !logged && (
        <div className="coach-week-second">
          <span className="muted small">
            Swapped from the template for today — the Today card says why.
          </span>
        </div>
      )}
      {d.second && !logged && !d.rest && (
        <div className="coach-week-second">
          <span className="coach-week-emoji">{d.second.type.emoji}</span>
          <span className="coach-week-label">{d.second.type.label}</span>
          <span className="coach-week-pm">2nd · 6 h later</span>
        </div>
      )}
    </div>
  )
}

// What a planned day actually involves: the session's shape, grades scaled to
// you, and the library sessions that fit. Today reuses the live suggestion
// (which already reacted to recovery and readiness); future days show the
// template's answer.
function PlanDayDetail({ d, profile, limits, suggestion, goalStyle, tests }) {
  const isMobility = d.key === 'deload' || d.key === 'mobility'
  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null
  const exercises = d.isToday
    ? suggestion.exercises
    : pickExercises(d.key, profile, suggestion.cycle.week, d.discipline, goalStyle, {
        age,
        injuredRegions: suggestion.injuredRegions,
      })
  const grades = d.isToday ? suggestion.grades : gradeRange(d.key, limits, exercises[0])

  return (
    <div className="coach-week-detail">
      <p className="muted small coach-week-detail-goal">{d.type.goal}.</p>
      <div className="coach-spec">
        {grades && (
          <SpecRow
            label="Grades"
            value={grades.label ? `${grades.text} ${grades.label}` : grades.text}
          />
        )}
        {d.type.effort && <SpecRow label="Effort" value={d.type.effort} />}
        <SpecRow
          label="Volume"
          value={
            d.reduced
              ? `${d.type.volume} — at about ${Math.round((d.durationMult || 0.5) * 100)}%, ${d.taper ? 'this is the taper' : "it's a deload"}`
              : d.type.volume
          }
        />
        <SpecRow label="Rest" value={d.type.rest} />
        <SpecRow label="Target RPE" value={d.type.rpe} />
      </div>
      {exercises.length > 0 && (
        <>
          <p className="muted small coach-week-detail-fit">
            {isMobility ? 'Routine:' : 'Sessions that fit:'}
          </p>
          <ul className="coach-week-exlist">
            {exercises.slice(0, 3).map((ex) => (
              <li key={ex.id}>
                <span className="ex-id">{ex.id}</span> {ex.name}
              </li>
            ))}
          </ul>
          {isMobility && <p className="muted small">{STRETCH_PROTOCOL}</p>}
        </>
      )}
      <p className="muted small coach-week-detail-note">
        Full protocols are in the exercise library. The nearer the day, the more this can
        shift with your recovery and check-ins.
      </p>
    </div>
  )
}

// One prescribed workout. Max hangs turn into real kilos once the athlete has
// entered a hang max — but only while that test is recent enough to mean
// anything. A percentage of a number from six months ago is a number nobody
// knows, so past the staleness cut-off it goes back to describing the effort.
// An alternative session, one line: enough to choose by, and one tap from
// becoming the session that's spelled out in full above.
function AlternativeRow({ ex, onPick }) {
  const meta = [ex.minutes ? `~${ex.minutes} min` : null, ex.pump ? `pump ${ex.pump[0]}` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <button type="button" className="alt-row" onClick={onPick}>
      <span className="ex-id">{ex.id}</span>
      <span className="alt-row-main">
        <span className="alt-row-name">{ex.name}</span>
        {meta && <span className="muted small">{meta}</span>}
      </span>
      <span className="alt-row-swap">Swap</span>
    </button>
  )
}

export function ExerciseCard({
  ex, primary, profile, tests = [], durationMult = 1, onPick = null, youPicked = false,
}) {
  // Any exercise anchored on a percentage of max total load gets a real number
  // in kilos, including the assisted case (negative added weight is the normal
  // shape of submaximal finger work, not an error).
  const grip = ex.intensity?.grip && ex.intensity.grip !== 'rotating' ? ex.intensity.grip : 'halfcrimp'
  const max = ex.intensity?.anchor === 'pctMaxTotal' ? maxTotalFor(profile, tests, grip) : null
  const bw = Number(profile?.bodyweight_kg) || 0
  const rx = max?.kg && !max.stale ? prescribeHang(ex.intensity, max.kg, bw) : null

  const load = rx
    ? `${rx.pctText} · ${rx.totalText}${rx.addedText ? ` (${rx.addedText})` : ''}`
    : ex.load
  const edge = ex.intensity?.edge_mm ? `${ex.intensity.edge_mm} mm` : ex.edge
  const minutes = ex.minutes ? Math.round(ex.minutes * durationMult) : null

  let note = null
  if (max?.stale) {
    note = `Your max test is ${max.weeks} weeks old — retest before working off percentages.`
  } else if (max && !max.kg && max.reason === 'needs-bodyweight') {
    note = 'Add a bodyweight in the coach setup and this becomes kilos instead of a percentage.'
  } else if (rx && !rx.addedText) {
    note = 'Add a bodyweight to see whether that means adding weight or taking it off.'
  }

  // A role rather than a <button>: the card's body is paragraphs, which a
  // button may not contain.
  const press = onPick
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-pressed': !!primary,
        onClick: onPick,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick()
          }
        },
      }
    : {}

  return (
    <div
      className={`ex-card ${primary ? 'is-primary' : ''} ${onPick ? 'ex-card-tap' : ''}`}
      {...press}
    >
      <div className="ex-head">
        <span className="ex-id">{ex.id}</span>
        <span className="ex-name">{ex.name}</span>
        {ex.youthReduced && <span className="coach-week-tag">u18</span>}
        {primary && <span className="coach-week-tag">{youPicked ? 'your pick' : 'pick'}</span>}
      </div>
      <p className="muted small ex-how">{ex.how}</p>
      {ex.margin && <p className="muted small ex-how"><strong>Margin:</strong> {ex.margin}</p>}
      {note && <p className="auth-error small">{note}</p>}
      {rx?.assisted && (
        <p className="muted small">
          That is below your bodyweight, so it is an assisted hang — pulley, band, or feet
          on the floor. This is the normal shape of submaximal finger work.
        </p>
      )}
      <div className="ex-meta">
        {ex.time && <Meta label="Time" value={ex.time} />}
        {ex.hold && <Meta label="Hold" value={ex.hold} />}
        {ex.reps && <Meta label="Reps" value={ex.reps} />}
        {ex.sets && <Meta label="Sets" value={ex.sets} />}
        {ex.rest && <Meta label="Rest" value={ex.rest} />}
        {load && <Meta label="Load" value={load} />}
        {edge && <Meta label="Edge" value={edge} />}
        {minutes && (
          <Meta
            label="Duration"
            value={durationMult < 1 ? `~${minutes} min (cut back)` : `~${minutes} min`}
          />
        )}
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
      {ex.termination && (
        <p className="muted small ex-how">
          <strong>Stop if:</strong> {ex.termination}
        </p>
      )}
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
