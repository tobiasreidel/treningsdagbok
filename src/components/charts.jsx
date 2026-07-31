// Minimal, dependency-free charts. Responsive via viewBox + width:100%.
// Colours come from CSS variables so they follow light/dark mode.
import { useRef, useState } from 'react'

const VW = 320 // viewBox width (uniform scale → no text distortion)
const VAL_FS = 9 // .chart-vlabel
const AXIS_FS = 9 // .chart-ylabel
const X_FS = 10 // .chart-xlabel
// Digits are roughly 0.58em wide in the app's font. Close enough to reserve the
// right space for a label without measuring it in the DOM.
const CHAR_W = 0.58

const textW = (s, fs) => String(s).length * fs * CHAR_W

// Tidy number: drop trailing .0, keep one decimal otherwise.
function fmtNum(v) {
  const r = Math.round((v || 0) * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// A gridline label carries as many decimals as its step needs, so a 0.5 step
// reads 4.5 / 5 / 5.5 instead of three copies of 5.
const stepFmt = (step) => (v) => v.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2)

function ChartEmpty({ label = 'No data yet' }) {
  return <div className="chart-empty">{label}</div>
}

// Round gridline steps (1, 2 or 5 x 10^k): the values a person would have
// picked for the axis.
function niceStep(span, target) {
  if (!(span > 0)) return 1
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  return (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag
}

// Gridlines strictly inside (min, max). The axis keeps the data's own range, so
// the tallest bar still uses the full height; the lines are only what you read
// the bars against. The 6% margin keeps a line from hiding under the top edge.
export function gridValues(min, max, target = 3) {
  const step = niceStep(max - min, target)
  const values = []
  const clear = max - (max - min) * 0.06
  for (let k = Math.floor(min / step) + 1; k * step < clear; k += 1) {
    values.push(Number((k * step).toFixed(6)))
  }
  return { step, values }
}

// Left gutter: wide enough for the widest y label, and no wider.
function gutterW(values, fmt) {
  if (!values.length) return 4
  const w = Math.max(...values.map((v) => textW(fmt(v), AXIS_FS)))
  return Math.min(40, Math.ceil(w) + 7)
}

// Keep a centred label inside the viewBox. The first and last point sit on the
// plot edge, and their number would otherwise hang off the card.
const clampX = (x, w) => Math.min(VW - w / 2, Math.max(w / 2, x))

// The box a centred text label occupies, with a little air around it.
function labelBox(x, y, text, fs) {
  const w = textW(text, fs) + 4
  const cx = clampX(x, w)
  return { x: cx, y, x0: cx - w / 2, x1: cx + w / 2, y0: y - fs, y1: y + 3 }
}

// Which labels can we actually print? A fixed every-nth dropped three numbers in
// four even when they would all have fitted. Instead every label claims a box:
// the ones that matter most (the latest point, the extremes) are placed first,
// the rest fill in left to right, and a label is drawn whenever its box is still
// clear. Because the test is a box and not a column, a spiky chart keeps far
// more numbers than a flat one - which is where they are worth having.
function fitLabels(boxes, priority = []) {
  const placed = []
  const keep = new Set()
  const clear = (b) =>
    !placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)
  const place = (i) => {
    const b = boxes[i]
    if (!b || keep.has(i) || !clear(b)) return
    keep.add(i)
    placed.push(b)
  }
  priority.forEach(place)
  for (let i = 0; i < boxes.length; i += 1) place(i)
  return keep
}

// Horizontal gridlines with their values in the left gutter, shared by Bars and
// Line so both read on the same scale furniture.
function YAxis({ values, fmt, y, left, right }) {
  return values.map((v) => (
    <g key={v}>
      <line x1={left} y1={y(v)} x2={right} y2={y(v)} className="chart-grid" />
      <text x={left - 5} y={y(v) + 3} className="chart-ylabel" textAnchor="end">
        {fmt(v)}
      </text>
    </g>
  ))
}

// X labels plus a tick on the baseline, so a label is visibly tied to its point
// even when its neighbours had to be dropped.
function XAxis({ boxes, keep, base, height }) {
  return boxes.map((b, i) =>
    b && keep.has(i) ? (
      <g key={i}>
        <line x1={b.x} x2={b.x} y1={base} y2={base + 3} className="chart-tick" />
        <text x={b.x} y={height - 5} className="chart-xlabel" textAnchor="middle">
          {b.text}
        </text>
      </g>
    ) : null,
  )
}

// Vertical bars. `data` = [{label, value, color?}] or
// [{label, segments:[{value,color}]}] for stacked bars.
export function Bars({ data, height = 184, color = 'var(--primary)', fmt = null }) {
  const n = data.length
  if (!n) return <ChartEmpty />
  const F = fmt || fmtNum
  const norm = data.map((d) => ({
    label: d.label,
    segments: d.segments || [{ value: d.value || 0, color: d.color || color }],
  }))
  const totals = norm.map((d) => d.segments.reduce((a, s) => a + (s.value || 0), 0))
  const max = Math.max(1, ...totals)
  const grid = gridValues(0, max)
  const yFmt = fmt || stepFmt(grid.step)
  const L = gutterW(grid.values, yFmt)
  const PW = VW - L
  // Past ~18 bars the numbers need the smaller size to keep fitting.
  const valFs = n > 18 ? 8 : VAL_FS
  const top = valFs + 7
  const bottom = X_FS + 12
  const plotH = height - top - bottom
  const base = top + plotH
  const slot = PW / n
  // Capped so a 4-bar month doesn't render four slabs.
  const bw = Math.max(2, Math.min(slot * 0.62, 34))
  const y = (v) => base - (v / max) * plotH
  const cx = (i) => L + i * slot + slot / 2

  const valBoxes = totals.map((t, i) =>
    t > 0 ? labelBox(cx(i), y(t) - 4, F(t), valFs) : null,
  )
  const peak = totals.indexOf(Math.max(...totals))
  const latest = totals.reduce((m, t, i) => (t > 0 ? i : m), -1)
  const showVal = fitLabels(valBoxes, [latest, peak, 0])

  const xBoxes = norm.map((d, i) => ({ ...labelBox(cx(i), height - 5, d.label, X_FS), text: d.label }))
  const showX = fitLabels(xBoxes, [n - 1, 0])

  return (
    <svg viewBox={`0 0 ${VW} ${height}`} className="chart" role="img">
      <YAxis values={grid.values} fmt={yFmt} y={y} left={L} right={VW} />
      <line x1={L} y1={base} x2={VW} y2={base} className="chart-axis" />
      {norm.map((d, i) => {
        const x = cx(i) - bw / 2
        let yTop = base
        return d.segments.map((seg, si) => {
          const h = ((seg.value || 0) / max) * plotH
          yTop -= h
          return (
            <rect key={si} x={x} y={yTop} width={bw} height={Math.max(0, h)} fill={seg.color} rx="2" />
          )
        })
      })}
      {valBoxes.map((b, i) =>
        b && showVal.has(i) ? (
          <text
            key={`v${i}`}
            x={b.x}
            y={b.y}
            className="chart-vlabel"
            textAnchor="middle"
            style={{ fontSize: `${valFs}px` }}
          >
            {F(totals[i])}
          </text>
        ) : null,
      )}
      <XAxis boxes={xBoxes} keep={showX} base={base} height={height} />
    </svg>
  )
}

// Line chart with a soft area fill. `data` = [{label, value}]. Null values are
// gaps (skipped, the line connects across them) rather than dips to zero.
//   fromZero: scale the y-axis from 0 (default) or from the data's min - the
//             latter suits trends like pace/HR where the range is narrow.
//   fmt:      custom value formatter (e.g. decimal pace -> "5:12"). It labels
//             the y-axis too, so the gridlines read in the same unit.
export function Line({ data, height = 184, color = 'var(--primary)', fromZero = true, fmt = null }) {
  const n = data.length
  const F = fmt || fmtNum
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
  const grid = gridValues(min, max)
  const yFmt = fmt || stepFmt(grid.step)
  const L = gutterW(grid.values, yFmt)
  const PW = VW - L
  const top = VAL_FS + 7
  const bottom = X_FS + 12
  const plotH = height - top - bottom
  const base = top + plotH
  const x = (i) => L + (n === 1 ? PW / 2 : (i / (n - 1)) * PW)
  const y = (v) => base - ((v - min) / (max - min)) * plotH

  let path = ''
  let started = false
  let firstX = L
  let lastX = VW
  for (let i = 0; i < n; i += 1) {
    const v = data[i].value
    if (v == null) continue
    if (!started) firstX = x(i)
    lastX = x(i)
    path += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    started = true
  }

  // Above the point normally, below it when the label would clip the top edge.
  const valBoxes = data.map((d, i) => {
    if (d.value == null) return null
    const py = y(d.value)
    return labelBox(x(i), py - 8 >= top ? py - 8 : py + 14, F(d.value), VAL_FS)
  })
  const idxOf = (pick) => data.findIndex((d) => d.value === pick)
  const showVal = fitLabels(valBoxes, [
    data.reduce((m, d, i) => (d.value != null ? i : m), -1),
    idxOf(Math.max(...vals)),
    idxOf(Math.min(...vals)),
    data.findIndex((d) => d.value != null),
  ])

  const xBoxes = data.map((d, i) => ({ ...labelBox(x(i), height - 5, d.label, X_FS), text: d.label }))
  const showX = fitLabels(xBoxes, [n - 1, 0])

  return (
    <svg viewBox={`0 0 ${VW} ${height}`} className="chart" role="img">
      <YAxis values={grid.values} fmt={yFmt} y={y} left={L} right={VW} />
      <line x1={L} y1={base} x2={VW} y2={base} className="chart-axis" />
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
      {valBoxes.map((b, i) =>
        b && showVal.has(i) ? (
          <text key={`v${i}`} x={b.x} y={b.y} className="chart-vlabel" textAnchor="middle">
            {F(data[i].value)}
          </text>
        ) : null,
      )}
      <XAxis boxes={xBoxes} keep={showX} base={base} height={height} />
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
  const H = 244
  const top = 6
  const topH = 118
  const gap = 12
  const formH = 82
  const formTop = top + topH + gap
  const x = (i) => L + (n === 1 ? PW / 2 : (i / (n - 1)) * PW)

  const maxTop = Math.max(1, ...data.map((d) => Math.max(d.ctl, d.atl))) * 1.08
  const yTop = (v) => top + topH - (v / maxTop) * topH
  // Round reference values on the left of the fitness/fatigue panel: 20/40/60
  // rather than whatever 80% of the peak happened to land on. This panel prints
  // no per-point numbers, so it asks for more lines than a bar chart needs.
  const topTicks = gridValues(0, maxTop, 4).values

  const forms = data.map((d) => d.form)
  const fMax = Math.max(12, ...forms) + 4
  const fMin = Math.min(-35, ...forms) - 4
  const yForm = (v) => formTop + ((fMax - v) / (fMax - fMin)) * formH
  // Zone boundaries double as the form panel's y values.
  const formTicks = [20, 5, -10, -30].filter((v) => v < fMax && v > fMin)

  const linePts = (get, y) =>
    data.map((d, i) => `${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(' ')

  const xBoxes = data.map((d, i) => ({ ...labelBox(x(i), H - 4, d.label, X_FS), text: d.label }))
  const showX = fitLabels(xBoxes, [n - 1, 0])

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

      {xBoxes.map((b, i) =>
        showX.has(i) ? (
          <text key={i} x={b.x} y={H - 4} className="chart-xlabel" textAnchor="middle">
            {b.text}
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
