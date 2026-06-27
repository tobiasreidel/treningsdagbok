import { useEffect, useState } from 'react'

// Reusable, touch-friendly form controls. Big tap targets, one-handed use.

export function Field({ label, hint, children, optional }) {
  return (
    <label className="field">
      {label && (
        <span className="field-label">
          {label}
          {optional && <span className="field-optional"> · optional</span>}
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
export function Scale({ min = 1, max = 5, value, onChange, lowLabel, highLabel }) {
  const nums = []
  for (let i = min; i <= max; i += 1) nums.push(i)
  return (
    <div className="scale-wrap">
      <div className="scale" style={{ '--n': nums.length }}>
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

// Single-select chip row (e.g. choose one grade for a route).
export function ChipSelect({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.key
        const label = typeof opt === 'string' ? opt : opt.label
        return (
          <button
            key={key}
            type="button"
            className={`chip ${value === key ? 'is-active' : ''}`}
            onClick={() => onChange(value === key ? null : key)}
          >
            {label}
          </button>
        )
      })}
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
