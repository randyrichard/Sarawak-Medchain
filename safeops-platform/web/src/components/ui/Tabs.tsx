import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  badge?: ReactNode
}

export function Tabs<T extends string>({
  items, value, onChange, className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    /*
     * `min-w-0 overflow-x-auto` so a tab row that does not fit scrolls instead of
     * overflowing.
     *
     * This was a bare flex row, so on a 375px phone the later tabs simply rendered past the
     * edge of a container that clipped them: "Analytics" on the equipment page sat at x=420
     * in a 333px row with no way to reach it. Not a cosmetic overflow - a tab you cannot
     * scroll to is a part of the product a phone user cannot open at all.
     *
     * `min-w-0` is again the half that matters. The parent rows are flex containers, and a
     * flex item refuses to shrink below its content without it, so `overflow-x-auto` alone
     * would have had nothing to scroll within.
     */
    <div
      role="tablist"
      className={cn('flex min-w-0 items-center gap-1 overflow-x-auto border-b', className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors coarse:min-h-11 coarse:px-4',
              active
                ? 'border-[var(--accent)] text-ink'
                : 'border-transparent text-muted hover:text-ink-2',
            )}
          >
            {item.label}
            {item.badge}
          </button>
        )
      })}
    </div>
  )
}
