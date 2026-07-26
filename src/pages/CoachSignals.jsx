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
          A training-awareness tool, not medical advice. Pain is your real signal — see a
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
        note="Each bar is one day's total finger load, computed from your hangboard sets, campus work and near-limit attempts. Red = maximal, orange = hard, green = light. The dose numbers are arbitrary units — the pattern is what matters."
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
            More hard finger days this week than your recent normal — a ramp, not a
            routine. Worth easing in.
          </p>
        )}
        {recovery.chronicLevel !== 'ok' && (
          <p className="auth-error">
            {recovery.days28} hard finger days in 28 days is a{' '}
            {recovery.chronicLevel === 'very-high' ? 'very high' : 'high'} chronic level —
            connective tissue adapts slower than muscle.
          </p>
        )}
        <p className="muted small">
          Crimping strains pulleys and finger tendons, and the tissue rebuilds over days:
          net loss for roughly the first 24–36 h, net synthesis at ~36–72 h. A maximal
          session wants ~72 h before the next one, a hard session ~48 h. Pump is
          deliberately not counted — it is metabolic and clears in hours.
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
            ? 'Your own normal is 50. Each input is scored against your own baseline — how far this week sits from a typical week of yours — then weighted together.'
            : readiness.reason === 'signals'
              ? 'You have the history, but nothing to measure against yet. Check in daily — that is what this is built from.'
              : `Needs about ${readiness.needDays ?? 21} days of history before it means anything. Keep logging.`
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
        value={readiness.enough ? String(readiness.index) : '—'}
        note="50 is your own normal, not anyone else's. Gaps are days the baseline wasn't good enough to score. Re-computed from what the data said on each day."
      >
        {hasHistory ? (
          <Line data={line} fromZero={false} color="var(--primary)" />
        ) : (
          <p className="muted small">
            Nothing to chart yet — the score needs ~3 weeks of history before it starts.
          </p>
        )}
      </ChartCard>

      {readiness.enough && (
        <section className="card settings-card stack">
          <h2 className="step-q">What feeds it</h2>
          <div className="coach-spec">
            {readiness.signals.map((s) => (
              <WhyRow
                key={s.key}
                label={`${s.label} · weight ${Math.round(s.weight * 100)}%`}
                value={
                  s.z == null
                    ? 'no data'
                    : `${s.z >= 0 ? '+' : ''}${s.z.toFixed(1)} SD ${s.z >= 0.3 ? '· better than usual' : s.z <= -0.3 ? '· worse than usual' : '· about normal'}`
                }
              />
            ))}
          </div>
          <p className="muted small">
            Sleep, fatigue, soreness and stress come from your daily check-ins and carry
            half the total weight. HRV and resting heart rate come from intervals.icu when
            connected. Form is the app's own fitness-minus-fatigue. Every input is a
            z-score against your own recent weeks; missing inputs simply drop out and the
            rest re-weight.
          </p>
          {readiness.subjectiveMissing && (
            <p className="auth-error">
              Running on objective data only — you haven't checked in enough this week
              (needs 4 of the last 7 days). The subjective half is the part that actually
              tracks how you feel.
            </p>
          )}
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
        value={trend.enough ? trend.pctLabel : '—'}
        note="100% = this week matches the average of the four weeks before it. The two windows never overlap, so the comparison is honest. Gaps are stretches without enough baseline. Deliberately not an 'injury risk zone' — that framework hasn't held up."
      >
        {hasRatio ? (
          <Line data={line} fromZero={false} color="var(--primary)" fmt={(v) => `${v}%`} />
        ) : (
          <p className="muted small">Not enough steady training yet to chart a baseline.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Daily training load, last 28 days"
        note="All sports count — your tendons don't care which sport the load came from. From imported TSS when available, otherwise estimated from duration × intensity."
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
      />

      <ChartCard
        title="Monotony, last 42 days"
        value={monotony.enough && monotony.monotony != null ? monotony.monotony.toFixed(1) : '—'}
        note="Foster's monotony: the week's average daily load divided by its day-to-day spread. Above ~2 for weeks on end is the pattern linked with overtraining symptoms — same total load, worse outcome. Gaps are weeks with under 3 training days."
      >
        {hasHistory ? (
          <Line data={line} fromZero={false} color="var(--primary)" />
        ) : (
          <p className="muted small">Not enough training days yet to chart this.</p>
        )}
      </ChartCard>

      <ChartCard
        title="This week, day by day"
        note="Monotony is low when this picture is spiky — hard days clearly harder than easy days — and high when it is flat."
      >
        <Bars data={weekBars} color="var(--primary)" />
      </ChartCard>

      {monotony.enough && (
        <section className="card settings-card stack">
          <h2 className="step-q">The arithmetic</h2>
          <div className="coach-spec">
            <WhyRow label="Weekly load" value={`${Math.round(monotony.weeklyLoad)} AU`} />
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
    </>
  )
}
