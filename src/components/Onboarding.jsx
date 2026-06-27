import { useState } from 'react'
import { SPORTS } from '../lib/constants'
import { ALL_SPORTS, setEnabledSports, setOnboarded } from '../lib/prefs'

// First-run screen: pick the sports you do. This seeds your enabled sports
// (changeable any time in Settings) so the app shows only what's relevant.
export default function Onboarding({ userId, onDone }) {
  const [picked, setPicked] = useState([])

  const toggle = (key) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const finish = () => {
    if (!picked.length) return
    setEnabledSports(picked)
    setOnboarded(userId)
    onDone()
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <span style={{ width: 40 }} />
        <div className="wizard-title">
          <h1>Welcome 👋</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        <section className="stack">
          <h2 className="step-q">Which sports do you do?</h2>
          <p className="muted small">
            Pick the ones you train. The app will focus on these, and you can
            change them later in Settings.
          </p>
          <div className="segmented" style={{ '--cols': 2 }}>
            {ALL_SPORTS.map((key) => {
              const sport = SPORTS[key]
              return (
                <button
                  key={key}
                  type="button"
                  className={`seg-btn ${picked.includes(key) ? 'is-active' : ''}`}
                  onClick={() => toggle(key)}
                >
                  <span className="seg-emoji">{sport.emoji}</span>
                  <span>{sport.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      </main>

      <footer className="wizard-foot">
        <button className="btn btn-primary btn-block" onClick={finish} disabled={!picked.length}>
          {picked.length ? 'Get started' : 'Pick at least one'}
        </button>
      </footer>
    </div>
  )
}
