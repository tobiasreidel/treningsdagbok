import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CHANGELOG } from '../lib/changelog'

// A plain "what's new" log, newest first. Reached from Settings → About.
// Entries live in lib/changelog.js.
export default function Changelog() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>What’s new</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        {CHANGELOG.map((rel) => (
          <section className="card settings-card stack changelog-entry" key={rel.date}>
            <div className="changelog-head">
              <h2 className="changelog-title">{rel.title}</h2>
              <span className="muted small">{format(parseISO(rel.date), 'd MMM yyyy')}</span>
            </div>
            <ul className="changelog-list">
              {rel.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="muted small settings-autosave">That’s everything, you’re all caught up. 🎉</p>
      </main>
    </div>
  )
}
