import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PillRow, useBack } from '../components/ui'
import { Bars, Line } from '../components/charts'
import SignalBlock from '../components/SignalBlock'
import { loadCoachInputs, readoutFrom, EMPTY_COACH_INPUTS } from '../lib/coachData'
import { hasLoggedToday } from '../lib/wellness'
import {
  fingerDoseSeries,
  dailyLoadSeries,
  trendSeries,
  monotonySeries,
  readinessSeries,
  readinessGateHint,
  MIN_EFFECTIVE_WEIGHT,
  FINGER_TIERS,
} from '../lib/coach'
import { asDate } from '../lib/format'
import { format } from 'date-fns'

const SIGNALS = [
  { key: 'finger', label: '🤏 Finger' },
  { key: 'readiness', label: '🔋 Readiness' },
  { key: 'load', label: '📈 Load' },
  { key: 'monotony', label: '🔁 Monotony' },
]

const TIER_COLORS = {
  maximal: 'var(--danger)',
  hard: '#f59e0b',
  light: '#22c55e',
  none: 'var(--border)',
}

const dayLabel = (iso) => format(asDate(iso), 'd/M')

// The story behind each coach signal: where the number is right now, how it
// has moved, and exactly which inputs produced it. One page, four tabs, so
// every headline number on the dashboard has a "why" one tap away.
export default function CoachSignals() {
  const navigate = useNavigate()
  const back = useBack('/coach')
  const { key } = useParams()
  const signal = SIGNALS.some((s) => s.key === key) ? key : 'finger'

  const [inputs, setInputs] = useState(EMPTY_COACH_INPUTS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setInputs(await loadCoachInputs())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('coach:changed', load)
    return () => window.removeEventListener('coach:changed', load)
  }, [load])

  const { sessions, profile, wellness, icu, fingerTests } = inputs
  const readout = useMemo(() => readoutFrom(inputs), [inputs])

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Signals</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <PillRow
          options={SIGNALS}
          value={signal}
          onChange={(k) => navigate(`/coach/signals/${k}`, { replace: true })}
          scroll
        />

        {signal === 'finger' && (
          <FingerDetail
            readout={readout}
            sessions={sessions}
            profile={profile}
            tests={fingerTests}
          />
        )}
        {signal === 'readiness' && (
          <ReadinessDetail
            readout={readout}
            sessions={sessions}
            wellness={wellness}
            icu={icu}
            onCheckIn={() => navigate('/checkin')}
          />
        )}
        {signal === 'load' && <LoadDetail readout={readout} sessions={sessions} />}
        {signal === 'monotony' && <MonotonyDetail readout={readout} sessions={sessions} />}

        <p className="muted coach-disclaimer">
          A training-awareness tool, not medical advice. Pain is your real signal; see a
          professional for persistent symptoms.
        </p>
      </main>
    </div>
  )
}

function ChartCard({ title, value, note, children }) {
  return (
    <div className="card chart-card">
      <div className="chart-card-head">
        <span className="chart-card-title">{title}</span>
        {value != null && <span className="chart-card-value">{value}</span>}
      </div>
      {children}
      {note && <p className="muted small chart-note">{note}</p>}
    </div>
  )
}

function WhyRow({ label, value }) {
  return (
    <div className="coach-spec-row">
      <span className="coach-spec-label">{label}</span>
      <span className="coach-spec-value">{value}</span>
    </div>
  )
}

