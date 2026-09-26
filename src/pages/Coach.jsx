import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Field, PillRow, Segmented, useBack } from '../components/ui'
import CoachTests from '../components/CoachTests'
import {
  phaseTimeline,
  pickExercises,
  gradeRange,
  hangPrescription,
  COACH_MODELS,
  SESSION_TYPES,
  readinessGateHint,
} from '../lib/coach'
import {
  loadCoachInputs,
  readoutFrom,
  sessionFromSuggestion,
  EMPTY_COACH_INPUTS,
} from '../lib/coachData'
import { buildSessionSheet } from '../lib/sessionSheet'
import { hasLoggedToday, areaLabel } from '../lib/wellness'
import { writeSignalSnapshot, sharesWithAnyone } from '../lib/squad'
import {
  pumpLabel,
  STRETCH_PROTOCOL,
  tierLabel,
  sessionExercises,
} from '../lib/exercises'
import { maxTotalFor, prescribeHang } from '../lib/fingerLoad'
import {
  isProfileComplete,
  goalKind,
  saveCoachProfile,
  profileGaps,
  startNewBlock,
  weaknessLabel,
} from '../lib/coachProfile'
import { getCoachModel, setCoachModel, getSessionPick, setSessionPick } from '../lib/prefs'
import { formatDayShort, formatDuration, asDate, todayISO } from '../lib/format'
import { format } from 'date-fns'
import { SPORTS, subtypeWord } from '../lib/constants'
import SignalBlock from '../components/SignalBlock'

