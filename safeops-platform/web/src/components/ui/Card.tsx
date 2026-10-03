import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cn('rounded-xl border bg-surface shadow-card', className)} style={style}>{children}</div>
}

export function CardHeader({
  title,
  subtitle,
  right,
  as: Heading = 'h2',
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  /**
   * The heading level, for the document outline - the look does not change.
   *
   * A card sits directly under the page's `h1`, so its title is an `h2`. This was a fixed
   * `h3`, which skipped a level on every page: screen-reader users navigating by heading
   * heard the outline jump from the page title to a third-level heading with nothing
   * between. Pass `h3` for a card nested inside a section that has its own `h2`.
   */
  as?: 'h2' | 'h3' | 'h4'
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
      <div className="min-w-0">
        <Heading className="text-sm font-semibold tracking-tight text-ink">{title}</Heading>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 pb-4 pt-2', className)}>{children}</div>
}
