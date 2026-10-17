import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Empty states teach: what this will show, and how to get there.
 *
 * Left-aligned, as every other block of words here is: a centred one read as a different
 * kind of page, and the eye had to find where each line began. And on the same edge as the
 * words around it - the card's title, the table's first column, the page title - not
 * indented from them.
 */
export function EmptyState({
  icon: Icon, title, children, action, className, titleAs: Title = 'p', flush = false,
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
  /**
   * In something that already insets its content - a CardBody, a dialog, the page itself.
   * Otherwise the state brings the inset a card gives its header and body, for a bare card
   * or a table row.
   */
  flush?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-start py-10', !flush && 'px-5', className)}>
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
