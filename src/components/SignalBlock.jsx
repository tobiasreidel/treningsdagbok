// One coach signal as a tinted block: title, state, hint. With `onPress` it
// becomes a real button (history + explanation live one tap deeper), keeping
// the exact same look - the chevron is the only visual difference.
export default function SignalBlock({ title, state, tone, hint, children, onPress }) {
  const body = (
    <>
      <div className="coach-finger-row">
        <span className="coach-finger-label">{title}</span>
        <span className="coach-finger-state">
          {state}
          {onPress && (
            <span className="coach-finger-chev" aria-hidden="true">
              ›
            </span>
          )}
        </span>
      </div>
      {hint && <p className="muted small coach-finger-hint">{hint}</p>}
      {children}
    </>
  )
  if (onPress) {
    return (
      <button
        type="button"
        className={`coach-finger coach-finger-${tone} coach-finger-press`}
        onClick={onPress}
      >
        {body}
      </button>
    )
  }
  return <div className={`coach-finger coach-finger-${tone}`}>{body}</div>
}
