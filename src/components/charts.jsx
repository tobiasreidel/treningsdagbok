// Minimal, dependency-free charts. Responsive via viewBox + width:100%.
// Colours come from CSS variables so they follow light/dark mode.

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

// Line chart with a soft area fill. `data` = [{label, value}].
export function Line({ data, height = 170, color = 'var(--primary)' }) {
  const n = data.length
  if (!n) return <ChartEmpty />
  const max = Math.max(1, ...data.map((d) => d.value || 0))
  const top = 18
  const bottom = 22
  const plotH = height - top - bottom
  const x = (i) => (n === 1 ? VW / 2 : (i / (n - 1)) * VW)
  const y = (v) => top + plotH - ((v || 0) / max) * plotH
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const base = top + plotH
  const labelEvery = Math.ceil(n / 6)

  return (
    <svg viewBox={`0 0 ${VW} ${height}`} className="chart" role="img">
      <line x1="0" y1={base} x2={VW} y2={base} className="chart-axis" />
      {n > 1 && (
        <polygon points={`0,${base} ${pts} ${VW},${base}`} fill={color} opacity="0.12" />
      )}
      {n > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" />}
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="2.5" fill={color} />
      ))}
      {/* value labels (sparse, non-zero) so the line reads as numbers too */}
      {data.map((d, i) =>
        i % labelEvery === 0 && d.value > 0 ? (
          <text key={`v${i}`} x={x(i)} y={y(d.value) - 7} className="chart-vlabel" textAnchor="middle">
            {fmtNum(d.value)}
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

// Horizontal bars (HTML) — good for labelled categories like the grade pyramid.
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
