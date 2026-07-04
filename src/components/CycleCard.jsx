import { differenceInCalendarDays } from 'date-fns'
import { asDate, todayISO, formatDayShort } from '../lib/format'
import { cycleInfoFor } from '../lib/health'

// Dashboard card shown when period tracking is on: today's cycle day + phase
// with a training-oriented hint, and the predicted next period. With nothing
// logged yet it explains how to start.
export default function CycleCard({ analysis }) {
  if (!analysis || !analysis.lastStart) {
    return (
      <div className="card cycle-card">
        <div className="cycle-head">
          <span className="cycle-title">🩸 Cycle</span>
        </div>
        <p className="muted small">
          Tap a day in the calendar to log your period. Predictions appear after
          a couple of cycles.
        </p>
      </div>
    )
  }

  const today = todayISO()
  const info = cycleInfoFor(analysis, today)
  const daysToNext = analysis.nextStart
    ? differenceInCalendarDays(asDate(analysis.nextStart), asDate(today))
    : null

  return (
    <div className="card cycle-card">
      <div className="cycle-head">
        <span className="cycle-title">🩸 Cycle</span>
        {info && <span className="muted small">day {info.day}</span>}
      </div>
      {info && (
        <>
          <strong>{info.label}</strong>
          <p className="muted small">{info.hint}</p>
        </>
      )}
      {analysis.nextStart && daysToNext >= 0 && (
        <p className="small">
          Next period expected ~{formatDayShort(analysis.nextStart)}
          {daysToNext === 0 ? ' · today' : ` · in ${daysToNext} day${daysToNext === 1 ? '' : 's'}`}
        </p>
      )}
    </div>
  )
}
