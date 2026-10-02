import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Empty states teach: what this will show, and how to get there. */
export function EmptyState({
  icon: Icon, title, children, action, className, titleAs: Title = 'p',
}: {
  icon?: ComponentType<{ size?: number | string; className?: string }>
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  /**
   * The title's element. A paragraph inside a card or a table; `h1` when the empty state
   * *is* the page - a 403 or a 404 - so the page still has a title in the outline.
   */
  titleAs?: 'p' | 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
          <Icon size={19} className="text-accent" aria-hidden />
        </div>
      )}
      <Title className="text-sm font-semibold text-ink">{title}</Title>
      {children && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
