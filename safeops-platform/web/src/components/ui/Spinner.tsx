import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A spinning indicator. The icon is hidden from assistive technology and the label is read
 * instead - an `aria-label` on a bare SVG is ignored by several screen readers, because an
 * SVG with no role is not something they name.
 */
export function Spinner({ size = 16, className, label = 'Loading' }: { size?: number; className?: string; label?: string }) {
  return (
    <>
      <Loader2 size={size} className={cn('animate-spin text-muted', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  )
}

/** A whole-page wait. Announced once, politely, as a status. */
export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner size={22} label={label ?? 'Loading'} />
      {label && <p aria-hidden className="text-xs text-muted">{label}</p>}
    </div>
  )
}
