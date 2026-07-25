import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PillRow } from '../components/ui'
import {
  FINGER_EXERCISES,
  ROPE_EXERCISES,
  BOULDER_EXERCISES,
  GYM_EXERCISES,
  STRETCH_EXERCISES,
  STRETCH_PROTOCOL,
  PUMP_SCALE,
  MATRIX_ROWS,
  MATRIX_COLUMNS,
  EXERCISE_MAP,
} from '../lib/exercises'
import { fetchCoachProfile } from '../lib/coachProfile'
import { ExerciseCard } from './Coach'

// The whole training plan, browsable. The coach picks from this; this page is
// where you look up what a session actually means, or plan one yourself.
const TABS = [
  { key: 'finger', label: '🤏 Finger', list: FINGER_EXERCISES },
  { key: 'boulder', label: '🪨 Boulder', list: BOULDER_EXERCISES },
  { key: 'rope', label: '🧗 Rope', list: ROPE_EXERCISES },
  { key: 'strength', label: '🏋 Strength', list: GYM_EXERCISES },
  { key: 'stretch', label: '🧘 Mobility', list: STRETCH_EXERCISES },
  { key: 'menu', label: '🗓 Session menu', list: null },
]

export default function CoachLibrary() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('finger')
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetchCoachProfile()
      .then((p) => setProfile(p?.missingTable ? null : p))
      .catch(() => {})
  }, [])

  const active = TABS.find((t) => t.key === tab)

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/coach')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Exercise library</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <PillRow
          options={TABS.map((t) => ({ key: t.key, label: t.label }))}
          value={tab}
          onChange={setTab}
          scroll
        />

        {tab === 'menu' ? (
          <SessionMenu />
        ) : (
          <>
            {tab === 'stretch' && <p className="muted small">{STRETCH_PROTOCOL}</p>}
            <div className="stack">
              {active.list.map((ex) => (
                <ExerciseCard key={ex.id} ex={ex} profile={profile} />
              ))}
            </div>
          </>
        )}

        <section className="card settings-card stack">
          <h2 className="step-q">Pump scale</h2>
          <p className="muted small">
            Used throughout the plan, and what the “Pump” rating on a session means. It is
            deliberately separate from finger load: pump clears in hours, finger tissue
            takes days.
          </p>
          <div className="coach-spec">
            {PUMP_SCALE.map((p) => (
              <div className="coach-spec-row" key={p.level}>
                <span className="coach-spec-label">
                  {p.level} · {p.label}
                </span>
                <span className="coach-spec-value">{p.quality}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

// The intensity × category grid: what to do at each tier for each kind of
// session. Rendered a column at a time so it reads on a phone.
function SessionMenu() {
  const [col, setCol] = useState(MATRIX_COLUMNS[0].key)
  const column = MATRIX_COLUMNS.find((c) => c.key === col)

  return (
    <>
      <p className="muted small">
        Pick the kind of session, then read across the tiers — easy at the top, hard at the
        bottom.
      </p>
      <PillRow
        options={MATRIX_COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
        value={col}
        onChange={setCol}
        scroll
      />
      <h3 className="coach-sub">{column.label}</h3>
      <div className="stack">
        {MATRIX_ROWS.map((row) => {
          const cell = row.cells[col]
          const ex = cell.ex ? EXERCISE_MAP[cell.ex] : null
          return (
            <div className="menu-row" key={row.level}>
              <div className="menu-tier">
                <span className={`menu-level menu-level-${row.level}`}>{row.level}</span>
                <span className="menu-tier-label">{row.label}</span>
              </div>
              <div className="menu-body">
                <span className="menu-text">{cell.text}</span>
                {cell.pump && (
                  <span className="muted small">
                    Pump {cell.pump[0] === cell.pump[1] ? cell.pump[0] : `${cell.pump[0]}–${cell.pump[1]}`}
                  </span>
                )}
                {ex && <span className="menu-ref">See {ex.id} · {ex.name}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
