import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { SPORTS, FEELING_LABELS, formatGrade } from '../lib/constants'
import {
  asDate,
  formatDay,
  formatDuration,
  pacePerKm,
  pacePer100m,
} from '../lib/format'
import { fetchSessions, getPendingSessions } from '../lib/sessions'
import { embeddedStrengthMinutes, embeddedFingerMinutes } from '../lib/stats'
import { ALL_SPORTS } from '../lib/prefs'
import { PendingBadge, PillRow } from '../components/ui'

// Session-length buckets for the filter row (minutes).
const LENGTHS = [
  { key: 'all', label: 'Any length' },
  { key: 'short', label: '< 30m' },
  { key: 'med', label: '30–60m' },
  { key: 'long', label: '1–2h' },
  { key: 'xlong', label: '2h+' },
]

function matchesLength(duration, key) {
  if (key === 'all') return true
  const m = Number(duration)
  if (!Number.isFinite(m) || m <= 0) return false
  if (key === 'short') return m < 30
  if (key === 'med') return m >= 30 && m < 60
  if (key === 'long') return m >= 60 && m < 120
  return m >= 120 // xlong
}

// Custom minutes range. lo/hi are strings ('' = unbounded on that side).
function matchesCustomLength(duration, lo, hi) {
  const m = Number(duration)
  if (!Number.isFinite(m) || m <= 0) return false
  const min = lo === '' ? null : Number(lo)
  const max = hi === '' ? null : Number(hi)
  if (min != null && m < min) return false
  if (max != null && m > max) return false
  return true
}

