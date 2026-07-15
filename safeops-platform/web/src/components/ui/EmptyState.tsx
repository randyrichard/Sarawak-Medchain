import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Empty states teach: what this will show, and how to get there. */
export function EmptyState({
  icon: Icon, title, children, action, className,
}: {
  icon?: ComponentType<{ size?: number | string; className?: string }>
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
          <Icon size={19} className="text-accent" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
