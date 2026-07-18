import { cn } from '@/lib/cn'

/** Progress bar with the 0/25/50/75/100 steps ticked. */
export function ProgressLine({ value, overdue, className }: { value: number; overdue?: boolean; className?: string }) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-grid">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${value}%`, background: overdue ? 'var(--critical)' : value === 100 ? 'var(--good)' : 'var(--s1)' }}
        />
        {[25, 50, 75].map((tick) => (
          <span key={tick} className="absolute top-0 h-full w-px bg-surface" style={{ left: `${tick}%` }} />
        ))}
      </div>
    </div>
  )
}
