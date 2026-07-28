import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBack } from '../components/ui'
import { fetchSquad, severityBand } from '../lib/squad'
import { areaLabel, BODY_AREAS } from '../lib/wellness'
import { formatDayShort } from '../lib/format'

// The squad roll-up: this week's overuse picture for every athlete who has
// shared signals with you.
//
// This is what OSTRC-O was designed for. Weekly, per body area, per athlete,
// with substantial problems surfaced first, is the one screen a climbing coach
// actually needs and essentially nothing on the market provides.
//
// It shows state, never rank: who has a problem, who is under-recovered, who has
// not answered. There is no column for hang load, grade or bodyweight, and there
// must never be one.
export default function Squad() {
  const navigate = useNavigate()
  const back = useBack('/profile')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await fetchSquad())
    } catch (e) {
      setError(e.message || 'Could not load the squad')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <Page back={back}>
        <p className="auth-error">{error}</p>
        <p className="muted small">
          If this says a table is missing, apply the migrations with{' '}
          <code>npx supabase db push</code>.
        </p>
      </Page>
    )
  }

  if (!data) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (!data.athletes.length) {
    return (
      <Page back={back}>
        <div className="card empty-state">
          <p>Nobody has shared their signals with you.</p>
          <p className="muted small">
            Coaching someone gives you their sessions. Their check-in signals and weekly
            overuse answers are a separate grant, which they turn on per coach from their own
            profile and can withdraw at any time.
          </p>
        </div>
      </Page>
    )
  }

  return (
    <Page back={back}>
      <p className="muted small">
        Week of {formatDayShort(data.weekStart)}. {data.athletes.length} athlete
        {data.athletes.length === 1 ? '' : 's'} sharing.
      </p>

      <section className="card settings-card stack">
        <h2 className="step-q">This week</h2>
        <div className="squad-scroll">
          <table className="squad-table">
            <thead>
              <tr>
                <th scope="col">Athlete</th>
                {BODY_AREAS.map((a) => (
                  <th scope="col" key={a.key} title={a.label}>
                    <span aria-hidden="true">{a.emoji}</span>
                    <span className="sr-only">{a.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.athletes.map((ath) => (
                <tr key={ath.id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="squad-name"
                      onClick={() => navigate(`/athlete/${ath.id}`)}
                    >
                      {ath.name}
                    </button>
                  </th>
                  {BODY_AREAS.map((a) => {
                    const p = ath.problems.find((x) => x.area === a.key)
                    const band = severityBand(p?.severity, p?.substantial)
                    return (
                      <td key={a.key} className={`squad-cell is-${band}`}>
                        {p ? (
                          <span title={`${areaLabel(a.key)}: ${p.severity}/100`}>{p.severity}</span>
                        ) : (
                          <span className="muted" aria-hidden="true">
                            ·
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Numbers are the questionnaire's own 0 to 100 severity. A red cell is what the
          instrument calls a substantial problem: a moderate or worse reduction in training or
          performance, or being unable to take part at all.
        </p>
      </section>

      <section className="card settings-card stack">
        <h2 className="step-q">Where each of them is</h2>
        {data.athletes.map((ath) => (
          <div className="coach-finger coach-finger-planned" key={ath.id}>
            <div className="coach-finger-row">
              <span className="coach-finger-label">{ath.name}</span>
              <span className="coach-finger-state">
                {ath.snapshot?.readiness_index != null
                  ? `Readiness ${ath.snapshot.readiness_index}`
                  : 'No readiness yet'}
              </span>
            </div>
            <p className="muted small coach-finger-hint">
              {ath.snapshot
                ? [
                    ath.snapshot.finger_state ? `Fingers ${ath.snapshot.finger_state}` : null,
                    ath.snapshot.finger_days_7 != null
                      ? `${ath.snapshot.finger_days_7} hard finger days this week`
                      : null,
                    ath.snapshot.chronic_level && ath.snapshot.chronic_level !== 'ok'
                      ? `28-day count ${ath.snapshot.chronic_level}`
                      : null,
                    ath.snapshot.sustained_weeks > 3
                      ? `${ath.snapshot.sustained_weeks} weeks in a row with 2+ hard days`
                      : null,
                    ath.snapshot.checked_in ? null : 'Has not checked in today',
                    ath.stale ? `Last updated ${formatDayShort(ath.snapshot.date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Nothing shared yet. Their app writes this once they open it.'}
            </p>
            {!ath.reportedThisWeek && (
              <p className="muted small coach-finger-hint">
                No overuse answers this week, which is the thing most worth chasing: the
                questionnaire exists to catch a problem before anyone calls it an injury.
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="card settings-card stack">
        <h2 className="step-q">What you can and cannot see</h2>
        <p className="muted small">
          You see derived signals and the weekly overuse answers. You do not see their daily
          sleep, fatigue, soreness or stress entries, or anything they typed into a note. That
          is deliberate: an athlete who knows a coach reads the stress field stops filling in
          the stress field, and then the score stops working for the people who need it most.
        </p>
        <p className="muted small">
          There is no ranking here, and there will not be one. Comparing finger strength or
          grades across a squad of teenagers is the kind of pressure this app is built to avoid.
        </p>
        <p className="muted small">
          A training-awareness tool, not medical advice. Pain is the real signal; persistent
          symptoms belong with qualified health personnel, not an app.
        </p>
      </section>
    </Page>
  )
}

function Page({ back, children }) {
  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Squad</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>
      <main className="wizard-body stack">{children}</main>
    </div>
  )
}
