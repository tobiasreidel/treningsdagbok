import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadCoachInputs, readoutFrom, EMPTY_COACH_INPUTS } from '../lib/coachData'
import { isProfileComplete } from '../lib/coachProfile'
import { hasLoggedToday } from '../lib/wellness'
import SignalBlock from './SignalBlock'

// Dashboard card shown when the Training coach is on (Settings → Training
// coach). Reads only the sessions you already log. The summary lives here;
// the full breakdown and the plan are on /coach. Framed as awareness, never a
// prediction or a risk score.
export default function CoachCard({ sessions, injuries }) {
  const navigate = useNavigate()
  // Everything but the sessions, which the dashboard already holds and passes
  // in. Same inputs as /coach, so the card can't disagree with the page it
  // summarises (see lib/coachData.js).
  const [inputs, setInputs] = useState(EMPTY_COACH_INPUTS)

  useEffect(() => {
    let alive = true
    const load = () => {
      loadCoachInputs({ sessions: [] })
        .then((i) => alive && setInputs(i))
        .catch(() => {})
    }
    load()
    window.addEventListener('coach:changed', load)
    return () => {
      alive = false
      window.removeEventListener('coach:changed', load)
    }
  }, [])

  const { recovery, suggestion, readiness, goalPhase } = useMemo(
    () => readoutFrom({ ...inputs, sessions, injuries }),
    [inputs, sessions, injuries],
  )
  const setUp = isProfileComplete(inputs.profile)

  const sinceLabel =
    recovery.daysSinceMax == null
      ? 'none logged recently'
      : recovery.daysSinceMax === 0
        ? 'today'
        : `${recovery.daysSinceMax} day${recovery.daysSinceMax === 1 ? '' : 's'} ago`

  // The readiness block below already shows the number - repeating it as a
  // reason chip said the same thing twice on one card.
  const reasons = (readiness.enough
    ? suggestion.reasons.filter((r) => !/^Readiness \d+$/.test(r.text))
    : suggestion.reasons)
  // One line, not a chip cloud: the reason the session changed is the single
  // most useful thing on this card, and five equal-weight chips bury it.
  const primary = reasons.find((r) => r.changed) || reasons[0] || null
  const rest = reasons.filter((r) => r !== primary)

  return (
    <div className="card coach-card">
      <div className="coach-head">
        <span className="coach-title">
          🧭 Today <span className="beta-tag">beta</span>
        </span>
        <span className={`coach-dot coach-dot-${suggestion.tone}`} aria-hidden="true" />
      </div>

      <strong className="coach-suggest-title">
        {suggestion.type.emoji} {suggestion.type.label}
      </strong>
      <p className="muted small coach-detail">
        {suggestion.chosen && suggestion.key !== 'deload'
          ? `${suggestion.chosen.id} · ${suggestion.chosen.name}`
          : suggestion.type.goal}
        {suggestion.grades ? ` · around ${suggestion.grades.text}` : ''}
      </p>
      {goalPhase && (
        <p className="muted small coach-detail">
          {goalPhase.phase.label} phase · {goalPhase.goal.title} in {goalPhase.days} day
          {goalPhase.days === 1 ? '' : 's'}
        </p>
      )}
      {primary && (
        <p className={`coach-why ${primary.changed ? 'is-changed' : ''}`}>{primary.text}</p>
      )}
      {rest.length > 0 && (
        <div className="coach-reasons">
          {rest.map((r) => (
            <span className="coach-reason" key={r.text}>{r.text}</span>
          ))}
        </div>
      )}

      <SignalBlock
        title="🤏 Finger tissue"
        state={recovery.label}
        tone={recovery.tone}
        hint={<span className="coach-nowrap">Last hard load: {sinceLabel}.</span>}
        onPress={() => navigate('/coach/signals/finger')}
      />

      {readiness.enough && (
        <SignalBlock
          title="🔋 Readiness"
          state={`${readiness.index} · ${readiness.label}`}
          tone={readiness.tone}
          onPress={() => navigate('/coach/signals/readiness')}
        />
      )}

      {setUp && !hasLoggedToday(inputs.wellness) && (
        <button
          type="button"
          className="btn btn-primary btn-block settings-link-row"
          onClick={() => navigate('/checkin')}
        >
          <span>How are you today?</span>
          <span className="settings-link-arrow">›</span>
        </button>
      )}

      <button
        type="button"
        className={`btn ${setUp ? 'btn-secondary' : 'btn-primary'} btn-block settings-link-row`}
        onClick={() => navigate(setUp ? '/coach' : '/coach/setup')}
      >
        <span>{setUp ? 'See the full session' : 'Set up the coach'}</span>
        <span className="settings-link-arrow">›</span>
      </button>
      {!setUp && (
        <p className="muted small">
          Tell it what you climb and it can give you a real session instead of a
          generic one.
        </p>
      )}

      <p className="muted coach-disclaimer">
        Awareness, not medical advice. Pain is your real signal.
      </p>
    </div>
  )
}