// ---- finger tissue ----------------------------------------------------------
function FingerDetail({ readout, sessions, profile, tests }) {
  const { recovery, limits } = readout
  // The tests matter here too: without your tested max, a hangboard set is
  // scored off edge size alone, and the chart would disagree with the headline
  // number above it.
  const series = useMemo(
    () => fingerDoseSeries(sessions, limits, profile, 28, tests),
    [sessions, limits, profile, tests],
  )
  const bars = series.map((d) => ({
    label: dayLabel(d.date),
    value: d.dose,
    color: TIER_COLORS[d.tier],
  }))

  return (
    <>
      <SignalBlock
        title="🤏 Finger tissue"
        state={recovery.label}
        tone={recovery.tone}
        hint={recovery.hint}
      />

      <ChartCard
        title="Finger dose, last 28 days"
        note="Each bar is one day's total finger load, computed from your hangboard sets, campus work and near-limit attempts. Red = maximal, orange = hard, green = light. The dose numbers are arbitrary units; the pattern is what matters."
      >
        <Bars data={bars} />
      </ChartCard>

      <section className="card settings-card stack">
        <h2 className="step-q">Why it says {recovery.label.toLowerCase()}</h2>
        <div className="coach-spec">
          <WhyRow
            label="Last hard session"
            value={
              recovery.daysSinceMax == null
                ? 'None recently'
                : recovery.daysSinceMax === 0
                  ? 'Today'
                  : `${recovery.daysSinceMax} day${recovery.daysSinceMax === 1 ? '' : 's'} ago`
            }
          />
          {recovery.lastTier && (
            <WhyRow
              label="How hard it was"
              value={`${FINGER_TIERS[recovery.lastTier].label} · needs ~${recovery.required * 24} h`}
            />
          )}
          <WhyRow label="Hard finger days, last 7" value={recovery.days7} />
          <WhyRow label="Hard finger days, last 28" value={recovery.days28} />
          {recovery.sustainedWeeks > 0 && (
            <WhyRow
              label="Weeks in a row with 2+ hard days"
              value={recovery.sustainedWeeks}
            />
          )}
        </div>
        {recovery.lastWhy?.length > 0 && (
          <>
            <p className="muted small">What made the last hard session hard:</p>
            <div className="coach-reasons">
              {recovery.lastWhy.map((w) => (
                <span className="coach-reason" key={w}>
                  {w}
                </span>
              ))}
            </div>
          </>
        )}
        {recovery.rampFlag && (
          <p className="auth-error">
            More hard finger days this week than your recent normal: a ramp, not a
            routine. Worth easing in.
          </p>
        )}
        {recovery.chronicLevel !== 'ok' && (
          <>
            <p className={recovery.chronicLevel === 'elevated' ? 'muted small' : 'auth-error'}>
              {recovery.days28} hard finger days in 28 days is{' '}
              {recovery.chronicLevel === 'very-high'
                ? 'a very high'
                : recovery.chronicLevel === 'high'
                  ? 'a high'
                  : 'an elevated'}{' '}
              chronic level, and connective tissue adapts slower than muscle.
            </p>
            {/* The mechanism above is well supported. The number it is being
                compared against is not, and saying so next to it is more
                trustworthy than a disclaimer three taps away. */}
            <p className="muted small">
              The line it is measured against ({recovery.chronicCeiling?.high} high,{' '}
              {recovery.chronicCeiling?.veryHigh} very high, scaled to your years climbing) is a
              starting point, not a finding. It was chosen so the model behaves, and it may not
              fit you.
            </p>
          </>
        )}
        <p className="muted small">
          Crimping strains pulleys and finger tendons, and the tissue rebuilds over days:
          net loss for roughly the first 24–36 h, net synthesis at ~36–72 h. A maximal
          session wants ~72 h before the next one, a hard session ~48 h. Pump is
          deliberately not counted: it is metabolic and clears in hours.
        </p>
        <p className="muted small">
          The rebuild window above is the well-supported part. The dose numbers, the tier cuts
          and the day counts are chosen so the model behaves sensibly, and they are the parts
          most likely to be wrong for you.
        </p>
      </section>
    </>
  )
}

