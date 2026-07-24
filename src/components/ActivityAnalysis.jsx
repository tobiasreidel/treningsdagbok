// Strava-style analysis for an imported activity: route map, stacked metric
// charts with a shared scrubber (hover to inspect, drag to zoom), splits,
// time-in-zone and laps. Data comes from intervals.icu via lib/streams
// (cached per activity).
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchActivityAnalysis, fetchSharedAnalysis } from '../lib/streams'
import { getHrZoneConfig } from '../lib/prefs'
import { ZONE_COLORS } from '../lib/constants'

const VW = 320 // chart viewBox width, matches components/charts.jsx

// ---- tiny formatters -------------------------------------------------------
const round1 = (n) => Math.round(n * 10) / 10

function fmtDur(secs) {
  const s = Math.max(0, Math.round(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtPaceFromKmh(kmh) {
  if (!kmh || kmh <= 0) return '–'
  const secsPerKm = 3600 / kmh
  if (secsPerKm > 30 * 60) return '–' // slower than 30 min/km: not a pace
  const m = Math.floor(secsPerKm / 60)
  const s = Math.round(secsPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const avgOf = (arr) => {
  const vals = arr.filter((v) => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}
const maxOf = (arr) => {
  const vals = arr.filter((v) => v != null)
  return vals.length ? Math.max(...vals) : null
}

// ---- component -------------------------------------------------------------
// Your own activity fetches from intervals.icu (and stores a copy friends can
// read). Someone else's can only come from that stored copy - their activity
// lives in their intervals.icu account, which your API key cannot touch - so
// a friend's ride shows charts once they've opened it themselves, and simply
// nothing before that.
export default function ActivityAnalysis({ session, isOwner, onStats }) {
  const intervalsId = session.extra?.intervals_id
  const sessionId = session.id
  const [state, setState] = useState({ status: 'loading' })
  // Where along the activity (0..1) the charts are being inspected - the map
  // shows a matching position dot.
  const [scrubFrac, setScrubFrac] = useState(null)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })

    if (!isOwner) {
      fetchSharedAnalysis(sessionId)
        .then((analysis) =>
          alive && setState(analysis ? { status: 'ready', analysis } : { status: 'none' }),
        )
        .catch(() => alive && setState({ status: 'none' }))
      return () => {
        alive = false
      }
    }

    if (!intervalsId) return undefined
    fetchActivityAnalysis(intervalsId, { sessionId })
      .then((analysis) => alive && setState({ status: 'ready', analysis }))
      .catch((err) =>
        alive && setState({ status: err?.code === 'no-creds' ? 'no-creds' : 'error' }),
      )
    return () => {
      alive = false
    }
  }, [intervalsId, sessionId, isOwner])

  // Hand the computed stats up so SessionDetail can show max power in its
  // summary. It's the true stream max (the same number the Power chart header
  // shows) and it works for your own rides and a friend's shared copy alike -
  // no stored field to backfill onto older activities.
  useEffect(() => {
    if (!onStats) return
    onStats(state.status === 'ready' ? state.analysis?.stats || null : null)
  }, [state, onStats])

  if (isOwner && !intervalsId) return null
  if (state.status === 'no-creds') return null
  // Silence here just looks broken - say why there's nothing to show.
  if (state.status === 'none') {
    return (
      <p className="muted small">
        No charts shared for this activity yet. They appear once its owner has
        opened the app with activity sharing on.
      </p>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="detail-block">
        <div className="analysis-loading card">
          <div className="spinner" />
          <span className="muted small">Loading analysis…</span>
        </div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <p className="muted small">Couldn’t load charts from intervals.icu right now.</p>
    )
  }

  const { points, stats, latlng, hrZones, powerZones, laps } = state.analysis
  const isRun = session.sport === 'running'

  // "Use intervals.icu zones" shows them exactly as sent (their count, their
  // bucketing). Otherwise the user's own zones re-bucket the recorded stream,
  // falling back to intervals.icu's buckets collapsed to the chosen count
  // when no max HR / custom zones are set yet.
  // On someone else's activity the stored zones stand as they are: they're the
  // owner's setup, and reinterpreting their heart rate through your max HR
  // would be worse than useless.
  const zoneCfg = getHrZoneConfig()
  const shownHrZones =
    !isOwner || zoneCfg.useIcu
      ? hrZones
      : ((zoneCfg.ceilings ? zonesFromStream(points, zoneCfg.ceilings) : null) ??
        (hrZones ? collapseZones(hrZones, zoneCfg.count) : null))

  return (
    <>
      {latlng && (
        <div className="detail-block">
          <h2 className="section-title">Route</h2>
          <RouteMap latlng={latlng} scrubFrac={scrubFrac} />
        </div>
      )}

      {points && (
        <div className="detail-block">
          <h2 className="section-title">Analysis</h2>
          <StreamStrips points={points} stats={stats} isRun={isRun} onScrub={setScrubFrac} />
        </div>
      )}

      {points && points.km && session.sport !== 'swimming' && (
        <Splits points={points} isRun={isRun} />
      )}

      {(shownHrZones || powerZones) && (
        <div className="detail-block">
          <h2 className="section-title">Time in zones</h2>
          <div className="stack" style={{ gap: 12 }}>
            {shownHrZones && <ZoneBars title="Heart rate" zones={shownHrZones} />}
            {powerZones && <ZoneBars title="Power" zones={powerZones} />}
          </div>
        </div>
      )}

      {laps && <LapsList laps={laps} isRun={isRun} />}
    </>
  )
}

// ---- route map -------------------------------------------------------------
// The GPS track on a real map (Leaflet + OpenStreetMap tiles). The polyline is
// a vector layer, so even offline (grey tiles) the route stays visible. A dot
// tracks the position being inspected in the charts below.
function accentColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#4f46e5'
  )
}

