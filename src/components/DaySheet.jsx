import { SPORTS } from '../lib/constants'
import { formatDay, formatDuration } from '../lib/format'
import { cycleInfoFor } from '../lib/health'
import { PendingBadge } from './ui'

// Bottom sheet shown when a calendar day is tapped: lists that day's sessions
// (tap one for its detail) and offers to add a new session on the same date.
// With period tracking on it also shows the day's cycle phase and lets the
// user mark/unmark the day.
export default function DaySheet({
  date,
  sessions,
  onClose,
  onSelect,
  onAdd,
  readOnly,
  periodEnabled,
  isPeriodDay,
  cycle,
  onTogglePeriod,
}) {
  const list = sessions
    .filter((s) => s.date === date)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <strong>
            {formatDay(date)}
            {periodEnabled && isPeriodDay && <span className="period-drop"> 🩸</span>}
          </strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {list.length === 0 ? (
          <p className="muted small sheet-empty">No sessions logged on this day.</p>
        ) : (
          <ul className="sheet-list">
            {list.map((s) => {
              const sport = SPORTS[s.sport]
              return (
                <li key={s.id}>
                  <button className="sheet-item" onClick={() => onSelect(s)}>
                    <span className="sheet-item-main">
                      <span className="sheet-item-emoji">{sport?.emoji}</span>
                      <span>{labelFor(s)}</span>
                      {s.pending && <PendingBadge />}
                    </span>
                    <span className="muted small">{formatDuration(s.duration)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {periodEnabled && !readOnly && (
          <>
            {(() => {
              const info = cycle ? cycleInfoFor(cycle, date) : null
              return info ? (
                <p className="muted small sheet-empty">
                  Cycle day {info.day} · {info.label}
                </p>
              ) : null
            })()}
            <button
              className="btn btn-secondary btn-block"
              onClick={() => onTogglePeriod(date)}
            >
              {isPeriodDay ? 'Remove period mark' : '🩸 Log period on this day'}
            </button>
          </>
        )}

        {!readOnly && (
          <button className="btn btn-primary btn-block" onClick={() => onAdd(date)}>
            + Add session on this day
          </button>
        )}
      </div>
    </div>
  )
}

function labelFor(s) {
  const parts = [SPORTS[s.sport]?.label]
  if (s.subtype) parts.push(s.subtype)
  if (s.sport === 'climbing' && s.location) parts.push(s.location === 'indoor' ? 'indoor' : 'outdoor')
  return parts.filter(Boolean).join(' · ')
}