// ---- readiness --------------------------------------------------------------
function ReadinessDetail({ readout, sessions, wellness, icu, onCheckIn }) {
  const { readiness } = readout
  const series = useMemo(
    () => readinessSeries(sessions, wellness, icu, 42),
    [sessions, wellness, icu],
  )
  const line = series.map((p) => ({
    label: dayLabel(p.date),
    value: p.index,
  }))
  const hasHistory = line.some((p) => p.value != null)

  return (
    <>
      <SignalBlock
        title="🔋 Readiness"
        state={readiness.enough ? `${readiness.index} · ${readiness.label}` : 'Building baseline'}
        tone={readiness.enough ? readiness.tone : 'ok'}
        hint={
          readiness.enough
            ? 'Your own normal is 50. Each input is scored against your own baseline (how far this week sits from a typical week of yours), then weighted together.'
            : readinessGateHint(readiness)
        }
      />

      {!hasLoggedToday(wellness) && (
        <button
          type="button"
          className="btn btn-primary btn-block settings-link-row"
          onClick={onCheckIn}
        >
          <span>How are you today? Check in →</span>
          <span className="settings-link-arrow">›</span>
        </button>
      )}

      <ChartCard
        title="Readiness, last 42 days"
        value={readiness.enough ? String(readiness.index) : '-'}
        note="50 is your own normal, not anyone else's. Gaps are days the baseline wasn't good enough to score. Re-computed from what the data said on each day."
      >
        {hasHistory ? (
          <Line data={line} fromZero={false} color="var(--primary)" />
        ) : (
          <p className="muted small">
            Nothing to chart yet. The line starts once your check-ins, or HRV from
            intervals.icu, have about three weeks behind them.
          </p>
        )}
      </ChartCard>

      {readiness.signals && (
        <section className="card settings-card stack">
          <h2 className="step-q">What feeds it</h2>
          <div className="coach-spec">
            {readiness.signals.map((s) => (
              <WhyRow
                key={s.key}
                label={`${s.label} · weight ${Math.round(s.weight * 100)}%`}
                value={
                  s.z != null
                    ? `${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)} SD ${s.z >= 0.3 ? '· better than usual' : s.z <= -0.3 ? '· worse than usual' : '· about normal'}`
                    : s.days
                      ? `${s.days} day${s.days === 1 ? '' : 's'}, no baseline yet`
                      : 'no data'
                }
              />
            ))}
          </div>
          <p className="muted small">
            Sleep, fatigue, soreness and stress come from your daily check-ins and carry
            half the total weight. HRV and resting heart rate come from intervals.icu when
            connected. Form is the app's own fitness-minus-fatigue. Every input is a
            z-score against your own recent weeks, and each one needs about three weeks of
            its own history before it can be scored.
          </p>
          <p className="muted small">
            Missing inputs re-weight the rest, but only down to{' '}
            {Math.round(MIN_EFFECTIVE_WEIGHT * 100)}% of the weight
            {readiness.coverage != null && readiness.coverage < 1
              ? ` (yours is at ${Math.round(readiness.coverage * 100)}%)`
              : ''}
            . Below that the score is pulled back toward 50 instead, so one input can never
            become the whole number. Form gets a tighter cap than the rest and cannot carry
            the score alone: form drops through any hard block, and that is the training
            working, not a sign you need a rest day.
          </p>
          {readiness.subjectiveMissing && (
            <p className="auth-error">
              Running on objective data only, as you haven't checked in this week. The
              subjective half is the part that actually tracks how you feel.
            </p>
          )}
          {readiness.subjectiveThin && (
            <p className="muted small">
              Running on thin subjective data: {readiness.recentWellness} check-in
              {readiness.recentWellness === 1 ? '' : 's'} in the last 7 days. It still counts,
              and it says so here rather than switching itself on and off around a threshold,
              which made the score jump for reasons you could not see.
            </p>
          )}
          {/* The z-score cannot see a baseline that has been bad for weeks, by
              construction. The absolute check is the counterpart. */}
          {(readiness.sustained || []).map((s) => (
            <p className="auth-error" key={s.key}>
              Your {s.label.toLowerCase()} has been poor {s.days} of the last {s.of} days.
              {readiness.enough
                ? ' Readiness compares you against your own recent normal, and your recent normal has been low, so the score can read fine while you do not.'
                : ' This one is measured against the scale itself, not against your own normal, so it works before there is a score.'}
            </p>
          ))}
          <p className="muted small">
            50 as your normal, 10 points per standard deviation, the weights above, the{' '}
            {Math.round(MIN_EFFECTIVE_WEIGHT * 100)}% floor and form's tighter cap are all chosen
            numbers rather than findings. The construction (7-day means against the spread of
            7-day means, windows that never overlap) is the part worth trusting.
          </p>
        </section>
      )}
    </>
  )
}

