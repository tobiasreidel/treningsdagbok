import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SPORTS, SEND_TYPES, FEELING_LABELS, exerciseLabel } from '../lib/constants'
import { formatDay, formatDuration, pacePerKm, pacePer100m } from '../lib/format'
import { getSession, getSignedPhotoUrl, getCurrentUserId } from '../lib/sessions'
import { embeddedStrengthMinutes, embeddedFingerMinutes } from '../lib/stats'
import { normalizeHang } from '../lib/formState'

const num = (v) => (v === '' || v == null ? null : Number(v))

// Which extra fields to show for cycling, in order, with units.
const CYCLING_METRICS = [
  { key: 'distance_km', label: 'Distance', unit: 'km' },
  { key: 'elevation_m', label: 'Elevation', unit: 'm' },
  { key: 'avg_speed', label: 'Avg speed', unit: 'km/h' },
  { key: 'max_speed', label: 'Max speed', unit: 'km/h' },
  { key: 'avg_power', label: 'Avg power', unit: 'W' },
  { key: 'norm_power', label: 'Norm power', unit: 'W' },
  { key: 'cadence', label: 'Cadence', unit: 'rpm' },
  { key: 'avg_hr', label: 'Avg HR', unit: 'bpm' },
  { key: 'max_hr', label: 'Max HR', unit: 'bpm' },
  { key: 'training_load', label: 'Load', unit: 'TSS' },
  { key: 'if_factor', label: 'Intensity', unit: 'IF' },
  { key: 'work_kj', label: 'Work', unit: 'kJ' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
]

const RUNNING_METRICS = [
  { key: 'distance_km', label: 'Distance', unit: 'km' },
  { key: 'elevation_m', label: 'Elevation', unit: 'm' },
  { key: 'avg_hr', label: 'Avg HR', unit: 'bpm' },
  { key: 'max_hr', label: 'Max HR', unit: 'bpm' },
  { key: 'cadence', label: 'Cadence', unit: 'spm' },
  { key: 'training_load', label: 'Load', unit: 'TSS' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
]

const SWIMMING_METRICS = [
  { key: 'distance_m', label: 'Distance', unit: 'm' },
  { key: 'avg_hr', label: 'Avg HR', unit: 'bpm' },
  { key: 'max_hr', label: 'Max HR', unit: 'bpm' },
  { key: 'training_load', label: 'Load', unit: 'TSS' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
]

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [photoSrc, setPhotoSrc] = useState(null)
  const [error, setError] = useState(null)
  const [myId, setMyId] = useState(null)
  const isPending = id?.startsWith('local-')

  useEffect(() => {
    if (isPending) return
    let alive = true
    getCurrentUserId().then((u) => alive && setMyId(u))
    getSession(id)
      .then(async (s) => {
        if (!alive) return
        setSession(s)
        if (s.photo_url) setPhotoSrc(await getSignedPhotoUrl(s.photo_url))
      })
      .catch((err) => alive && setError(err.message || 'Could not load activity'))
    return () => {
      alive = false
    }
  }, [id, isPending])

  const back = () => navigate(-1)

  if (isPending) {
    return (
      <Shell onBack={back} title="Activity">
        <p className="muted">
          This activity is still saved offline and will sync when you're back
          online.
        </p>
      </Shell>
    )
  }
  if (error) {
    return (
      <Shell onBack={back} title="Activity">
        <p className="auth-error">{error}</p>
      </Shell>
    )
  }
  if (!session) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  const sport = SPORTS[session.sport]
  const e = session.extra || {}
  const isCycling = session.sport === 'cycling'
  const isRunning = session.sport === 'running'
  const isSwimming = session.sport === 'swimming'

  const subtitleParts = [session.subtype]
  if (isCycling && e.indoor) subtitleParts.push('indoor')
  if (session.sport === 'climbing' && session.location) subtitleParts.push(session.location)
  const subtitle = subtitleParts.filter(Boolean).join(' · ')

  const tiles = []
  if (session.feeling) tiles.push({ label: 'Feeling', value: FEELING_LABELS[session.feeling], sub: `${session.feeling}/5` })
  if (session.rpe) tiles.push({ label: 'RPE', value: session.rpe, sub: '/10' })
  const strengthMin = embeddedStrengthMinutes(session)
  const fingerMin = embeddedFingerMinutes(session)
  if (session.duration) {
    // For a climb with strength/finger blocks, split the duration tile out.
    if (strengthMin > 0 || fingerMin > 0) {
      tiles.push({ label: 'Climbing', value: formatDuration(session.duration - strengthMin - fingerMin) })
      if (strengthMin > 0) tiles.push({ label: 'Strength', value: formatDuration(strengthMin) })
      if (fingerMin > 0) tiles.push({ label: 'Finger', value: formatDuration(fingerMin) })
    } else {
      tiles.push({ label: 'Duration', value: formatDuration(session.duration) })
    }
  }
  if (isRunning) {
    const pace = pacePerKm(e.distance_km, session.duration)
    if (pace) tiles.push({ label: 'Pace', value: pace, sub: '/km' })
  }
  if (isSwimming) {
    const pace = pacePer100m(e.distance_m, session.duration)
    if (pace) tiles.push({ label: 'Pace', value: pace, sub: '/100m' })
  }
  const metrics = isCycling
    ? CYCLING_METRICS
    : isRunning
      ? RUNNING_METRICS
      : isSwimming
        ? SWIMMING_METRICS
        : []
  for (const m of metrics) {
    const v = num(e[m.key])
    if (v != null && v !== 0) tiles.push({ label: m.label, value: v, sub: m.unit })
  }

  const grades = e.grades || []
  const routes = session.routes || []
  const exercises = e.strength || []
  const finger = e.finger || {}
  const hangs = finger.hangboard || []
  const hasFinger = finger.campus || hangs.length > 0
  // A coach views athletes' sessions read-only — only the owner can edit.
  const isOwner = myId && session.user_id === myId

  return (
    <Shell
      onBack={back}
      title={`${sport?.emoji || ''} ${sport?.label || 'Activity'}`}
      footer={
        isOwner ? (
          <button
            className="btn btn-primary btn-block"
            onClick={() => navigate(`/session/${id}/edit`)}
          >
            Edit activity
          </button>
        ) : null
      }
    >
      <div className="detail-hero">
        <span className="detail-sport">
          {sport?.emoji} {subtitle || sport?.label}
        </span>
        <span className="detail-date">{formatDay(session.date)}</span>
      </div>

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
        <div className="detail-block">
          <h2 className="section-title">Grades worked</h2>
          <div className="chips">
            {grades.map((g) => (
              <span className="chip is-active" key={g}>
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {routes.length > 0 && (
        <div className="detail-block">
          <h2 className="section-title">Routes &amp; boulders</h2>
          <div className="stack">
            {routes.map((r, i) => (
              <div className="route-line" key={i}>
                <span className="route-line-name">{r.name || `Route ${i + 1}`}</span>
                <span className="route-line-meta">
                  {r.grade && <strong>{r.grade}</strong>}
                  {r.send_type && <span className="route-send">{sendLabel(r.send_type)}</span>}
                  {r.attempts ? <span className="muted small">{r.attempts} att</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div className="detail-block">
          <h2 className="section-title">Strength</h2>
          <div className="stack">
            {exercises.map((ex, i) => (
              <div className="route-line" key={i}>
                <span className="route-line-name">{exerciseLabel(ex.exercise)}</span>
                <span className="route-line-meta">{fmtExercise(ex)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasFinger && (
        <div className="detail-block">
          <h2 className="section-title">Finger training</h2>
          <div className="stack">
            {finger.campus && (
              <div className="route-line">
                <span className="route-line-name">{campusLabel(finger.campus)}</span>
              </div>
            )}
            {hangs.map((h, i) => {
              const n = normalizeHang(h)
              return (
                <div className="route-line" key={i}>
                  <span className="route-line-name">
                    Hangboard · {n.hands === 'one' ? 'one hand' : 'two hands'}
                  </span>
                  <span className="route-line-meta">{fmtHang(n)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {session.notes && (
        <div className="detail-block">
          <h2 className="section-title">Notes</h2>
          <p className="detail-notes">{session.notes}</p>
        </div>
      )}

      {photoSrc && (
        <div className="detail-block">
          <img className="detail-photo" src={photoSrc} alt="Session" />
        </div>
      )}
    </Shell>
  )
}

function sendLabel(key) {
  return SEND_TYPES.find((s) => s.key === key)?.label || key
}

// "3 × 10" plus a weight suffix when one was logged.
function fmtExercise(ex) {
  const sets = num(ex.sets)
  const reps = num(ex.reps)
  const w = num(ex.weight)
  const parts = []
  if (sets && reps) parts.push(`${sets} × ${reps}`)
  else if (reps) parts.push(`${reps} reps`)
  else if (sets) parts.push(`${sets} sets`)
  if (w) parts.push(`+${w} kg`)
  return parts.join(' · ')
}

// Hangboard added weight: + added, − assisted, blank = bodyweight.
function fmtHangWeight(weight) {
  const w = num(weight)
  if (!w) return 'bodyweight'
  return w > 0 ? `+${w} kg` : `−${Math.abs(w)} kg assisted`
}

function campusLabel(campus) {
  return campus === 'spray' ? 'Spray wall' : 'Campus board'
}

// One value if every set agrees, otherwise the sentinel 'varies'.
function uniformOrNull(values) {
  const norm = values.map((v) => (v === '' || v == null ? '' : String(Number(v))))
  return new Set(norm).size <= 1 ? norm[0] : 'varies'
}

// "1 × 5 · +20 kg · 7 s", collapsing uniform sets and flagging when they vary.
function fmtHang(n) {
  const reps = Math.max(1, Number(n.reps) || 1)
  const parts = [`${reps} × ${n.sets.length}`]
  const w = uniformOrNull(n.sets.map((s) => s.weight))
  const t = uniformOrNull(n.sets.map((s) => s.time))
  parts.push(w === 'varies' ? 'weights vary' : fmtHangWeight(w))
  if (t === 'varies') parts.push('times vary')
  else if (Number(t) > 0) parts.push(`${Number(t)} s`)
  if (reps > 1 && Number(n.rest) > 0) parts.push(`${Number(n.rest)} s rest`)
  return parts.join(' · ')
}

function Shell({ onBack, title, children, footer }) {
  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>{title}</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>
      <main className="wizard-body stack">{children}</main>
      {footer && <footer className="wizard-foot">{footer}</footer>}
    </div>
  )
}
