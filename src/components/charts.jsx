// Minimal, dependency-free charts. Responsive via viewBox + width:100%.
// Colours come from CSS variables so they follow light/dark mode.
import { useRef, useState } from 'react'

const VW = 320 // viewBox width (uniform scale → no text distortion)

// Tidy number: drop trailing .0, keep one decimal otherwise.
function fmtNum(v) {
  const r = Math.round((v || 0) * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function ChartEmpty({ label = 'No data yet' }) {
  return <div className="chart-empty">{label}</div>
}

// Vertical bars. `data` = [{label, value, color?}] or
// [{label, segments:[{value,color}]}] for stacked bars.
export function Bars({ data, height = 170, color = 'var(--primary)' }) {
  const n = data.length
  if (!n) return <ChartEmpty />
  const norm = data.map((d) => ({
    label: d.label,
    segments: d.segments || [{ value: d.value || 0, color: d.color || color }],
  }))
  const totals = norm.map((d) => d.segments.reduce((a, s) => a + (s.value || 0), 0))
  const max = Math.max(1, ...totals)
  const top = 18 // headroom for value labels
  const bottom = 22
  const plotH = height - top - bottom
  const slot = VW / n
  const bw = Math.max(2, slot * 0.6)
  const labelEvery = Math.ceil(n / 7)

  return (
    <svg viewBox={`0 0 ${VW} ${height}`} className="chart" role="img">
      <line x1="0" y1={top + plotH} x2={VW} y2={top + plotH} className="chart-axis" />
      {norm.map((d, i) => {
        const x = i * slot + (slot - bw) / 2
        let y = top + plotH
        return d.segments.map((seg, si) => {
          const h = ((seg.value || 0) / max) * plotH
          y -= h
          return (
            <rect key={si} x={x} y={y} width={bw} height={Math.max(0, h)} fill={seg.color} rx="2" />
          )
        })
      })}
      {/* value on top of each (non-zero) bar */}
      {totals.map((t, i) =>
        t > 0 ? (
          <text
            key={`v${i}`}
            x={i * slot + slot / 2}
            y={top + plotH - (t / max) * plotH - 4}
            className="chart-vlabel"
            textAnchor="middle"
          >
            {fmtNum(t)}
          </text>
        ) : null,
      )}
      {norm.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={`l${i}`} x={i * slot + slot / 2} y={height - 6} className="chart-xlabel" textAnchor="middle">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// Line chart with a soft area fill. `data` = [{label, value}]. Null values are
// gaps (skipped, the line connects across them) rather than dips to zero.
//   fromZero: scale the y-axis from 0 (default) or from the data's min - the
//             latter suits trends like pace/HR where the range is narrow.
//   fmt:      custom value-label formatter (e.g. decimal pace -> "5:12").
export function Line({ data, height = 170, color = 'var(--primary)', fromZero = true, fmt = fmtNum }) {
  const n = data.length
  const vals = data.map((d) => d.value).filter((v) => v != null)
  if (!n || !vals.length) return <ChartEmpty />
  let min = fromZero ? 0 : Math.min(...vals)
  let max = Math.max(...vals)
  if (max === min) max = min + 1
  if (!fromZero) {
    const pad = (max - min) * 0.15
    min -= pad
    max += pad
  }
  const top = 18
  const bottom = 22
  const plotH = height - top - bottom
  const x = (i) => (n === 1 ? VW / 2 : (i / (n - 1)) * VW)
  const y = (v) => top + plotH - ((v - min) / (max - min)) * plotH
  let path = ''
  let started = false
  let firstX = 0
  let lastX = VW
  for (let i = 0; i < n; i += 1) {
    const v = data[i].value
    if (v == null) continue
    if (!started) firstX = x(i)
    lastX = x(i)
    path += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    started = true
  }
  const base = top + plotH
  const labelEvery = Math.ceil(n / 6)

  return (
    <svg viewBox={`0 0 ${VW} ${height}`} className="chart" role="img">
      <line x1="0" y1={base} x2={VW} y2={base} className="chart-axis" />
      {vals.length > 1 && path && (
        <path
          d={`${path}L${lastX.toFixed(1)},${base}L${firstX.toFixed(1)},${base}Z`}
          fill={color}
          opacity="0.12"
          stroke="none"
        />
      )}
      {vals.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth="2.5" />}
      {data.map((d, i) =>
        d.value != null ? <circle key={i} cx={x(i)} cy={y(d.value)} r="2.5" fill={color} /> : null,
      )}
      {/* value labels (sparse, non-zero) so the line reads as numbers too */}
      {data.map((d, i) =>
        i % labelEvery === 0 && d.value != null && d.value !== 0 ? (
          <text key={`v${i}`} x={x(i)} y={y(d.value) - 7} className="chart-vlabel" textAnchor="middle">
            {fmt(d.value)}
          </text>
        ) : null,
      )}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={`l${i}`} x={x(i)} y={height - 6} className="chart-xlabel" textAnchor="middle">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// Fitness & form chart, intervals.icu-style: two stacked panels in one SVG.
// Top: fitness (bold) + fatigue (thin) lines. Bottom: form as a line over its
// coloured zones (fresh / grey / optimal / high-risk bands). Hovering (or
// dragging on touch) scrubs day by day; the hovered index is reported via
// onScrub so the caller can show that day's numbers in a fixed spot.
//   data = [{ label, ctl, atl, form }]
const FORM_BANDS = [
  { from: 20, to: Infinity, color: 'var(--cycling)', label: 'Transition' },
  { from: 5, to: 20, color: 'var(--swimming)', label: 'Fresh' },
  { from: -10, to: 5, color: 'var(--text-muted)', label: 'Grey zone' },
  { from: -30, to: -10, color: 'var(--both)', label: 'Optimal' },
  { from: -Infinity, to: -30, color: 'var(--danger)', label: 'High risk' },
]

export function FitnessChart({ data, onScrub }) {
  const [idx, setIdx] = useState(null)
  const svgRef = useRef(null)
  const n = data.length
  if (!n) return <ChartEmpty />

  // ---- geometry: plot area with a left gutter (y values) and a right gutter
  // (zone names), intervals.icu-style ----
  const L = 26
  const RG = 54
  const PW = VW - L - RG
  const H = 240
  const top = 6
  const topH = 118
  const gap = 12
  const formH = 82
  const formTop = top + topH + gap
  const x = (i) => L + (n === 1 ? PW / 2 : (i / (n - 1)) * PW)

  const maxTop = Math.max(1, ...data.map((d) => Math.max(d.ctl, d.atl))) * 1.08
  const yTop = (v) => top + topH - (v / maxTop) * topH
  // Two reference values on the left of the fitness/fatigue panel.
  const topTicks = [Math.round(maxTop * 0.8), Math.round(maxTop * 0.4)].filter((v) => v > 0)

  const forms = data.map((d) => d.form)
  const fMax = Math.max(12, ...forms) + 4
  const fMin = Math.min(-35, ...forms) - 4
  const yForm = (v) => formTop + ((fMax - v) / (fMax - fMin)) * formH
  // Zone boundaries double as the form panel's y values.
  const formTicks = [20, 5, -10, -30].filter((v) => v < fMax && v > fMin)

  const linePts = (get, y) =>
    data.map((d, i) => `${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(' ')
  const labelEvery = Math.ceil(n / 5)

  // ---- scrubbing: hover with a mouse, drag on touch ----
  const report = (i) => {
    setIdx(i)
    onScrub?.(i)
  }
  const idxFromEvent = (e) => {
    const el = svgRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    // Map into the plot area, not the full svg (the gutters aren't data).
    const plotLeft = rect.left + rect.width * (L / VW)
    const plotW = rect.width * (PW / VW)
    const frac = (e.clientX - plotLeft) / plotW
    return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))))
  }
  const onPointerDown = (e) => {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId)
    } catch {
      // best-effort
    }
    report(idxFromEvent(e))
  }
  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' || e.buttons > 0) report(idxFromEvent(e))
  }
  const onPointerEnd = (e) => {
    if (e.pointerType !== 'mouse') report(null)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${H}`}
      className="chart fitness-chart"
      role="img"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={() => report(null)}
    >
      {/* top panel: fitness + fatigue, with y values on the left */}
      {topTicks.map((v) => (
        <g key={v}>
          <line x1={L} y1={yTop(v)} x2={L + PW} y2={yTop(v)} className="chart-grid" />
          <text x={L - 4} y={yTop(v) + 3} className="chart-ylabel" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <line x1={L} y1={top + topH} x2={L + PW} y2={top + topH} className="chart-axis" />
      <polyline points={linePts((d) => d.atl, yTop)} fill="none" stroke="var(--strength)" strokeWidth="1.3" opacity="0.75" />
      <polyline points={linePts((d) => d.ctl, yTop)} fill="none" stroke="var(--climbing)" strokeWidth="2.5" />

      {/* form panel: coloured zone bands, y values left, zone names right */}
      {FORM_BANDS.map((b, i) => {
        const lo = Math.max(fMin, b.from)
        const hi = Math.min(fMax, b.to)
        if (hi <= lo) return null
        const yHi = yForm(hi)
        const bandH = yForm(lo) - yHi
        return (
          <g key={i}>
            <rect x={L} y={yHi} width={PW} height={bandH} fill={b.color} opacity="0.13" />
            {bandH >= 9 && (
              <text
                x={L + PW + 5}
                y={yHi + bandH / 2 + 3}
                className="chart-zlabel"
                style={{ fill: b.color }}
              >
                {b.label}
              </text>
            )}
          </g>
        )
      })}
      {formTicks.map((v) => (
        <text key={v} x={L - 4} y={yForm(v) + 3} className="chart-ylabel" textAnchor="end">
          {v}
        </text>
      ))}
      <line x1={L} y1={yForm(0)} x2={L + PW} y2={yForm(0)} className="chart-axis" />
      <polyline points={linePts((d) => d.form, yForm)} fill="none" stroke="var(--text)" strokeWidth="1.6" opacity="0.85" />

      {/* scrub cursor across both panels */}
      {idx != null && (
        <g>
          <line x1={x(idx)} x2={x(idx)} y1={top} y2={formTop + formH} className="strip-cursor" />
          <circle cx={x(idx)} cy={yTop(data[idx].ctl)} r="3" fill="var(--climbing)" />
          <circle cx={x(idx)} cy={yTop(data[idx].atl)} r="2.5" fill="var(--strength)" />
          <circle cx={x(idx)} cy={yForm(data[idx].form)} r="3" fill="var(--text)" />
        </g>
      )}

      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={x(i)} y={H - 4} className="chart-xlabel" textAnchor="middle">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// Horizontal bars (HTML) - good for labelled categories like the grade pyramid.
export function HBars({ data, color = 'var(--primary)', unit = '' }) {
  if (!data.length) return <ChartEmpty />
  const max = Math.max(1, ...data.map((d) => d.value || 0))
  return (
    <div className="hbars">
      {data.map((d, i) => (
        <div className="hbar-row" key={i}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span
              className="hbar-fill"
              style={{ width: `${((d.value || 0) / max) * 100}%`, background: d.color || color }}
            />
          </span>
          <span className="hbar-val">
            {d.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}