// ---- load trend -------------------------------------------------------------
function LoadDetail({ readout, sessions }) {
  const { trend } = readout
  const daily = useMemo(() => dailyLoadSeries(sessions, 28), [sessions])
  const ratio = useMemo(() => trendSeries(sessions, 42), [sessions])

  const bars = daily.map((d) => ({ label: dayLabel(d.date), value: Math.round(d.load) }))
  const line = ratio.map((p) => ({ label: dayLabel(p.date), value: p.pct }))
  const hasRatio = line.some((p) => p.value != null)

  return (
    <>
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

      <ChartCard
        title="This week vs your normal"
        value={trend.enough ? trend.pctLabel : '-'}
        note="100% = this week matches the average of the four weeks before it. The two windows never overlap, so the comparison is honest. Gaps are stretches without enough baseline. Deliberately not an 'injury risk zone'; that framework hasn't held up."
      >
        {hasRatio ? (
          <Line data={line} fromZero={false} color="var(--primary)" fmt={(v) => `${v}%`} />
        ) : (
          <p className="muted small">Not enough steady training yet to chart a baseline.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Daily training load, last 28 days"
        note="All sports count, and your tendons don't care which sport the load came from. From imported TSS when available, otherwise estimated from duration × intensity."
      >
        <Bars data={bars} color="var(--primary)" />
      </ChartCard>

      {trend.enough && (
        <section className="card settings-card stack">
          <h2 className="step-q">The arithmetic</h2>
          <div className="coach-spec">
            <WhyRow label="This week, avg per day" value={`${Math.round(trend.acute)} AU`} />
            <WhyRow
              label="The 4 weeks before, avg per day"
              value={`${Math.round(trend.chronic)} AU`}
            />
            <WhyRow label="Ratio" value={trend.pctLabel} />
          </div>
        </section>
      )}
    </>
  )
}

// ---- monotony ---------------------------------------------------------------
function MonotonyDetail({ readout, sessions }) {
  const { monotony } = readout
  const series = useMemo(() => monotonySeries(sessions, 42), [sessions])
  const week = useMemo(() => dailyLoadSeries(sessions, 7), [sessions])

  const line = series.map((p) => ({ label: dayLabel(p.date), value: p.monotony }))
  const hasHistory = line.some((p) => p.value != null)
  const weekBars = week.map((d) => ({
    label: format(asDate(d.date), 'EEE'),
    value: Math.round(d.load),
  }))

  return (
    <>
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
              ? `Judged over the days you train, and ${monotony.activeDays} is too few to tell a varied week from a flat one.`
              : 'Nothing logged this week yet.'
            : monotony.flag
              ? 'Your sessions look much the same. Making hard days harder and easy days easier tends to beat a flat week.'
              : 'Good spread between your hard and easy sessions.'
        }
      />

      <ChartCard
        title="Monotony, last 42 days"
        value={monotony.enough && monotony.monotony != null ? monotony.monotony.toFixed(1) : '-'}
        note={`The spread of your sessions: average load across the days you trained, divided by how much they differ. Above ${monotony.threshold ?? 4} means they are nearly all the same session. Gaps are weeks with under 5 training days.`}
      >
        {hasHistory ? (
          <Line data={line} fromZero={false} color="var(--primary)" />
        ) : (
          <p className="muted small">Not enough training days yet to chart this.</p>
        )}
      </ChartCard>

      <ChartCard
        title="This week, day by day"
        note="Monotony is low when this picture is spiky, hard days clearly harder than easy days, and high when it is flat."
      >
        <Bars data={weekBars} color="var(--primary)" />
      </ChartCard>

      {monotony.enough && (
        <section className="card settings-card stack">
          <h2 className="step-q">The arithmetic</h2>
          <div className="coach-spec">
            <WhyRow label="Weekly load" value={`${Math.round(monotony.weeklyLoad)} AU`} />
            <WhyRow label="Days trained" value={monotony.activeDays} />
            <WhyRow
              label="Monotony"
              value={monotony.monotony == null ? 'Off the scale (a flat week)' : monotony.monotony.toFixed(2)}
            />
            {monotony.strain != null && (
              <WhyRow label="Strain (load × monotony)" value={Math.round(monotony.strain)} />
            )}
          </div>
        </section>
      )}

      {/* This is not Foster's monotony and should not claim to be. Foster
          divides by the spread of all seven days, rest days included as zeros,
          which for anyone who takes rest days can only ever produce "steady":
          three sessions a week lands near 0.87 against a threshold of 2. */}
      <section className="card settings-card stack">
        <h2 className="step-q">Why this is not Foster's number</h2>
        <p className="muted small">
          Foster's monotony divides by the spread of all seven days, counting rest days as
          zeros. Done that way, a three-session week scores about 0.9 and a four-session week
          about 1.2, so the usual threshold of 2 can only ever be reached by someone training
          six or seven days a week: the signal would read “steady” forever no matter what you
          did. This version uses only the days you trained, which measures whether your
          sessions differ from each other rather than whether you train every day.
        </p>
        <p className="muted small">
          The threshold moved with it, because the denominator changed: over training days a
          week with real hard/easy contrast sits around 2 to 3.5, and only near-identical
          sessions pass {monotony.threshold ?? 4}. That number is chosen, like the old one was.
        </p>
      </section>
    </>
  )
}
