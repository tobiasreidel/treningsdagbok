// The shape of a tone, not just its hue. Around 8% of men cannot separate the
// red, amber and green blocks, and the state text alone was carrying the whole
// message for them. An icon per tone means the difference survives in
// greyscale, and it costs one character.
const TONE_ICON = {
  good: '✓',
  ok: '~',
  warn: '!',
  planned: '·',
}

// One coach signal as a tinted block: title, state, hint. With `onPress` it
// becomes a real button (history + explanation live one tap deeper), keeping
// the exact same look - the chevron is the only visual difference.
export default function SignalBlock({ title, state, tone, hint, children, onPress }) {
  const icon = TONE_ICON[tone] || TONE_ICON.ok
  const body = (
    <>
      <div className="coach-finger-row">
        <span className="coach-finger-label">{title}</span>
        <span className="coach-finger-state">
          <span className="coach-tone-icon" aria-hidden="true">{icon}</span>
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
