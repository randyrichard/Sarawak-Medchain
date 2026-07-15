import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical'

const toneCls: Record<Tone, string> = {
  neutral: 'border-line text-ink-2',
  accent: 'border-[var(--accent)] text-ink',
  good: 'border-[var(--good)] text-ink',
  warning: 'border-[var(--warning)] text-ink',
  serious: 'border-[var(--serious)] text-ink',
  critical: 'border-[var(--critical)] text-ink',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold', toneCls[tone], className)}>
      {children}
    </span>
  )
}

// Status pill: icon + label — state is never conveyed by color alone.
const STATUS_META = {
  good: { color: 'var(--good)', icon: CheckCircle2 },
  warning: { color: 'var(--warning)', icon: AlertTriangle },
  serious: { color: 'var(--serious)', icon: AlertTriangle },
  critical: { color: 'var(--critical)', icon: AlertOctagon },
  info: { color: 'var(--accent)', icon: Info },
} as const

export type StatusKind = keyof typeof STATUS_META

export function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const meta = STATUS_META[kind]
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold text-ink" style={{ borderColor: meta.color }}>
      <Icon size={12} style={{ color: meta.color }} />
      {label}
    </span>
  )
}