function RouteMap({ latlng, scrubFrac }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const scrubMarkerRef = useRef(null)

  useEffect(() => {
    const map = L.map(divRef.current, {
      // Wheel zoom hijacks page scrolling on desktop; +/- buttons and pinch
      // still zoom.
      scrollWheelZoom: false,
      zoomSnap: 0.5,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    const accent = accentColor()
    const line = L.polyline(latlng, { color: accent, weight: 3, opacity: 0.9 }).addTo(map)
    // Plain circle markers - Leaflet's default icon images don't survive
    // bundling, and dots match the app's look anyway.
    L.circleMarker(latlng[0], {
      radius: 5, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1,
    }).addTo(map)
    L.circleMarker(latlng[latlng.length - 1], {
      radius: 5, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1,
    }).addTo(map)
    map.fitBounds(line.getBounds(), { padding: [18, 18] })

    scrubMarkerRef.current = L.circleMarker(latlng[0], {
      radius: 7, color: '#fff', weight: 2, fillColor: accent, fillOpacity: 1,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      scrubMarkerRef.current = null
    }
  }, [latlng])

  // Move the position dot as the charts are scrubbed.
  useEffect(() => {
    const map = mapRef.current
    const marker = scrubMarkerRef.current
    if (!map || !marker) return
    if (scrubFrac == null) {
      marker.remove()
      return
    }
    const i = Math.round(scrubFrac * (latlng.length - 1))
    marker.setLatLng(latlng[Math.max(0, Math.min(latlng.length - 1, i))])
    if (!map.hasLayer(marker)) marker.addTo(map)
  }, [scrubFrac, latlng])

  return <div ref={divRef} className="route-map" aria-label="Route map" />
}

// ---- stacked metric strips with one shared scrubber ------------------------
const STRIPS = [
  { key: 'alt', label: 'Elevation', unit: 'm', color: 'var(--climbing)', area: true, minBased: true, fmt: (v) => `${Math.round(v)}` },
  { key: 'speed', label: 'Speed', unit: 'km/h', color: 'var(--cycling)', fmt: (v) => `${round1(v)}` },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', color: 'var(--running)', minBased: true, fmt: (v) => `${Math.round(v)}` },
  { key: 'watts', label: 'Power', unit: 'W', color: 'var(--primary)', fmt: (v) => `${Math.round(v)}` },
  { key: 'cad', label: 'Cadence', unit: 'rpm', color: 'var(--strength)', fmt: (v) => `${Math.round(v)}` },
]

// Cut the downsampled streams to a zoomed [from, to] window (full arrays when
// range is null). Values keep their real units, so headers/readouts stay true.
function sliceView(points, range) {
  if (!range) return points
  const [a, b] = range
  const cut = (arr) => (arr ? arr.slice(a, b + 1) : null)
  return {
    t: points.t.slice(a, b + 1),
    km: cut(points.km),
    alt: cut(points.alt),
    speed: cut(points.speed),
    hr: cut(points.hr),
    watts: cut(points.watts),
    cad: cut(points.cad),
    n: b - a + 1,
  }
}

// Interaction model:
//   mouse:  hover = inspect · press-drag = mark a region, release zooms into it
//   touch:  one finger slides the inspector · two fingers frame a region,
//           lifting zooms into it
// Double-click / the reset button restore the full activity.
function StreamStrips({ points, stats, isRun, onScrub }) {
  const [idx, setIdx] = useState(null) // index within the current (zoomed) view
  const [range, setRange] = useState(null) // [from, to] into the full arrays
  const [sel, setSel] = useState(null) // {a, b} view indices while marking
  const wrapRef = useRef(null)
  const gesture = useRef(null) // live mouse gesture, kept out of state
  const touches = useRef(new Map()) // pointerId -> view index, for live fingers

  const view = useMemo(() => sliceView(points, range), [points, range])
  const n = view.n
  const offset = range ? range[0] : 0

  // iOS Safari doesn't reliably honour `touch-action: none` when the finger
  // lands on a child (the SVGs compute to touch-action: auto), so a drag that
  // drifts even slightly vertically gets stolen by the page scroll and the
  // scrub dies - worst on a tall page like your own ride with its map. A
  // non-passive touchmove that always preventDefaults keeps every finger ours;
  // React's onTouchMove is passive and can't. Scroll the page from outside the
  // card, same as every other chart app.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const block = (e) => e.preventDefault()
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  const strips = STRIPS.filter((s) => view[s.key]).map((s) => {
    const strip = { ...s }
    // Runners think in pace; the curve still plots speed so up = faster.
    if (s.key === 'speed' && isRun) {
      strip.label = 'Pace'
      strip.unit = '/km'
      strip.fmt = (v) => fmtPaceFromKmh(v)
    }
    if (s.key === 'cad' && isRun) strip.unit = 'spm'
    return strip
  })
  if (!strips.length) return null

  // Report the inspected point, and its overall position to the route map.
  const report = (i) => {
    setIdx(i)
    onScrub?.(i == null ? null : (offset + i) / (points.n - 1))
  }

  const idxFromEvent = (e) => {
    const el = wrapRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))))
  }

  // Zoom into [a, b] view indices - keep ≥8 points so the zoomed charts
  // still have a shape.
  const zoomTo = (a, b) => {
    setSel(null)
    if (Math.abs(b - a) >= 8) {
      setRange([offset + Math.min(a, b), offset + Math.max(a, b)])
      report(null)
      return true
    }
    return false
  }

  const onPointerDown = (e) => {
    try {
      wrapRef.current?.setPointerCapture?.(e.pointerId)
    } catch {
      // Capture is best-effort (fails for synthetic events); tracking works
      // without it as long as the pointer stays over the card.
    }
    const i = idxFromEvent(e)
    if (e.pointerType === 'mouse') {
      gesture.current = { startIdx: i, lastIdx: i }
      setSel({ a: i, b: i })
      report(i)
      return
    }
    if (touches.current.size >= 2) return // ignore a 3rd finger
    touches.current.set(e.pointerId, i)
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      setSel({ a, b })
      report(null)
    } else {
      report(i)
    }
  }

  const onPointerMove = (e) => {
    const i = idxFromEvent(e)
    if (e.pointerType === 'mouse') {
      const g = gesture.current
      if (!g) {
        report(i) // plain hover inspects
        return
      }
      g.lastIdx = i
      setSel({ a: g.startIdx, b: i })
      report(i)
      return
    }
    if (!touches.current.has(e.pointerId)) return
    touches.current.set(e.pointerId, i)
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      setSel({ a, b })
    } else {
      report(i)
    }
  }

  const onPointerUp = (e) => {
    const cancelled = e.type === 'pointercancel'
    if (e.pointerType === 'mouse') {
      const g = gesture.current
      gesture.current = null
      if (g && !cancelled && zoomTo(g.startIdx, g.lastIdx)) return
      setSel(null)
      return
    }
    if (!touches.current.has(e.pointerId)) return
    const two = touches.current.size === 2
    const [a, b] = [...touches.current.values()]
    // Lifting either finger of a pair commits the framed region; the leftover
    // finger is forgotten so it doesn't scrub the freshly zoomed view.
    touches.current.clear()
    if (two && !cancelled && zoomTo(a, b)) return
    setSel(null)
    report(null)
  }

  const onPointerLeave = () => {
    if (!gesture.current && touches.current.size === 0) report(null)
  }

  const resetZoom = () => {
    setRange(null)
    setSel(null)
    report(null)
  }

  const atKm = idx != null && view.km ? view.km[idx] : null
  const atT = idx != null ? view.t[idx] : null
  const zoomLabel =
    range == null
      ? null
      : view.km
        ? `${round1(view.km[0])}–${round1(view.km[n - 1])} km`
        : `${fmtDur(view.t[0])}–${fmtDur(view.t[n - 1])}`
  // A marking wide enough to zoom shows its span live, so letting go is a
  // conscious "zoom to this" on both mouse and touch.
  const selSpan =
    sel && Math.abs(sel.b - sel.a) >= 8
      ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)]
      : null
  const coarse =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches

  return (
    <div className="card strips-card">
      <div className="strips-readout">
        {selSpan ? (
          <span>
            Release to zoom ·{' '}
            {view.km
              ? `${round1(view.km[selSpan[0]])}–${round1(view.km[selSpan[1]])} km`
              : `${fmtDur(view.t[selSpan[0]])}–${fmtDur(view.t[selSpan[1]])}`}
          </span>
        ) : idx != null ? (
          <span>
            <strong>{atKm != null ? `${round1(atKm)} km` : ''}</strong>
            {atKm != null ? ' · ' : ''}
            {fmtDur(atT)}
          </span>
        ) : range ? (
          <span className="muted">Zoomed · {zoomLabel}</span>
        ) : (
          <span className="muted">
            {coarse
              ? 'Slide to inspect · two fingers to zoom'
              : 'Hover to inspect · drag to zoom in'}
          </span>
        )}
        {range && (
          <button type="button" className="link-btn strips-reset" onClick={resetZoom}>
            ✕ Reset zoom
          </button>
        )}
      </div>
      <div
        ref={wrapRef}
        className="strips"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={resetZoom}
      >
        {strips.map((s) => (
          <Strip
            key={s.key}
            points={view}
            strip={s}
            idx={idx}
            sel={sel}
            // Exact full-ride stats only apply to the full view; a zoomed
            // window recomputes over what's visible.
            exact={range ? null : stats?.[s.key]}
          />
        ))}
        <XAxis points={view} />
      </div>
    </div>
  )
}

