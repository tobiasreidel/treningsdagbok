import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboardWidgets, setDashboardWidgets } from '../lib/prefs'
import { WIDGET_MAP, WIDGET_GROUPS } from '../components/DashboardWidgets'

// Manage which stat cards appear on the dashboard, and in what order. Changes
// persist immediately (local pref), so the dashboard reflects them on return.
export default function CustomizeDashboard() {
  const navigate = useNavigate()
  const [ids, setIds] = useState(() => getDashboardWidgets().filter((id) => WIDGET_MAP[id]))

  const persist = (next) => {
    setIds(next)
    setDashboardWidgets(next)
  }

  const add = (id) => {
    if (ids.includes(id)) return
    persist([...ids, id])
  }
  const remove = (id) => persist(ids.filter((x) => x !== id))
  const move = (index, dir) => {
    const next = [...ids]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Customize dashboard</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <section className="stack">
          <h2 className="step-q">On your dashboard</h2>
          {ids.length === 0 ? (
            <p className="muted small">
              No widgets yet. Add some from the list below.
            </p>
          ) : (
            <div className="wm-list">
              {ids.map((id, i) => {
                const w = WIDGET_MAP[id]
                return (
                  <div className="card wm-item" key={id}>
                    <span className="wm-item-main">
                      <span className="wm-item-title">{w.title}</span>
                      <span className="wm-item-desc">{w.desc}</span>
                    </span>
                    <span className="wm-controls">
                      <button
                        className="wm-btn"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="wm-btn"
                        onClick={() => move(i, 1)}
                        disabled={i === ids.length - 1}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="wm-btn wm-btn-danger"
                        onClick={() => remove(id)}
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="stack">
          <h2 className="step-q">Add widgets</h2>
          {WIDGET_GROUPS.map((group) => (
            <div className="wm-group" key={group.key}>
              <div className="wm-group-head">
                <span className="wm-group-emoji">{group.emoji}</span>
                {group.label}
              </div>
              <div className="wm-list">
                {group.widgets.map((w) => {
                  const added = ids.includes(w.id)
                  return (
                    <div className="card wm-item" key={w.id}>
                      <span className="wm-item-main">
                        <span className="wm-item-title">{w.title}</span>
                        <span className="wm-item-desc">{w.desc}</span>
                      </span>
                      <button
                        className={`btn btn-sm ${added ? 'btn-ghost' : 'btn-secondary'} wm-add`}
                        onClick={() => add(w.id)}
                        disabled={added}
                      >
                        {added ? 'Added ✓' : '+ Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="wizard-foot">
        <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
          Done
        </button>
      </footer>
    </div>
  )
}
