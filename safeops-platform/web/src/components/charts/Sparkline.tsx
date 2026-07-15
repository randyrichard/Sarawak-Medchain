// Chart primitives owned by the design system. The full charting layer
// (Recharts + themed wrappers) arrives with the Analytics sprint; these
// primitives cover shell-level needs and define the visual contract:
// 2px lines, series tokens, no color-alone meaning, text in ink tokens.

export function Sparkline({
  data, width = 96, height = 28, stroke = 'var(--s1)',
}: {
  data: number[]
  width?: number
  height?: number
  stroke?: string
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`)
    .join(' ')
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={width}
        cy={height - 2 - ((data[data.length - 1] - min) / range) * (height - 4)}
        r={2.5}
        fill={stroke}
      />
    </svg>
  )
}

export function MiniBars({
  data, width = 96, height = 28, fill = 'var(--s1)',
}: {
  data: number[]
  width?: number
  height?: number
  fill?: string
}) {
  const max = Math.max(...data, 1)
  const barW = width / data.length - 2
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 2))
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={height - h}
            width={barW}
            height={h}
            rx={1.5}
            fill={fill}
            opacity={i === data.length - 1 ? 1 : 0.55}
          />
        )
      })}
    </svg>
  )
}

/** Ring gauge for headline scores; color follows status bands. */
export function ScoreRing({
  value, size = 120, label, sublabel,
}: {
  value: number | null
  size?: number
  label: string
  sublabel?: string
}) {
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = value === null ? 'var(--grid)' : value >= 85 ? 'var(--good)' : value >= 70 ? 'var(--warning)' : 'var(--critical)'
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
          {value !== null && (
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-ink">{value ?? '—'}</span>
          <span className="text-2xs uppercase tracking-wider text-muted">/ 100</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink">{label}</p>
      {sublabel && <p className="text-2xs text-muted">{sublabel}</p>}
    </div>
  )
}
