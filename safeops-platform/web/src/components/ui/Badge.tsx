import type { ReactNode } from 'react'
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

/*
 * Status pill: the state in words, edged in its colour.
 *
 * It carried an icon as well - a tick, a triangle, an octagon - so the state was never told
 * by colour alone (WCAG 1.4.1). The label already does that: "Critical", "Expired", "Verified"
 * read the same to everyone. The icon repeated the word on every row of every register, and
 * a page of tables became a page of symbols. The colour stays, as a second cue for those who
 * see it; the word is the one that has to be there.
 */
const STATUS_COLOR = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
  info: 'var(--accent)',
} as const

export type StatusKind = keyof typeof STATUS_COLOR

export function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold text-ink" style={{ borderColor: STATUS_COLOR[kind] }}>
      {label}
    </span>
  )
}
