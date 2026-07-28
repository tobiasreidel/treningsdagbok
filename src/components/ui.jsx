import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Reusable, touch-friendly form controls. Big tap targets, one-handed use.

// A back button that actually goes back. Pushing the parent route instead
// (navigate('/coach')) grows the history every tap, so back then bounces
// between the two screens forever. Real history-back when there is somewhere
// to go back to; the fallback covers deep links and fresh PWA launches, where
// this screen is the first history entry.
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

export function Field({ label, hint, children, optional, required }) {
  return (
    <label className="field">
      {label && (
        <span className="field-label">
          {label}
          {optional && <span className="field-optional"> · optional</span>}
          {required && <span className="field-required"> *</span>}
        </span>
      )}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

// Single-choice large buttons. `columns` controls the grid.
export function Segmented({ options, value, onChange, columns = 2 }) {
  return (
    <div className="segmented" style={{ '--cols': columns }}>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`seg-btn ${value === opt.key ? 'is-active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.emoji && <span className="seg-emoji">{opt.emoji}</span>}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

// 1..max numeric scale (feeling, RPE). Renders tappable pills.
//
// Anything longer than six steps wraps onto two rows. Ten buttons in a row
// inside a 375 px card leaves about 26 px each, which is a little over half the
// 44 px practical touch-target minimum, on the control that gets touched most
// often, with chalky fingers, in a gym. Two rows of five gives roughly 60 px.
export function Scale({ min = 1, max = 5, value, onChange, lowLabel, highLabel }) {
  const nums = []
  for (let i = min; i <= max; i += 1) nums.push(i)
  const cols = nums.length <= 6 ? nums.length : Math.ceil(nums.length / 2)
  return (
    <div className="scale-wrap">
      <div className="scale" style={{ '--n': cols }}>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            className={`scale-btn ${value === n ? 'is-active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="scale-ends">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  )
}

export function NumberField({ value, onChange, placeholder, unit, step = 'any', min = 0 }) {
  return (
    <div className="num-field">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </div>
  )
}

// Multi-select chips (e.g. grades worked this session).
export function Chips({ options, value = [], onChange }) {
  const toggle = (key) => {
    if (value.includes(key)) onChange(value.filter((k) => k !== key))
    else onChange([...value, key])
  }
  return (
    <div className="chips">
      {options.map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.key
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={key}
            type="button"
            className={`chip ${value.includes(key) ? 'is-active' : ''}`}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Single-select chip row (e.g. choose one grade for a route). The selection is
// still a single value; `isActive(key, value)` lets a caller light up more than
// one chip for a given value (e.g. a 2nd-go send also marks Redpoint).
export function ChipSelect({ options, value, onChange, isActive }) {
  return (
    <div className="chips">
      {options.map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.key
        const label = typeof opt === 'string' ? opt : opt.label
        const active = isActive ? isActive(key, value) : value === key
        return (
          <button
            key={key}
            type="button"
            className={`chip ${active ? 'is-active' : ''}`}
            onClick={() => onChange(value === key ? null : key)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Single-select pill row (range/tab/filter controls). `scroll` makes it
// horizontally scrollable, `wide` stretches pills to fill the row.
export function PillRow({ options, value, onChange, wide, scroll }) {
  return (
    <div className={`pill-row ${wide ? 'pill-row-wide' : ''} ${scroll ? 'pill-row-scroll' : ''}`}>
      {options.map((o) => (
        <button
          key={o.key}
          className={`pill ${value === o.key ? 'is-active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.badge ? <span className="pill-badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function PendingBadge() {
  return <span className="pending-badge" title="Saved offline, will sync">⟳ offline</span>
}

// Online/offline awareness.
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
