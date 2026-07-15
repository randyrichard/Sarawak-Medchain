import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'success' | 'warning' | 'critical'

const META: Record<Tone, { icon: typeof Info; color: string; soft: string }> = {
  info: { icon: Info, color: 'var(--accent)', soft: 'var(--accent-soft)' },
  success: { icon: CheckCircle2, color: 'var(--good)', soft: 'var(--good-soft)' },
  warning: { icon: AlertTriangle, color: 'var(--warning)', soft: 'var(--warning-soft)' },
  critical: { icon: AlertOctagon, color: 'var(--critical)', soft: 'var(--critical-soft)' },
}

export function Alert({
  tone = 'info', title, children, onDismiss, className,
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const meta = META[tone]
  const Icon = meta.icon
  return (
    <div
      role={tone === 'critical' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', className)}
      style={{ borderColor: meta.color, background: meta.soft }}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
      <div className="min-w-0 flex-1 text-sm text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('text-ink-2', title && 'mt-0.5 text-xs')}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 text-muted hover:text-ink">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