// The full training-coach view: today's session start to finish, the signals
// behind it, the week it sits in against what was logged, the block that week
// is part of, and the goal it is all building toward. The dashboard card is
// the summary; this is the detail.
//
// Three tabs rather than one nine-section scroll. Today is what you came for
// on a training day; the plan and the tests are things you look at now and
// then, and having them all in one column meant the answer to "what do I do
// today" was five screens from the bottom of the page.
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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
  // Signals stay folded away on a day when nothing has changed, and open
  // themselves when something wants looking at: a warning must never be one
  // tap further away than it used to be.
  const [signalsOpen, setSignalsOpen] = useState(null)
  const [blockBusy, setBlockBusy] = useState(false)

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
  const timeline = useMemo(
    () => phaseTimeline(goals, sessions, model, profile),
    [goals, sessions, model, profile],
  )

  // If any coach has been granted signal access, leave them today's derived
  // numbers. Written from here because this is where the readout already exists,
  // and derived only: the raw check-in entries stay on this device's account.
  // Declared after `readout` for a reason: a dependency array is evaluated
  // during render, so referencing it above its own useMemo throws.
  useEffect(() => {
    if (loading) return undefined
    let alive = true
    sharesWithAnyone()
      .then((yes) => {
        if (!alive || !yes) return undefined
        return writeSignalSnapshot(readout, { checkedIn: hasLoggedToday(inputs.wellness) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [loading, readout, inputs.wellness])

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

  // Tapping the coach's own pick hands the choice back to it, rather than
  // freezing today on a card that happens to match what it would have said. It
  // is the first in the list, which does not move when you choose another.
  const choosePick = (id) => {
    const next = id === readout.suggestion.coachPick ? null : id
    setSessionPick(todayISO(), next)
    setPick(next)
  }

  const newBlock = async () => {
    setBlockBusy(true)
    await startNewBlock().catch(() => {})
    setBlockBusy(false)
    load()
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  const { suggestion, recovery, readiness, trend, monotony, goalPhase, problems, week, block, review } = readout
  const setUp = isProfileComplete(profile)
  const gaps = profileGaps(profile)
  // Null for the handful of library entries the diary has no sport for.
  const logPrefill = sessionFromSuggestion(suggestion)
  const primaryReason = suggestion.reasons.find((r) => r.changed) || suggestion.reasons[0] || null
  const otherReasons = suggestion.reasons.filter((r) => r !== primaryReason)
  const sheet = suggestion.sheet

  // How many signals are worth a look, so the section can say so in one line
  // instead of four blocks that mostly read "steady".
  const attentionFlags = [
    recovery.tone === 'warn',
    // The sustained check needs no baseline, so readiness can be worth a look
    // while it is still building one.
    (readiness.sustained?.length ?? 0) > 0 || (readiness.enough && readiness.tone === 'warn'),
    trend.enough && trend.tone === 'warn',
    monotony.enough && monotony.flag,
  ]
  const gatedFlags = [false, !readiness.enough, !trend.enough, !monotony.enough]
  const attention = attentionFlags.filter(Boolean).length
  // Counted once: a signal with something to say is listed as that, not as a
  // gap, or the four signals add up to five.
  const gated = gatedFlags.filter((g, i) => g && !attentionFlags[i]).length
  const steady = 4 - attention - gated
  const signalSummary = [
    attention > 0 ? `${attention} to look at` : null,
    steady > 0 ? `${steady} steady` : null,
    gated > 0 ? `${gated} not enough data yet` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  // Untouched (null) means "decide for me": open when there is something to
  // see, folded when there is not.
  const signalsShown = signalsOpen == null ? attention > 0 : signalsOpen

  const blockLabel = goalPhase
    ? `${goalPhase.phase.label} phase · ${week.block.label}`
    : `Week ${week.block.idx + 1} of 4 · ${week.block.label}`

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
                key={p.fromTest || p.fromSession || p.area}
                // A pain-stopped test or session says exactly which it was.
                // "Other" is what the questionnaire's area vocabulary can
                // offer, and it isn't what you'd want to read here.
                title={`⚠️ ${
                  p.fromTest
                    ? `${p.fromTest}: stopped by pain`
                    : p.fromSession
                      ? `${p.fromSession}: ended in pain`
                      : areaLabel(p.area)
                }`}
                state={`${p.severity}/100${p.substantial ? ' · substantial' : ''}`}
                tone={p.substantial ? 'warn' : 'ok'}
                hint={
                  p.fromSession
                    ? `You said the session hurt your ${areaLabel(p.area).toLowerCase()}. The coach routes around that area for a week, and the load comes back lighter. Pain that persists is worth a professional’s opinion, not an app’s.`
                    : p.substantial
                      ? 'You reported a moderate-or-worse effect on training or performance this week. The coach is routing around it, but a problem at this level is worth a professional’s opinion, not an app’s.'
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
            <span className="coach-head-right">
              <span className="coach-block-chip">{blockLabel}</span>
              <span className={`coach-dot coach-dot-${suggestion.tone}`} aria-hidden="true" />
            </span>
          </div>

          <DayStatus suggestion={suggestion} />

          <strong className="coach-suggest-title">
            {suggestion.type.emoji} {suggestion.type.label}
          </strong>
          <p className="muted small coach-detail">{suggestion.type.goal}</p>
          {/* The line that explains today, then the rest. A chip that
              describes a signal which did not change the prescription is
              decoration, and rendering both the same way buried the one that
              matters. */}
          {primaryReason && (
            <p className={`coach-why ${primaryReason.changed ? 'is-changed' : ''}`}>
              {primaryReason.text}
            </p>
          )}
          {otherReasons.length > 0 && (
            <div className="coach-reasons">
              {otherReasons.map((r) => (
                <span className="coach-reason" key={r.text}>{r.text}</span>
              ))}
            </div>
          )}
          {suggestion.adjusted && (
            <p className="muted small">
              Your plan called for <strong>{suggestion.plannedLabel}</strong>, swapped
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
              Same session, dialled down. You keep the training intent instead of being
              swapped onto something unrelated. The grades above already reflect it.
            </p>
          )}
          {suggestion.deloadWeek && (
            <p className="muted small">
              Deload week: do this session at <strong>about half your usual volume</strong>:{' '}
              same intensity, fewer sets and attempts, stop while it still feels good.
              Cutting volume is what sheds the fatigue; cutting intensity is what makes you
              lose the adaptation you just built.
            </p>
          )}
          {suggestion.taperWeek && (
            <p className="muted small">
              Taper: <strong>same sessions, half the time</strong>. Nothing you do now makes
              you fitter; plenty can make you tired.
            </p>
          )}
          {!suggestion.deloadWeek && !suggestion.taperWeek && suggestion.volumeMult !== 1 && (
            <p className="muted small">
              {week.block.label} week of the block: volume at about{' '}
              {Math.round(suggestion.volumeMult * 100)}%. {week.block.note}
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

          {/* The primary action is logging the session on the card. Once
              today is logged the card is a preview of the next session, and
              prefilling a log with it would write tomorrow's session onto
              today. */}
          {logPrefill && suggestion.dayStatus !== 'done' && suggestion.dayStatus !== 'complete' && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate('/new', { state: { prefill: logPrefill } })}
            >
              Log this session
            </button>
          )}
          {(suggestion.dayStatus === 'done' || suggestion.dayStatus === 'complete') && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => navigate('/new')}
            >
              Log something else today
            </button>
          )}

          {/* ---- the session, start to finish ---- */}
          {sheet.parts.length > 0 && (
            <>
              <h3 className="coach-sub">
                {suggestion.key === 'mobility' ? 'The routine' : `The session · about ${sheet.total} min`}
              </h3>
              {suggestion.key === 'mobility' ? (
                <p className="muted small">{STRETCH_PROTOCOL}</p>
              ) : (
                <p className="muted small">
                  {profile?.session_minutes
                    ? `Built to fit your ${profile.session_minutes} minutes.`
                    : 'Built for ninety minutes. Tell the coach how long your sessions are and it fits them instead.'}
                  {sheet.cut ? ` ${sheet.cutNote}` : ''}
                </p>
              )}
              <ol className="sheet">
                {sheet.parts.map((part, i) => (
                  <li className={`sheet-part sheet-part-${part.role}`} key={`${part.role}-${part.id}-${i}`}>
                    <div className="sheet-part-head">
                      <span className="sheet-role">{part.label}</span>
                      <span className="sheet-min">~{part.minutes} min</span>
                    </div>
                    {part.role === 'main' ? (
                      <ExerciseCard
                        ex={part.exercise}
                        primary={suggestion.key !== 'mobility'}
                        youPicked={suggestion.pickedByYou}
                        onPick={suggestion.key === 'mobility' ? null : () => choosePick(part.exercise.id)}
                        profile={profile}
                        tests={fingerTests}
                        hang={suggestion.hang}
                        sets={part.sets}
                        durationMult={part.reducedBy || 1}
                        minutesOverride={part.minutes}
                      />
                    ) : (
                      <div className="sheet-body">
                        <span className="sheet-name">
                          {part.exercises ? part.exercises.map((e) => (
                            <span key={e.id}><span className="ex-id">{e.id}</span> {e.name}{' '}</span>
                          )) : (
                            <><span className="ex-id">{part.id}</span> {part.name}{part.required ? ' · required' : ''}</>
                          )}
                        </span>
                        {part.how && <span className="muted small sheet-how">{part.how}</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          {suggestion.exercises.length > 1 && suggestion.key !== 'mobility' && (
            <>
              <h3 className="coach-sub">Or, for the main part</h3>
              <p className="muted small">
                {suggestion.pickedByYou
                  ? 'Your choice for today. Tap the coach’s pick to hand the choice back.'
                  : 'Same session type, so the grades and load above still apply. Tap one to swap.'}
              </p>
              {/* The order is the coach's ranking, so it stays put and the
                  selection moves instead: a list that rearranges itself under
                  your thumb makes you re-find what you were just looking at. */}
              <div className="stack">
                {suggestion.exercises.map((ex, i) =>
                  i === suggestion.chosenIndex ? null : (
                    <AlternativeRow
                      key={ex.id}
                      ex={ex}
                      isCoachPick={suggestion.pickedByYou && ex.id === suggestion.coachPick}
                      onPick={() => choosePick(ex.id)}
                    />
                  ),
                )}
              </div>
            </>
          )}
          {suggestion.key === 'mobility' && suggestion.exercises.length > 1 && (
            <div className="stack">
              {suggestion.exercises.slice(1).map((ex) => (
                <ExerciseCard key={ex.id} ex={ex} profile={profile} tests={fingerTests} />
              ))}
            </div>
          )}
        </section>

        {/* ---- signals ---- */}
        {/* Four blocks plus a card plus problem blocks was most of a screen,
            and on a normal day none of it has changed. Collapsed to one line
            unless something actually wants looking at. */}
        <section className="card settings-card stack">
          <button
            type="button"
            className="coach-signals-summary"
            aria-expanded={signalsShown}
            onClick={() => setSignalsOpen(!signalsShown)}
          >
            <span className="step-q">Where you’re at</span>
            <span className="coach-signals-state">
              {signalSummary}
              <span className={`coach-finger-chev ${signalsShown ? 'is-open' : ''}`} aria-hidden="true">
                ›
              </span>
            </span>
          </button>

          {signalsShown && (
          <>
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
                  ? 'Your own normal is 50, but this is running on objective data only. Daily check-ins carry half the weight when they exist, and they are the part that actually tracks how you feel.'
                  : readiness.subjectiveThin
                    ? `Your own normal is 50. Running on thin subjective data: ${readiness.recentWellness} check-in${readiness.recentWellness === 1 ? '' : 's'} in the last 7 days, so the half that tracks how you feel is a guess from a couple of days.`
                    : "Your own normal is 50. Built from your daily check-ins plus HRV, resting heart rate and form, each measured against your own baseline, not anyone else's."
              }
              onPress={() => navigate('/coach/signals/readiness')}
            >
              {/* The index cannot see a baseline that has been bad for weeks,
                  so the absolute check says it in words. */}
              {readiness.sustained.map((s) => (
                <p className="auth-error small" key={s.key}>
                  Your {s.label.toLowerCase()} has been poor {s.days} of the last {s.of} days.
                  Readiness compares you against your own recent normal, and your recent normal
                  has been low.
                </p>
              ))}
              <div className="coach-zrow">
                {readiness.signals.map((s) => (
                  <span
                    key={s.key}
                    className={`coach-z ${s.z == null ? 'is-off' : s.z >= 0 ? 'is-up' : 'is-down'}`}
                  >
                    {s.label}
                    {s.z == null ? ' -' : ` ${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)}`}
                  </span>
                ))}
              </div>
            </SignalBlock>
          ) : (
            <SignalBlock
              title="🔋 Readiness"
              state="Building baseline"
              tone="ok"
              hint={readinessGateHint(readiness)}
              onPress={() => navigate('/coach/signals/readiness')}
            >
              {/* No index yet is not the same as nothing to say: this check is
                  absolute and needs no baseline. */}
              {(readiness.sustained || []).map((s) => (
                <p className="auth-error small" key={s.key}>
                  Your {s.label.toLowerCase()} has been poor {s.days} of the last {s.of} days.
                </p>
              ))}
            </SignalBlock>
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
              hint={`${readout.asymmetry[0].test}. A gap that persists across retests is worth training out; the coach will favour one-arm variants meanwhile. This is a training observation, not a diagnosis; a persistent gap alongside pain is a reason to see a qualified clinician.`}
            />
          )}

          <SignalBlock
            title="🔁 Monotony"
            state={
              !monotony.enough
                ? monotony.reason === 'frequency'
                  ? 'Not meaningful yet'
                  : 'Quiet week'
                : monotony.monotony == null
                  ? 'Very high'
                  : monotony.monotony.toFixed(1)
            }
            tone={!monotony.enough ? 'planned' : monotony.flag ? 'warn' : 'good'}
            hint={
              !monotony.enough
                ? monotony.reason === 'frequency'
                  ? `Judged over the days you train, and ${monotony.activeDays} is too few to tell a varied week from a flat one. It starts meaning something at five training days a week.`
                  : 'Nothing logged this week yet.'
                : monotony.flag
                  ? 'Your sessions look much the same. Making hard days harder and easy days easier tends to beat a flat week.'
                  : 'Good spread between your hard and easy sessions.'
            }
            onPress={() => navigate('/coach/signals/monotony')}
          />
          </>
          )}
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
                    Deload weeks land at 4-week marks counting back from the date: recover,
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
            </>
          ) : (
            <>
              {suggestion.emphasis ? (
                <p className="muted small">
                  Working toward <strong>{suggestion.emphasis.goal.title}</strong>. With no
                  date there’s nothing to count back from, so it can’t build a peak. What
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

        {/* ---- this week ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">This week</h2>
          <p className="muted small">
            <strong>{blockLabel}</strong> · {week.sessions} session{week.sessions === 1 ? '' : 's'} a week
            {week.done > 0 || week.planned > 0 ? ` · ${week.done} of ${week.planned} done` : ''}.
            {' '}{week.block.note}
          </p>
          <p className="muted small">Tap a session to see what it involves. Logged days open the session.</p>
          <ol className="coach-week">
            {week.map((d) => (
              <li key={d.date} className="coach-week-item">
                <PlanDay
                  d={d}
                  profile={profile}
                  limits={readout.limits}
                  suggestion={suggestion}
                  goalStyle={goalPhase?.style || null}
                  tests={fingerTests}
                  sessions={sessions}
                  onOpenSession={(id) => navigate(`/session/${id}`)}
                />
              </li>
            ))}
          </ol>
          {week.swap && (
            <p className="muted small">
              <strong>{SESSION_TYPES[week.swap.to].label}</strong> replaces{' '}
              {SESSION_TYPES[week.swap.from].label.toLowerCase()} this week: you said{' '}
              {weaknessLabel(week.swap.weakness).toLowerCase()} is what holds you back.
            </p>
          )}
          {week.dropped.length > 0 && (
            <p className="muted small">
              {week.dropped.map((k) => SESSION_TYPES[k].label).join(' and ')} drop
              {week.dropped.length === 1 ? 's' : ''} this week: a missed day means fewer days left, and the
              least important session is the one that goes. Two hard days back to back to
              make up for one is how people get hurt.
            </p>
          )}
          {week.deloadNow && (
            <p className="muted small">
              A deload is <strong>less volume, not less intensity</strong>. It keeps the
              phase’s quality session at about half the usual sets and attempts, gives the
              other days back, and skips any doubles.{' '}
              {goalPhase
                ? `It lands four weeks out from ${goalPhase.goal.title}, so the block before it can be absorbed before you peak.`
                : 'Every fourth week backs off so the previous three can sink in.'}
            </p>
          )}
          <p className="muted small">
            {week.doubles > 0
              ? `Including ${week.doubles} double${week.doubles === 1 ? '' : 's'}: second sessions stay light and come at least ~6 hours after the first. `
              : ''}
            The plan re-shapes itself as you log sessions and daily check-ins; today’s
            slot always shows what the coach actually suggests today.
          </p>
          {!week.weekdaysKnown && (
            <p className="muted small">
              Tell the coach which days you train and the plan can land on your real days, and
              call a missed one missed. Right now it spreads your {week.trainingDays} sessions
              evenly across the week and gives you the next one whenever you open it.
            </p>
          )}
          {week.skippedWeekdays.length > 0 && (
            <p className="muted small">
              Nothing has been logged on{' '}
              {week.skippedWeekdays.map((d) => WEEKDAY_NAMES[d - 1]).join(' or ')} for the last
              month, so the hard sessions have moved off{' '}
              {week.skippedWeekdays.length === 1 ? 'it' : 'them'}. Not a judgement: a plan you
              follow beats a plan you feel guilty about.
            </p>
          )}
          {week.minHardGap != null && week.minHardGap < 2 && (
            <p className="auth-error">
              Your training days put two hard finger days back to back. That is inside the
              rebuild window; the coach will swap the second one at the time, but spreading
              the days out would serve you better.
            </p>
          )}
          <div className="coach-finger coach-finger-planned">
            <div className="coach-finger-row">
              <span className="coach-finger-label">Next week</span>
              <span className="coach-finger-state">
                {week.nextWeek.label}
                {week.nextWeek.deload || week.nextWeek.taper ? '' : ` · ${week.nextWeek.block.label}`}
              </span>
            </div>
            <p className="muted small coach-finger-hint">
              From {formatDayShort(week.nextWeek.from)}.{' '}
              {week.nextWeek.deload
                ? 'A deload: half the volume, same intensity.'
                : week.nextWeek.taper
                  ? 'The taper: same sessions, half the time.'
                  : week.nextWeek.block.note}
            </p>
          </div>
        </section>

        {/* ---- the block ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">The block</h2>
          <p className="muted small">
            Three loading weeks that build, then a deload. Volume is what climbs across
            them: an extra set, a few more problems. The hang load moves by its own rule,
            from how the last sessions went, and the intensity of a session never moves
            with the week.
          </p>
          <ol className="coach-road">
            {block.rows.map((b, i) => (
              <li
                key={`${b.from}-${i}`}
                className={`coach-road-row ${b.current ? 'is-now' : ''} ${b.past ? 'is-past' : ''}`}
              >
                <span className="coach-week-emoji">{b.deload ? '🌱' : b.taper ? '🎯' : '📈'}</span>
                <span className="coach-road-label">{b.label}</span>
                <span className="coach-road-mult">{Math.round(b.volumeMult * 100)}%</span>
                <span className="coach-road-dates">
                  {formatDayShort(b.from)}–{formatDayShort(b.to)}
                </span>
                {b.current && <span className="coach-week-tag">now</span>}
              </li>
            ))}
          </ol>
          {block.mode === 'cycle' && (
            <>
              {!block.anchored && (
                <p className="muted small">
                  Counted from your first logged session. Start a new block and it counts
                  from this Monday instead, which is what you want after a break, an injury,
                  or a change of plan.
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={newBlock}
                disabled={blockBusy}
              >
                {blockBusy ? 'Starting…' : 'Start a new block from this Monday'}
              </button>
            </>
          )}
        </section>

        {/* ---- last week ---- */}
        {!review.empty && (
          <section className="card settings-card stack">
            <h2 className="step-q">Last week</h2>
            <div className="coach-spec">
              <SpecRow
                label="Sessions"
                value={`${review.done} of ${review.planned} planned${review.extra ? ` · ${review.extra} extra` : ''}`}
              />
              <SpecRow label="Time" value={formatDuration(review.minutes)} />
              <SpecRow label="Hard finger days" value={review.hardFingerDays} />
              {review.missedKeys.length > 0 && (
                <SpecRow
                  label="Missed"
                  value={review.missedKeys.map((k) => SESSION_TYPES[k]?.label || k).join(', ')}
                />
              )}
            </div>
            <p className="muted small">
              {review.deload
                ? 'That was a deload week, so fewer sessions was the point. '
                : review.planned > 0 && review.done >= review.planned
                  ? 'Every planned session done. '
                  : review.missedHard
                    ? 'The hard session was the one that went missing. That is the one to protect: when a week gets short, drop the filler first. '
                    : review.missedKeys.length
                      ? 'Missing a filler session is fine. Consistency over months beats a perfect week. '
                      : ''}
              This week is a {week.block.label.toLowerCase()} week
              {week.deloadNow ? '' : `, volume at about ${Math.round(week.block.volumeMult * 100)}%`}.
              {suggestion.hang?.target?.rule === 'progress' ? ' The hangboard load goes up 2.5%.' : ''}
            </p>
          </section>
        )}

        {/* ---- what the coach knows ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">What the coach is still guessing at</h2>
          {gaps.length === 0 ? (
            <p className="muted small">Nothing. It has every answer it asks for.</p>
          ) : (
            <>
              <p className="muted small">
                Each of these changes the plan. Without an answer the coach assumes
                something ordinary, and says so here rather than pretending.
              </p>
              <ul className="gap-list">
                {gaps.map((g) => (
                  <li key={g.key}>
                    <strong>{g.label}.</strong> <span className="muted small">{g.why}</span>
                  </li>
                ))}
              </ul>
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
        </section>

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
              Under 18: campus and feet-off dynamic board work are off the list, no more
              than two of the same kind of session land in a week, and there is no finger
              training of any kind before two years of regular climbing. That last line is
              the Norwegian Climbing Federation’s, which no longer advises against
              controlled dead-hangs for growing climbers after that point, on the reasoning
              that a controlled hang loads the fingers less than finger-heavy bouldering
              does. Hangs are capped at 80% and a set shorter. Any finger pain should be
              assessed by qualified health personnel.
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
                actually stick to; that matters more than the choice.
              </p>
            </>
          )}
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
            The finger-recovery window, the idea of a load baseline, ramping volume across a
            block before a deload, and adding load only after sessions have gone to plan are
            reasonably well established. The exact numbers (how many points a signal moves
            the score, where a “sharp” ramp begins, 2.5% a step) are starting points, not
            findings.
          </p>
          <p className="muted small">
            There is deliberately no injury-risk percentage here. Predicting injury for one
            person isn’t something sports science can currently do, and a number would only
            make it look like it can.
          </p>
          <p className="muted small">
            A training-awareness tool, not medical advice. Pain is your real signal; see a
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

// What today is in the week, before what to do about it. A rest day that
// reads as a training day is the plan contradicting the calendar.
function DayStatus({ suggestion }) {
  if (suggestion.dayStatus === 'training') {
    if (!suggestion.carriedFrom) return null
    return (
      <p className="coach-status">
        Moved here from {formatDayShort(suggestion.carriedFrom)}, which was missed.
      </p>
    )
  }
  if (suggestion.dayStatus === 'rest') {
    return (
      <p className="coach-status">
        😴 A rest day in your plan. If you train anyway, this is the next session owed
        {suggestion.nextUp ? `, otherwise it waits for ${formatDayShort(suggestion.nextUp.date)}` : ''}.
      </p>
    )
  }
  if (suggestion.dayStatus === 'done') {
    return (
      <p className="coach-status">
        ✓ Today’s session is logged.
        {suggestion.nextUp
          ? ` Next up: ${formatDayShort(suggestion.nextUp.date)}, ${suggestion.nextUp.type.label.toLowerCase()}. This is a preview of it.`
          : ''}
      </p>
    )
  }
  return (
    <p className="coach-status">
      ✓ Every planned session this week is logged. Anything more is a bonus, and easy is
      the right kind.
    </p>
  )
}

// What the level actually changes, said plainly - it decides how hard the week
// is pitched, so it should never be a number the app keeps to itself.
function levelNote(level) {
  const from = level.known
    ? `From your grades${level.years != null ? ` and ${level.years} years climbing` : ''}.`
    : 'Add your grades and when you started climbing in “About you”. Without them the plan is pitched down the middle.'
  if (!level.known) return from
  if (level.hard) {
    return `${from} You get the harder weeks: no technique-and-mileage filler, a real finger session in every week that lacks one, and a higher ceiling on hard finger days before the coach starts backing you off.`
  }
  if (level.isNew) {
    return `${from} The first years are for climbing: the week is mostly mileage and technique with one hard day, and the hangboard waits until the tendons have a year or two of climbing behind them.`
  }
  return `${from} The plan keeps technique and volume days in the week; they build the base that hard sessions are spent from.`
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
  if (s.subtype) parts.push(subtypeWord(s.subtype))
  return parts.filter(Boolean).join(' · ')
}

// The countdown as consecutive blocks, current one marked. This is the answer
// to "what stage am I in and what comes next" - including the deload weeks
// that would otherwise ambush the week view unexplained.
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

// One row of the week: a real date carrying what was logged (ticked off, tap to
// open the session), what was missed, the planned session (tap to see what it
// involves), or rest.
function PlanDay({ d, profile, limits, suggestion, goalStyle, tests, sessions, onOpenSession }) {
  const [open, setOpen] = useState(false)
  const logged = d.logged.length > 0
  const expandable = !d.done && !d.rest && !!d.type && !d.missed
  const cls = [
    'coach-week-day',
    d.rest && !logged ? 'is-rest' : '',
    d.done ? 'is-logged' : '',
    d.missed ? 'is-missed' : '',
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
            {d.done && d.didType && !sessionExercises(d.logged[0]).length ? (
              <span className="muted small coach-week-as"> · counted as {d.didType.label.toLowerCase()}</span>
            ) : null}
            {d.extra && <span className="muted small coach-week-as"> · extra</span>}
          </span>
          <span className="coach-week-check" aria-label="Logged">
            ✓
          </span>
          <span className="coach-week-caret" aria-hidden="true">
            ›
          </span>
        </>
      ) : d.missed ? (
        <>
          <span className="coach-week-emoji">{SESSION_TYPES[d.templateKey]?.emoji || '·'}</span>
          <span className="coach-week-label">
            {SESSION_TYPES[d.templateKey]?.label || 'Session'}
            <span className="muted small coach-week-as"> · missed</span>
          </span>
          <span className="coach-week-miss" aria-label="Missed">✗</span>
        </>
      ) : d.rest ? (
        <>
          <span className="coach-week-emoji">😴</span>
          <span className="coach-week-label">Rest</span>
        </>
      ) : (
        <>
          <span className="coach-week-emoji">{d.type.emoji}</span>
          <span className="coach-week-label">
            {d.type.label}
            {d.carriedFrom && (
              <span className="muted small coach-week-as"> · from {format(asDate(d.carriedFrom), 'EEE')}</span>
            )}
          </span>
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
          sessions={sessions}
        />
      )}
      {d.adjusted && !logged && (
        <div className="coach-week-second">
          <span className="muted small">
            Swapped from the plan for today: {suggestion.headline.toLowerCase()}.
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
// you, and the sheet the day would get. Today reuses the live suggestion
// (which already reacted to recovery and readiness); future days show the
// template's answer.
function PlanDayDetail({ d, profile, limits, suggestion, goalStyle, tests, sessions }) {
  const isMobility = d.key === 'deload' || d.key === 'mobility'
  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null
  const yearsClimbing = profile?.climbing_since
    ? Math.max(0, new Date().getFullYear() - Number(profile.climbing_since))
    : null
  const exercises = d.isToday
    ? suggestion.exercises
    : pickExercises(d.key, profile, suggestion.cycle.week, d.discipline, goalStyle, {
        age,
        yearsClimbing,
        injuredRegions: suggestion.injuredRegions,
      })
  const grades = d.isToday ? suggestion.grades : gradeRange(d.key, limits, exercises[0])
  const sheet = d.isToday
    ? suggestion.sheet
    : buildSessionSheet({
        typeKey: d.key,
        main: exercises[0],
        minutes: Number(profile?.session_minutes) || null,
        durationMult: d.durationMult,
        reduced: d.reduced,
        sets: exercises[0] ? hangPrescription(exercises[0], profile, tests, sessions, { volumeMult: d.durationMult })?.sets ?? null : null,
        profile,
        discipline: d.discipline,
        injuredRegions: suggestion.injuredRegions,
        age,
      })

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
              ? `${d.type.volume}, at about ${Math.round((d.durationMult || 0.5) * 100)}%, ${d.taper ? 'this is the taper' : "it's a deload"}`
              : d.durationMult !== 1
                ? `${d.type.volume}, at about ${Math.round(d.durationMult * 100)}% this week`
                : d.type.volume
          }
        />
        <SpecRow label="Rest" value={d.type.rest} />
        <SpecRow label="Target RPE" value={d.type.rpe} />
      </div>
      {sheet.parts.length > 0 && (
        <>
          <p className="muted small coach-week-detail-fit">
            {isMobility ? 'Routine:' : `The session, about ${sheet.total} min:`}
          </p>
          <ul className="coach-week-exlist">
            {sheet.parts.map((p, i) => (
              <li key={`${p.role}-${p.id}-${i}`}>
                <span className="sheet-role">{p.label}</span>{' '}
                {p.exercises ? p.name : <><span className="ex-id">{p.id}</span> {p.name}</>}
                <span className="muted small"> · ~{p.minutes} min</span>
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

// An alternative session, one line: enough to choose by, and one tap from
// becoming the session that's spelled out in full above.
function AlternativeRow({ ex, onPick, isCoachPick }) {
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
      {/* Which row hands the choice back, said on the row rather than only in
          the paragraph above it. */}
      <span className="alt-row-swap">{isCoachPick ? 'Coach’s pick' : 'Swap'}</span>
    </button>
  )
}

const RULE_LABELS = {
  start: 'starting load',
  progress: 'up 2.5%',
  repeat: 'same as last time',
  backoff: 'backed off',
  capped: 'top of the range',
}

// One prescribed workout. Max hangs turn into real kilos once the athlete has
// entered a hang max, but only while that test is recent enough to mean
// anything. A percentage of a number from six months ago is a number nobody
// knows, so past the staleness cut-off it goes back to describing the effort.
//
// With a `hang` prescription passed in (the Today card), the load is the one
// number the progression landed on, with the range beside it and the reason
// under it. Without one (the library) it is the range, resolved to kilos.
export function ExerciseCard({
  ex, primary, profile, tests = [], durationMult = 1, onPick = null, youPicked = false,
  hang = null, sets = null, minutesOverride = null,
}) {
  // Any exercise anchored on a percentage of max total load gets a real number
  // in kilos, including the assisted case (negative added weight is the normal
  // shape of submaximal finger work, not an error).
  const grip = ex.intensity?.grip && ex.intensity.grip !== 'rotating' ? ex.intensity.grip : 'halfcrimp'
  const max = ex.intensity?.anchor === 'pctMaxTotal' ? maxTotalFor(profile, tests, grip) : null
  const bw = Number(profile?.bodyweight_kg) || 0
  const rx = max?.kg && !max.stale ? prescribeHang(ex.intensity, max.kg, bw) : null
  const target = hang && !hang.blocked && hang.target && ex.intensity?.anchor === 'pctMaxTotal' ? hang.target : null

  const load = target
    ? `${target.kg} kg total${hang.targetAddedText ? ` (${hang.targetAddedText})` : ''} · ${RULE_LABELS[target.rule]}`
    : rx
      ? `${rx.pctText} · ${rx.totalText}${rx.addedText ? ` (${rx.addedText})` : ''}`
      : ex.load
  const edge = ex.intensity?.edge_mm ? `${ex.intensity.edge_mm} mm` : ex.edge
  const minutes = minutesOverride ?? (ex.minutes ? Math.round(ex.minutes * durationMult) : null)
  const librarySets = Number(String(ex.sets ?? '').match(/\d+/)?.[0]) || null
  const setsText = sets != null && librarySets && sets !== librarySets ? `${sets} (${librarySets} as written)` : ex.sets

  let note = null
  if (max?.stale) {
    note = `Your max test is ${max.weeks} weeks old; retest before working off percentages.`
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
      {ex.how && <p className="muted small ex-how">{ex.how}</p>}
      {ex.margin && <p className="muted small ex-how"><strong>Margin:</strong> {ex.margin}</p>}
      {note && <p className="auth-error small">{note}</p>}
      {target && (
        <p className="muted small ex-how">
          <strong>Load:</strong> {target.note}
          {target.last?.kg
            ? ` Last time, ${formatDayShort(target.last.date)}: ${Math.round(target.last.kg)} kg × ${target.last.setsDone}${target.last.outcome ? `, ${outcomeWord(target.last.outcome)}` : ''}.`
            : ''}
          {' '}Range for this session: {rx?.totalText || `${Math.round(target.loKg)}–${Math.round(target.hiKg)} kg total`}.
        </p>
      )}
      {(target ? hang.targetAdded != null && hang.targetAdded < 0 : rx?.assisted) && (
        <p className="muted small">
          That is below your bodyweight, so it is an assisted hang: pulley, band, or feet
          on the floor. This is the normal shape of submaximal finger work.
        </p>
      )}
      <div className="ex-meta">
        {ex.time && <Meta label="Time" value={ex.time} />}
        {ex.hold && <Meta label="Hold" value={ex.hold} />}
        {ex.reps && <Meta label="Reps" value={ex.reps} />}
        {setsText && <Meta label="Sets" value={setsText} />}
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

function outcomeWord(key) {
  return { nailed: 'nailed it', done: 'as planned', short: 'cut short', pain: 'ended in pain' }[key] || key
}

function Meta({ label, value }) {
  return (
    <span className="ex-meta-item">
      <span className="ex-meta-label">{label}</span>
      <span className="ex-meta-value">{value}</span>
    </span>
  )
}