function Strip({ points, strip, idx, sel, exact }) {
  const values = points[strip.key]
  const n = points.n
  const H = 74
  const top = 6
  const bottom = 4
  const plotH = H - top - bottom

  const { path, area, y } = useMemo(() => {
    const vals = values.filter((v) => v != null)
    let min = strip.minBased ? Math.min(...vals) : 0
    let max = Math.max(...vals)
    if (max === min) max = min + 1
    // Breathing room so the line doesn't kiss the strip edges.
    const padV = (max - min) * 0.08
    min = strip.minBased ? min - padV : min
    max += padV
    const x = (i) => (n === 1 ? VW / 2 : (i / (n - 1)) * VW)
    const yf = (v) => top + plotH - ((v - min) / (max - min)) * plotH
    let d = ''
    let started = false
    for (let i = 0; i < n; i += 1) {
      const v = values[i]
      if (v == null) continue
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${yf(v).toFixed(1)}`
      started = true
    }
    const base = top + plotH
    const areaD = d ? `${d}L${VW},${base}L0,${base}Z` : ''
    return { path: d, area: areaD, y: yf }
  }, [values, n, strip.minBased, plotH])

  const avg = exact ? exact.avg : avgOf(values)
  const max = exact ? exact.max : maxOf(values)
  const scrubVal = idx != null ? values[idx] : null

  return (
    <div className="strip">
      <div className="strip-head">
        <span className="strip-label">{strip.label}</span>
        <span className="strip-meta">
          {avg != null && (
            <>
              avg {strip.fmt(avg)} · max {strip.fmt(max)} {strip.unit}
            </>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${VW} ${H}`} className="chart strip-chart" role="img" aria-label={strip.label}>
        {strip.area ? (
          <path d={area} fill={strip.color} opacity="0.18" />
        ) : (
          <path d={area} fill={strip.color} opacity="0.07" />
        )}
        <path d={path} fill="none" stroke={strip.color} strokeWidth="1.8" />
        {sel && (
          <rect
            x={(Math.min(sel.a, sel.b) / (n - 1)) * VW}
            y="0"
            width={Math.max(1, ((Math.abs(sel.b - sel.a)) / (n - 1)) * VW)}
            height={H}
            className="strip-selection"
          />
        )}
        {idx != null && (
          <line
            x1={(idx / (n - 1)) * VW}
            x2={(idx / (n - 1)) * VW}
            y1="0"
            y2={H}
            className="strip-cursor"
          />
        )}
        {idx != null && scrubVal != null && (
          <circle cx={(idx / (n - 1)) * VW} cy={y(scrubVal)} r="3" fill={strip.color} />
        )}
        {/* the value rides along with the cursor (avg/max stay in the header) */}
        {idx != null && scrubVal != null && (
          <text
            x={(idx / (n - 1)) * VW + (idx > n * 0.72 ? -7 : 7)}
            y={Math.max(12, y(scrubVal) - 8)}
            className="strip-tip"
            textAnchor={idx > n * 0.72 ? 'end' : 'start'}
            style={{ fill: strip.color }}
          >
            {strip.fmt(scrubVal)} {strip.unit}
          </text>
        )}
      </svg>
    </div>
  )
}

// Distance (or elapsed-time) ticks under the last strip. When zoomed into a
// narrow window, whole-km labels would repeat - switch to one decimal.
function XAxis({ points }) {
  const n = points.n
  const km = points.km
  const span = km ? km[n - 1] - km[0] : 0
  const kmLabel = (v) => (span < 12 ? `${round1(v)}` : `${Math.round(v)}`)
  const ticks = 5
  const items = []
  for (let i = 0; i <= ticks; i += 1) {
    const frac = i / ticks
    const at = Math.round(frac * (n - 1))
    items.push({
      x: frac * VW,
      label: km ? kmLabel(km[at]) : fmtDur(points.t[at]),
      anchor: i === 0 ? 'start' : i === ticks ? 'end' : 'middle',
    })
  }
  return (
    <svg viewBox={`0 0 ${VW} 16`} className="chart" role="presentation">
      {items.map((t, i) => (
        <text key={i} x={t.x} y="12" className="chart-xlabel" textAnchor={t.anchor}>
          {t.label}
          {km && i === items.length - 1 ? ' km' : ''}
        </text>
      ))}
    </svg>
  )
}

// ---- splits ----------------------------------------------------------------
function computeSplits(points, splitKm) {
  const { t, km, hr, alt } = points
  const total = km[points.n - 1]
  if (!total || total < splitKm * 0.5) return []
  const splits = []
  let startIdx = 0
  let startT = t[0]
  let bound = splitKm

  const sliceStats = (from, to) => {
    let hrSum = 0
    let hrN = 0
    let gain = 0
    for (let i = from + 1; i <= to; i += 1) {
      if (hr && hr[i] != null) {
        hrSum += hr[i]
        hrN += 1
      }
      if (alt && alt[i] != null && alt[i - 1] != null) {
        const d = alt[i] - alt[i - 1]
        if (d > 0) gain += d
      }
    }
    return { hr: hrN ? Math.round(hrSum / hrN) : null, gain: Math.round(gain) }
  }

  for (let i = 1; i < points.n; i += 1) {
    if (km[i] == null) continue
    while (km[i] >= bound) {
      // Interpolate the boundary crossing time between i-1 and i.
      const k0 = km[i - 1] ?? km[i]
      const k1 = km[i]
      const f = k1 === k0 ? 1 : (bound - k0) / (k1 - k0)
      const tAt = t[i - 1] + (t[i] - t[i - 1]) * Math.max(0, Math.min(1, f))
      const secs = tAt - startT
      const stats = sliceStats(startIdx, i)
      splits.push({ endKm: bound, lenKm: splitKm, secs, ...stats })
      startT = tAt
      startIdx = i
      bound += splitKm
    }
  }
  // Trailing partial split (only when it's a meaningful chunk).
  const lastKm = total - (bound - splitKm)
  if (lastKm >= splitKm * 0.2) {
    const secs = t[points.n - 1] - startT
    const stats = sliceStats(startIdx, points.n - 1)
    splits.push({ endKm: total, lenKm: lastKm, secs, partial: true, ...stats })
  }
  return splits.slice(0, 40)
}

function Splits({ points, isRun }) {
  const total = points.km[points.n - 1] || 0
  const splitKm = isRun ? 1 : total >= 30 ? 5 : 1
  const splits = useMemo(() => computeSplits(points, splitKm), [points, splitKm])
  if (splits.length < 2) return null

  const speeds = splits.map((s) => (s.secs > 0 ? (s.lenKm / s.secs) * 3600 : 0))
  const maxSpeed = Math.max(...speeds)

  return (
    <div className="detail-block">
      <h2 className="section-title">
        Splits · {splitKm} km
      </h2>
      <div className="card splits-card">
        <div className="splits-head">
          <span>km</span>
          <span />
          <span>{isRun ? 'pace' : 'km/h'}</span>
          <span>hr</span>
        </div>
        {splits.map((s, i) => {
          const kmh = speeds[i]
          return (
            <div className="split-row" key={i}>
              <span className="split-km">
                {s.partial ? round1(s.lenKm) : Math.round(s.endKm)}
              </span>
              <span className="split-track">
                <span
                  className="split-fill"
                  style={{ width: `${maxSpeed ? Math.max(4, (kmh / maxSpeed) * 100) : 0}%` }}
                />
              </span>
              <span className="split-val">{isRun ? fmtPaceFromKmh(kmh) : round1(kmh)}</span>
              <span className="split-hr">{s.hr ?? ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- time in zones ---------------------------------------------------------

// Bucket the recorded HR stream into the user's own zones (Profile → Heart
// rate zones). The chart points are ~420 bucket-averages of the 1 Hz stream,
// so summing their time gaps gives time-in-zone accurate to a few seconds -
// plenty for these bars, and it means custom zones work on cached analyses.
function zonesFromStream(points, ceilings) {
  if (!points?.hr || !points?.t) return null
  const secs = new Array(ceilings.length + 1).fill(0)
  // Cap each gap at 3× the average spacing so auto-pause jumps don't count
  // as time spent in a zone.
  const maxDt = (3 * points.t[points.n - 1]) / points.n
  for (let i = 1; i < points.n; i += 1) {
    const hr = points.hr[i]
    if (hr == null) continue
    const dt = Math.min(points.t[i] - points.t[i - 1], maxDt)
    if (!(dt > 0)) continue
    const zi = ceilings.findIndex((c) => hr <= c)
    secs[zi === -1 ? ceilings.length : zi] += dt
  }
  if (!secs.some((s) => s > 0)) return null
  return secs.map((s, i) => ({
    label: `Z${i + 1}`,
    secs: Math.round(s),
    range: i < ceilings.length ? `≤${ceilings[i]}` : `>${ceilings[ceilings.length - 1]}`,
  }))
}

// Collapse a zone breakdown to `count` zones by merging the top ones into the
// last zone (7 → 5 keeps Z1–Z4 and folds Z5–Z7 into Z5). Used when falling
// back to intervals.icu's zones - cached analyses keep all zones.
function collapseZones(zones, count) {
  if (zones.length <= count) return zones
  const kept = zones.slice(0, count - 1)
  const merged = zones.slice(count - 1)
  const prevRange = kept[kept.length - 1]?.range || ''
  return [
    ...kept,
    {
      label: `Z${count}`,
      secs: merged.reduce((a, z) => a + z.secs, 0),
      // The merged zone spans everything above the previous ceiling.
      range: prevRange.startsWith('≤') ? prevRange.replace('≤', '>') : '',
    },
  ]
}

function ZoneBars({ title, zones }) {
  const total = zones.reduce((a, z) => a + z.secs, 0)
  if (!total) return null
  return (
    <div className="zone-block">
      <span className="zone-title">{title}</span>
      <div className="hbars">
        {zones.map((z, i) => (
          <div className="hbar-row zone-row" key={z.label}>
            <span className="hbar-label">
              {z.label}
              {z.range ? <small className="zone-range"> {z.range}</small> : null}
            </span>
            <span className="hbar-track">
              <span
                className="hbar-fill"
                style={{
                  width: `${(z.secs / total) * 100}%`,
                  background: ZONE_COLORS[i % ZONE_COLORS.length],
                }}
              />
            </span>
            <span className="hbar-val zone-val">
              {z.secs ? fmtDur(z.secs) : '–'}
              <small> {Math.round((z.secs / total) * 100)}%</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- laps ------------------------------------------------------------------
function LapsList({ laps, isRun }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? laps : laps.slice(0, 8)
  return (
    <div className="detail-block">
      <h2 className="section-title">Intervals</h2>
      <div className="card laps-card">
        {shown.map((lap, i) => (
          <div className={`lap-row ${lap.type === 'WORK' ? 'is-work' : ''}`} key={i}>
            <span className="lap-name">{lap.label}</span>
            <span className="lap-meta">
              {fmtDur(lap.secs)}
              {lap.km != null && lap.km >= 0.1 ? ` · ${round1(lap.km)} km` : ''}
              {lap.watts != null
                ? ` · ${lap.watts} W`
                : lap.speed != null
                  ? ` · ${isRun ? `${fmtPaceFromKmh(lap.speed)}/km` : `${round1(lap.speed)} km/h`}`
                  : ''}
              {lap.hr != null ? ` · ${lap.hr} bpm` : ''}
            </span>
          </div>
        ))}
        {laps.length > 8 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `Show all ${laps.length} intervals`}
          </button>
        )}
      </div>
    </div>
  )
}
