import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SPORTS, SEND_TYPES, FEELING_LABELS, exerciseLabel, formatGrade } from '../lib/constants'
import { formatDay, formatDuration, pacePerKm, pacePer100m } from '../lib/format'
import {
  getSession,
  getSignedPhotoUrl,
  getCurrentUserId,
  deleteSession,
  deletePendingSession,
  notifySessionsChanged,
} from '../lib/sessions'
import { isPeriodDay } from '../lib/health'
import { getLogPeriod } from '../lib/prefs'
import { embeddedStrengthMinutes, embeddedFingerMinutes } from '../lib/stats'
import { normalizeHang } from '../lib/formState'
import { hasUnreadableHangs } from '../lib/fingerLoad'
import { testMeta } from '../lib/fingerTests'
import { getBodyweight } from '../lib/prefs'
import { pumpLabel } from '../lib/exercises'
// Leaflet and the charts are the heaviest thing the app bundles, and only a
// ride or run ever shows them - so they load with the session that needs them
// rather than with every launch.
const ActivityAnalysis = lazy(() => import('../components/ActivityAnalysis'))

const num = (v) => (v === '' || v == null ? null : Number(v))

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [photoSrc, setPhotoSrc] = useState(null)
  const [error, setError] = useState(null)
  const [myId, setMyId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [periodMark, setPeriodMark] = useState(false)
  // Stats from the analysis charts (once they load) - used for the max power
  // in the summary, which has no stored field of its own.
  const [analysisStats, setAnalysisStats] = useState(null)
  const isPending = id?.startsWith('local-')

  useEffect(() => {
    if (isPending) return
    let alive = true
    setAnalysisStats(null) // don't carry one activity's max onto the next
    getCurrentUserId().then((u) => alive && setMyId(u))
    getSession(id)
      .then(async (s) => {
        if (!alive) return
        setSession(s)
        // Badge sessions that fall on one of your logged period days.
        if (getLogPeriod()) {
          isPeriodDay(s.date).then((v) => alive && setPeriodMark(v))
        }
        if (s.photo_url) setPhotoSrc(await getSignedPhotoUrl(s.photo_url))
      })
      .catch(() => alive && setError('Activity not found'))
    return () => {
      alive = false
    }
  }, [id, isPending])

  const back = () => navigate(-1)

  const remove = async () => {
    if (!window.confirm('Delete this activity? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteSession(session)
      notifySessionsChanged()
      navigate('/', { state: { toast: 'Activity deleted' } })
    } catch (err) {
      setError(err.message || 'Could not delete')
      setDeleting(false)
    }
  }

  if (isPending) {
    const removePendingItem = async () => {
      if (!window.confirm('Delete this offline session? It has not been synced.')) return
      await deletePendingSession(id)
      notifySessionsChanged()
      navigate('/', { state: { toast: 'Offline session deleted' } })
    }
    return (
      <Shell onBack={back} title="Activity">
        <p className="muted">
          This activity is still saved offline and will sync when you're back
          online.
        </p>
        <button className="btn btn-danger btn-block" onClick={removePendingItem}>
          Delete offline session
        </button>
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
  const isEndurance = isCycling || isRunning || isSwimming

  const subtitleParts = [session.subtype]
  if (isCycling && e.indoor) subtitleParts.push('indoor')
  if (session.sport === 'climbing' && session.location) subtitleParts.push(session.location)
  const subtitle = subtitleParts.filter(Boolean).join(' · ')

  // ---- Strava-style layout for imported endurance sports -------------------
  // Big hero numbers, an avg/max table, then the analysis charts.
  const hero = []
  const avgMax = []
  const smallTiles = []
  if (isEndurance) {
    if (isCycling || isRunning) {
      if (num(e.distance_km)) hero.push({ value: e.distance_km, unit: 'km', label: 'Distance' })
    }
    if (isSwimming && num(e.distance_m)) hero.push({ value: e.distance_m, unit: 'm', label: 'Distance' })
    if (isRunning) {
      const pace = pacePerKm(e.distance_km, session.duration)
      if (pace) hero.push({ value: pace, unit: '/km', label: 'Pace' })
    }
    if (isSwimming) {
      const pace = pacePer100m(e.distance_m, session.duration)
      if (pace) hero.push({ value: pace, unit: '/100m', label: 'Pace' })
    }
    if (session.duration) hero.push({ value: formatDuration(session.duration), label: 'Time' })
    if (isCycling && num(e.elevation_m)) {
      hero.push({ value: Math.round(e.elevation_m), unit: 'm', label: 'Elevation' })
    }

    if (num(e.avg_speed) || num(e.max_speed)) {
      avgMax.push({ label: 'Speed', avg: num(e.avg_speed), max: num(e.max_speed), unit: 'km/h' })
    }
    if (num(e.avg_hr) || num(e.max_hr)) {
      avgMax.push({ label: 'Heart rate', avg: num(e.avg_hr), max: num(e.max_hr), unit: 'bpm' })
    }
    if (num(e.avg_power) || num(e.norm_power)) {
      // Max power has no stored field - take it from the analysis stream (the
      // same value the Power chart header shows), so it's the real max, not the
      // normalised power that used to sit misleadingly in this column. Norm
      // power moves to a sub-line under the label.
      const norm = num(e.norm_power)
      const streamMax = analysisStats?.watts?.max
      avgMax.push({
        label: 'Power',
        sub: norm != null ? `norm ${Math.round(norm)} W` : null,
        avg: num(e.avg_power),
        max: streamMax != null ? Math.round(streamMax) : null,
        unit: 'W',
      })
    }
    if (num(e.cadence)) {
      avgMax.push({ label: 'Cadence', avg: num(e.cadence), max: null, unit: isRunning ? 'spm' : 'rpm' })
    }
    if (isRunning && num(e.elevation_m)) {
      avgMax.push({ label: 'Elevation', avg: Math.round(e.elevation_m), max: null, unit: 'm' })
    }

    if (session.feeling) smallTiles.push({ label: 'Feeling', value: FEELING_LABELS[session.feeling], sub: `${session.feeling}/5` })
    if (session.rpe) smallTiles.push({ label: 'RPE', value: session.rpe, sub: '/10' })
    if (num(e.training_load)) smallTiles.push({ label: 'Load', value: Math.round(e.training_load), sub: 'TSS' })
    if (num(e.if_factor)) {
      // intervals.icu reports intensity as a percentage (67.6); a few older
      // values may be stored as the 0.68 fraction - show both as "68%".
      const raw = num(e.if_factor)
      smallTiles.push({ label: 'Intensity', value: Math.round(raw > 5 ? raw : raw * 100), sub: '%' })
    }
    if (num(e.work_kj)) smallTiles.push({ label: 'Work', value: Math.round(e.work_kj), sub: 'kJ' })
    if (num(e.calories)) smallTiles.push({ label: 'Calories', value: Math.round(e.calories), sub: 'kcal' })
  }

  // ---- classic tile list for the other sports ------------------------------
  const tiles = []
  if (!isEndurance) {
    if (session.feeling) tiles.push({ label: 'Feeling', value: FEELING_LABELS[session.feeling], sub: `${session.feeling}/5` })
    if (session.rpe) tiles.push({ label: 'RPE', value: session.rpe, sub: '/10' })
    if (num(e.rpe_finger)) {
      tiles.push({ label: 'Finger RPE', value: num(e.rpe_finger), sub: '/10' })
    }
    if (num(e.pump)) {
      tiles.push({ label: 'Pump', value: num(e.pump), sub: `/5 · ${pumpLabel(e.pump)}` })
    }
    const strengthMin = embeddedStrengthMinutes(session)
    const fingerMin = embeddedFingerMinutes(session)
    if (session.duration) {
      // For a session with embedded strength/finger blocks, split the tile out.
      if (strengthMin > 0 || fingerMin > 0) {
        tiles.push({
          label: sport?.label || 'Duration',
          value: formatDuration(session.duration - strengthMin - fingerMin),
        })
        if (strengthMin > 0) tiles.push({ label: 'Strength', value: formatDuration(strengthMin) })
        if (fingerMin > 0) tiles.push({ label: 'Finger', value: formatDuration(fingerMin) })
      } else {
        tiles.push({ label: 'Duration', value: formatDuration(session.duration) })
      }
    }
    // Imported watch data on a climb (HR, calories) still deserves a tile.
    if (num(e.avg_hr)) tiles.push({ label: 'Avg HR', value: Math.round(e.avg_hr), sub: 'bpm' })
    if (num(e.max_hr)) tiles.push({ label: 'Max HR', value: Math.round(e.max_hr), sub: 'bpm' })
    if (num(e.calories)) tiles.push({ label: 'Calories', value: Math.round(e.calories), sub: 'kcal' })
  }

  const grades = e.grades || []
  const routes = session.routes || []
  const exercises = e.strength || []
  const finger = e.finger || {}
  const hangs = finger.hangboard || []
  const hasFinger = finger.campus || hangs.length > 0
  const unreadableHangs = hasFinger && hasUnreadableHangs(session, getBodyweight())
  const testIds = e.test_session?.ids || []
  const warmupMin = Number(e.warmup_minutes) || 0
  const warmupNote = (e.warmup_note || '').trim()
  const rehabMin = Number(e.rehab_minutes) || 0
  const rehabNote = (e.rehab_note || '').trim()
  const hasWarmupRehab = warmupMin > 0 || warmupNote || rehabMin > 0 || rehabNote
  // A coach views athletes' sessions read-only - only the owner can edit.
  const isOwner = myId && session.user_id === myId

  return (
    <Shell
      onBack={back}
      title={`${sport?.emoji || ''} ${sport?.label || 'Activity'}`}
      headerRight={
        isOwner ? (
          <button className="icon-btn danger" onClick={remove} disabled={deleting} aria-label="Delete activity">
            🗑
          </button>
        ) : null
      }
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
        {e.intervals_name && <h2 className="detail-name">{e.intervals_name}</h2>}
        <span className="detail-sport">
          {sport?.emoji} {subtitle || sport?.label}
        </span>
        <span className="detail-date">
          {formatDay(session.date)}
          {/* Period drop only on your own sessions, never a friend's/athlete's. */}
          {isOwner && periodMark && <span className="period-drop"> 🩸</span>}
        </span>
      </div>

      {hero.length > 0 && (
        <div className="hero-stats">
          {hero.map((h) => (
            <div className="hero-stat" key={h.label}>
              <span className="hero-value">
                {h.value}
                {h.unit && <small> {h.unit}</small>}
              </span>
              <span className="hero-label">{h.label}</span>
            </div>
          ))}
        </div>
      )}

      {avgMax.length > 0 && (
        <div className="card avgmax">
          <div className="avgmax-row avgmax-head">
            <span />
            <span>Avg</span>
            <span>Max</span>
          </div>
          {avgMax.map((r) => (
            <div className="avgmax-row" key={r.label}>
              <span className="avgmax-label">
                {r.label}
                {r.sub && <small className="avgmax-sub">{r.sub}</small>}
              </span>
              <span className="avgmax-val">
                {r.avg != null ? (
                  <>
                    {r.avg} <small>{r.unit}</small>
                  </>
                ) : (
                  '–'
                )}
              </span>
              <span className="avgmax-val">
                {r.max != null ? (
                  <>
                    {r.max} <small>{r.maxLabel || r.unit}</small>
                  </>
                ) : (
                  ''
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {smallTiles.length > 0 && (
        <div className="tile-grid tile-grid-compact">
          {smallTiles.map((t) => (
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

      {/* Your own charts come from intervals.icu; a friend's come from the
          copy stored when they opened the activity themselves (never their
          route - see the session_streams migration). */}
      {isEndurance && myId && (
        <Suspense fallback={<div className="analysis-placeholder" />}>
          <ActivityAnalysis
            session={session}
            isOwner={Boolean(isOwner)}
            onStats={setAnalysisStats}
          />
        </Suspense>
      )}

      {hasWarmupRehab && (
        <div className="detail-block">
          <h2 className="section-title">Warm-up &amp; rehab</h2>
          <div className="stack">
            {(warmupMin > 0 || warmupNote) && (
              <div className="route-line">
                <span className="route-line-name">
                  🔥 Warm-up{warmupNote ? ` · ${warmupNote}` : ''}
                </span>
                <span className="route-line-meta">
                  {warmupMin > 0 ? formatDuration(warmupMin) : ''}
                </span>
              </div>
            )}
            {(rehabMin > 0 || rehabNote) && (
              <div className="route-line">
                <span className="route-line-name">
                  🩹 Rehab{rehabNote ? ` · ${rehabNote}` : ''}
                </span>
                <span className="route-line-meta">
                  {rehabMin > 0 ? formatDuration(rehabMin) : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {grades.length > 0 && (
        <div className="detail-block">
          <h2 className="section-title">Grades worked</h2>
          <div className="chips">
            {grades.map((g) => (
              <span className="chip is-active" key={g}>
                {formatGrade(g, session.subtype)}
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
                  {r.grade && <strong>{formatGrade(r.grade, session.subtype)}</strong>}
                  {r.send_type && <span className="route-send">{sendLabel(r.send_type)}</span>}
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

      {/* Logged from the coach's Tests tab. Without this the diary entry is an
          unexplained 45-minute finger session. */}
      {testIds.length > 0 && (
        <div className="detail-block">
          <h2 className="section-title">Testing session</h2>
          <div className="stack">
            {[...new Set(testIds)].map((id) => (
              <div className="route-line" key={id}>
                <span className="route-line-name">{testMeta(id).label}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Results are on the coach&rsquo;s Tests tab.
          </p>
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
          {/* A set logged as added weight, with no bodyweight to add it to,
              can't be turned into a real load - so the coach scores it off the
              edge alone and quietly under-counts a hard session. Better to say
              so than to let the recovery window drift. */}
          {unreadableHangs && (
            <p className="muted small">
              Some of these sets can’t be read as a total load without your bodyweight, so
              the coach is scoring them off edge size alone.{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => navigate('/coach/setup')}
              >
                Add your bodyweight ›
              </button>
            </p>
          )}
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

// "20 mm · 1 × 5 · +20 kg · 7 s", collapsing uniform sets and flagging when they vary.
function fmtHang(n) {
  const reps = Math.max(1, Number(n.reps) || 1)
  const parts = []
  const ed = uniformOrNull(n.sets.map((s) => s.edge))
  if (ed === 'varies') parts.push('edges vary')
  else if (Number(ed) > 0) parts.push(`${Number(ed)} mm`)
  parts.push(`${reps} × ${n.sets.length}`)
  const w = uniformOrNull(n.sets.map((s) => s.weight))
  const t = uniformOrNull(n.sets.map((s) => s.time))
  parts.push(w === 'varies' ? 'weights vary' : fmtHangWeight(w))
  if (t === 'varies') parts.push('times vary')
  else if (Number(t) > 0) parts.push(`${Number(t)} s`)
  if (reps > 1 && Number(n.rest) > 0) parts.push(`${Number(n.rest)} s rest`)
  return parts.join(' · ')
}

function Shell({ onBack, title, children, footer, headerRight }) {
  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>{title}</h1>
        </div>
        {headerRight ?? <span style={{ width: 40 }} />}
      </header>
      <main className="wizard-body stack">{children}</main>
      {footer && <footer className="wizard-foot">{footer}</footer>}
    </div>
  )
}
