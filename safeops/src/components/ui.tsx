import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, AlertTriangle, AlertOctagon, Minus } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-surface shadow-card ${className}`}>{children}</div>
  )
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-1">
      <div>
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/** Delta chip: green when the movement is good, critical-red when bad. */
export function Delta({ value, goodWhen = 'up', suffix = '' }: { value: number; goodWhen?: 'up' | 'down'; suffix?: string }) {
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted">
        <Minus size={12} /> 0{suffix}
      </span>
    )
  const isGood = goodWhen === 'up' ? value > 0 : value < 0
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-semibold"
      style={{ color: isGood ? 'var(--delta-good)' : 'var(--critical)' }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {Math.abs(value)}
      {suffix}
    </span>
  )
}

/** KPI stat tile with optional sparkline. */
export function StatTile({
  label,
  value,
  unit,
  delta,
  goodWhen,
  spark,
  footnote,
}: {
  label: string
  value: string | number
  unit?: string
  delta?: number
  goodWhen?: 'up' | 'down'
  spark?: number[]
  footnote?: string
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {delta !== undefined && <Delta value={delta} goodWhen={goodWhen} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-xs text-muted">{unit}</span>}
        </div>
        {spark && <Sparkline data={spark} />}
      </div>
      {footnote && <p className="mt-2 text-[11px] text-muted">{footnote}</p>}
    </Card>
  )
}

export function Sparkline({ data, width = 88, height = 28 }: { data: number[]; width?: number; height?: number }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`)
    .join(' ')
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Ring gauge for the headline scores. */
export function ScoreRing({
  value,
  size = 132,
  label,
  sublabel,
}: {
  value: number
  size?: number
  label: string
  sublabel?: string
}) {
  const stroke = 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = value >= 85 ? 'var(--good)' : value >= 70 ? 'var(--warning)' : 'var(--critical)'
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-ink">{value}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted">/ 100</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink">{label}</p>
      {sublabel && <p className="text-[11px] text-muted">{sublabel}</p>}
    </div>
  )
}

// ─── Status pills — icon + label, never color alone ──────────────────────────

const STATUS_META: Record<string, { fg: string; icon: typeof CheckCircle2 }> = {
  good: { fg: 'var(--good)', icon: CheckCircle2 },
  warning: { fg: 'var(--warning)', icon: AlertTriangle },
  serious: { fg: 'var(--serious)', icon: AlertTriangle },
  critical: { fg: 'var(--critical)', icon: AlertOctagon },
}

export function StatusPill({ kind, label }: { kind: keyof typeof STATUS_META; label: string }) {
  const meta = STATUS_META[kind]
  const Icon = meta.icon
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-ink"
      style={{ borderColor: meta.fg }}
    >
      <Icon size={12} style={{ color: meta.fg }} />
      {label}
    </span>
  )
}

export const severityKind = (s: string): keyof typeof STATUS_META =>
  s === 'Critical' ? 'critical' : s === 'Serious' ? 'serious' : s === 'Moderate' ? 'warning' : 'good'

export const actionStatusKind = (s: string): keyof typeof STATUS_META =>
  s === 'Overdue' ? 'critical' : s === 'At Risk' ? 'serious' : s === 'Awaiting Verification' ? 'warning' : 'good'

export function ProgressBar({ value, tone = 'var(--s1)' }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-grid">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p>
      </div>
      {right}
    </div>
  )
}

/** Legend row: colored chip + label in ink (text never wears the series color). */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