// A "logbook" view: every session, newest first, grouped into months like the
// pages of a diary. Each entry shows the essentials at a glance; tap it to
// unfold the richer summary, or open the full session from there. Scroll down
// to leaf back through older months.
export default function Logbook() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [sportFilter, setSportFilter] = useState('all')
  const [lenFilter, setLenFilter] = useState('all')
  // Custom length range (minutes). When either is set it overrides the preset
  // length pills; choosing a preset clears it.
  const [lenMin, setLenMin] = useState('')
  const [lenMax, setLenMax] = useState('')

  const load = useCallback(async () => {
    const [server, pending] = await Promise.allSettled([
      fetchSessions(),
      getPendingSessions(),
    ])
    const serverRows = server.status === 'fulfilled' ? server.value : []
    const pendingRows = pending.status === 'fulfilled' ? pending.value : []
    setSessions([...pendingRows, ...serverRows])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('sessions:changed', load)
    return () => window.removeEventListener('sessions:changed', load)
  }, [load])

  // Sport filter only offers sports that actually appear in the logbook, kept
  // in the canonical order. "All" is always first.
  const sportOptions = useMemo(() => {
    const present = new Set(sessions.map((s) => s.sport))
    return [
      { key: 'all', label: 'All sports' },
      ...ALL_SPORTS.filter((k) => present.has(k)).map((k) => ({
        key: k,
        label: `${SPORTS[k].emoji} ${SPORTS[k].label}`,
      })),
    ]
  }, [sessions])

  const customLen = lenMin !== '' || lenMax !== ''
  const filtered = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (sportFilter === 'all' || s.sport === sportFilter) &&
          (customLen
            ? matchesCustomLength(s.duration, lenMin, lenMax)
            : matchesLength(s.duration, lenFilter)),
      ),
    [sessions, sportFilter, lenFilter, lenMin, lenMax, customLen],
  )

  // Group filtered sessions by calendar month, newest month first. Sessions
  // arrive already sorted newest-first, so each month's order is preserved.
  const months = useMemo(() => {
    const groups = []
    let current = null
    for (const s of filtered) {
      const key = format(asDate(s.date), 'yyyy-MM')
      if (!current || current.key !== key) {
        current = { key, label: format(asDate(s.date), 'MMMM yyyy'), items: [] }
        groups.push(current)
      }
      current.items.push(s)
    }
    return groups
  }, [filtered])

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>Logbook</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body">
        {loading ? (
          <div className="splash inline">
            <div className="spinner" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="card empty-state">
            <p>Your logbook is empty.</p>
            <p className="muted small">Sessions you register will show up here.</p>
          </div>
        ) : (
          <>
            <div className="log-filters">
              <PillRow options={sportOptions} value={sportFilter} onChange={setSportFilter} scroll />
              <PillRow
                scroll
                options={LENGTHS}
                value={customLen ? null : lenFilter}
                onChange={(k) => {
                  setLenFilter(k)
                  setLenMin('')
                  setLenMax('')
                }}
              />
              <div className="log-custom-len">
                <span className="log-custom-label">Custom length</span>
                <div className="log-custom-inputs">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="min"
                    aria-label="Minimum minutes"
                    value={lenMin}
                    onChange={(e) => {
                      setLenMin(e.target.value)
                      setLenFilter('all')
                    }}
                  />
                  <span className="muted">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="max"
                    aria-label="Maximum minutes"
                    value={lenMax}
                    onChange={(e) => {
                      setLenMax(e.target.value)
                      setLenFilter('all')
                    }}
                  />
                  <span className="suffix">min</span>
                  {customLen && (
                    <button
                      className="btn btn-ghost btn-sm log-custom-clear"
                      onClick={() => {
                        setLenMin('')
                        setLenMax('')
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {months.length === 0 ? (
              <div className="card empty-state">
                <p>No sessions match these filters.</p>
                <p className="muted small">Try a different sport or length.</p>
              </div>
            ) : (
              <div className="logbook">
                {months.map((m) => (
                  <section className="log-month" key={m.key}>
                    <div className="log-month-head">
                      <span className="log-month-title">{m.label}</span>
                      <span className="log-month-count">{m.items.length}</span>
                    </div>
                    <div className="log-entries">
                      {m.items.map((s) => (
                        <Entry
                          key={s.id}
                          session={s}
                          open={openId === s.id}
                          onToggle={() => setOpenId((id) => (id === s.id ? null : s.id))}
                          onOpenFull={() => navigate(`/session/${s.id}`)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Entry({ session: s, open, onToggle, onOpenFull }) {
  const sport = SPORTS[s.sport]
  const facts = keyFacts(s)
  return (
    <div className={`log-entry ${open ? 'is-open' : ''}`}>
      <button className="log-entry-head" onClick={onToggle} aria-expanded={open}>
        <span className="log-entry-emoji">{sport?.emoji}</span>
        <span className="log-entry-main">
          <span className="log-entry-title">
            {labelFor(s)}
            {s.pending && <PendingBadge />}
          </span>
          <span className="log-entry-facts">
            <span className="log-entry-date">{formatDay(s.date)}</span>
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </span>
        </span>
        <span className="log-entry-side">
          <span className="log-entry-dur">{formatDuration(s.duration)}</span>
          <span className={`log-chevron ${open ? 'is-open' : ''}`}>›</span>
        </span>
      </button>

      {open && <Expanded session={s} onOpenFull={onOpenFull} />}
    </div>
  )
}

function Expanded({ session: s, onOpenFull }) {
  const tiles = detailTiles(s)
  const grades = s.extra?.grades || []
  return (
    <div className="log-entry-body">
      {tiles.length > 0 && (
        <div className="tile-grid">
          {tiles.map((t) => (
            <div className="tile" key={t.label}>
              <span className="tile-label">{t.label}</span>
              <span className="tile-value">
                {t.value}
                {t.sub && <small> {t.sub}</small>}
              </span>
            </div>
          ))}
        </div>
      )}

      {grades.length > 0 && (
        <div className="chips">
          {grades.map((g) => (
            <span className="chip is-active" key={g}>
              {formatGrade(g, s.subtype)}
            </span>
          ))}
        </div>
      )}

      {s.notes && <p className="detail-notes log-notes">{s.notes}</p>}

      {!s.pending && (
        <button className="btn btn-secondary btn-sm btn-block" onClick={onOpenFull}>
          Open full session ›
        </button>
      )}
    </div>
  )
}

// Sub-label shown beside the sport: subtype + (for climbing) indoor/outdoor.
function labelFor(s) {
  const parts = [s.subtype || SPORTS[s.sport]?.label]
  if (s.sport === 'climbing' && s.location) {
    parts.push(s.location === 'indoor' ? 'indoor' : 'outdoor')
  }
  return parts.filter(Boolean).join(' · ')
}

const round1 = (v) => Math.round(Number(v) * 10) / 10

// The handful of numbers worth seeing without unfolding the entry.
function keyFacts(s) {
  const e = s.extra || {}
  const facts = []
  if (s.feeling) facts.push(`feel ${s.feeling}/5`)
  if (s.rpe) facts.push(`RPE ${s.rpe}`)
  if (s.sport === 'cycling' || s.sport === 'running') {
    if (Number(e.distance_km)) facts.push(`${round1(e.distance_km)} km`)
  } else if (s.sport === 'swimming') {
    if (Number(e.distance_m)) facts.push(`${Math.round(Number(e.distance_m))} m`)
  } else if (s.sport === 'climbing') {
    const n = s.routes?.length || 0
    if (n) facts.push(`${n} route${n > 1 ? 's' : ''}`)
  }
  return facts
}

// Richer (but still summary) numbers shown when an entry is unfolded.
function detailTiles(s) {
  const e = s.extra || {}
  const tiles = []
  if (s.feeling) {
    tiles.push({ label: 'Feeling', value: FEELING_LABELS[s.feeling], sub: `${s.feeling}/5` })
  }
  if (s.rpe) tiles.push({ label: 'RPE', value: s.rpe, sub: '/10' })

  const strengthMin = embeddedStrengthMinutes(s)
  const fingerMin = embeddedFingerMinutes(s)
  if (s.duration) {
    if (strengthMin > 0 || fingerMin > 0) {
      tiles.push({
        label: SPORTS[s.sport]?.label || 'Duration',
        value: formatDuration(s.duration - strengthMin - fingerMin),
      })
      if (strengthMin > 0) tiles.push({ label: 'Strength', value: formatDuration(strengthMin) })
      if (fingerMin > 0) tiles.push({ label: 'Finger', value: formatDuration(fingerMin) })
    } else {
      tiles.push({ label: 'Duration', value: formatDuration(s.duration) })
    }
  }

  if (s.sport === 'cycling' || s.sport === 'running') {
    if (Number(e.distance_km)) tiles.push({ label: 'Distance', value: round1(e.distance_km), sub: 'km' })
    if (Number(e.elevation_m)) tiles.push({ label: 'Elevation', value: Math.round(Number(e.elevation_m)), sub: 'm' })
  }
  if (s.sport === 'running') {
    const pace = pacePerKm(e.distance_km, s.duration)
    if (pace) tiles.push({ label: 'Pace', value: pace, sub: '/km' })
  }
  if (s.sport === 'cycling' && Number(e.avg_speed)) {
    tiles.push({ label: 'Avg speed', value: round1(e.avg_speed), sub: 'km/h' })
  }
  if (s.sport === 'swimming') {
    if (Number(e.distance_m)) tiles.push({ label: 'Distance', value: Math.round(Number(e.distance_m)), sub: 'm' })
    const pace = pacePer100m(e.distance_m, s.duration)
    if (pace) tiles.push({ label: 'Pace', value: pace, sub: '/100m' })
  }
  return tiles
}
