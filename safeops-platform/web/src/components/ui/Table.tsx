import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ErrorState } from './AsyncContent'
import { Skeleton } from './Skeleton'

// Declarative data table. Column defs keep pages free of <tr> plumbing and
// enforce one visual standard for all tabular data.

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
  width?: string
  /** Tailwind responsive visibility, e.g. "hidden md:table-cell" */
  visibility?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Shown in place of the rows when there are none. */
  empty?: ReactNode
  onRowClick?: (row: T) => void
  /**
   * What activating a row does, for assistive technology: `(i) => \`Open ${i.ref}\``.
   * Only used with `onRowClick`. Without it a focused row is announced by its content alone.
   */
  rowLabel?: (row: T) => string
  /** Placeholder rows instead of data, with the header still in place. */
  loading?: boolean
  /** How many placeholder rows to draw while loading. */
  loadingRows?: number
  /** A failure to load. Replaces the rows with a message and, given `onRetry`, a retry button. */
  error?: unknown
  onRetry?: () => void
  /**
   * Names the table for assistive technology. Visually hidden unless `captionVisible`,
   * because most tables already sit under a card title that says the same thing.
   */
  caption?: string
  captionVisible?: boolean
  /** Keep the header row in view while the table scrolls inside a height-limited parent. */
  stickyHeader?: boolean
  className?: string
}

export function DataTable<T>({
  columns, rows, rowKey, empty, onRowClick, rowLabel, loading = false, loadingRows = 5,
  error, onRetry, caption, captionVisible = false, stickyHeader = false, className,
}: DataTableProps<T>) {
  const failed = error !== undefined && error !== null && error !== false

  // One full-width row for every state that is not data, so the header stays in place and
  // the table does not jump when the data arrives.
  const stateRow = (content: ReactNode) => (
    <tr>
      <td colSpan={columns.length} className="px-5 py-10 text-center">{content}</td>
    </tr>
  )

  return (
    <div
      className={cn('overflow-x-auto', className)}
      // A table wider than a phone scrolls sideways inside this box. Given a caption, the box
      // becomes a named, focusable region so a keyboard user can scroll it (WCAG 2.1.1) -
      // but not when the rows are focusable themselves, or there would be two stops for one
      // table. Opt-in rather than always, so tables that never overflow add no tab stop.
      tabIndex={!onRowClick && caption ? 0 : undefined}
      role={!onRowClick && caption ? 'region' : undefined}
      aria-label={!onRowClick && caption ? caption : undefined}
    >
      <table className="w-full text-left" aria-busy={loading || undefined}>
        {caption && (
          <caption className={cn(captionVisible ? 'px-5 pb-2 text-left text-xs text-muted' : 'sr-only')}>
            {caption}
          </caption>
        )}
        <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-surface')}>
          <tr className="border-b text-2xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                // Names the column this header governs, so a screen reader can say
                // "Severity, Lost time injury" when reading a cell rather than reading a
                // bare value out of a grid with no context. WCAG 1.3.1.
                scope="col"
                className={cn('px-4 py-2.5 font-semibold first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={`loading-${i}`} className="border-b last:border-0" aria-hidden>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3.5 first:pl-5 last:pr-5', c.visibility)}>
                    <Skeleton className={cn('h-3', i % 2 ? 'w-3/5' : 'w-4/5', c.align === 'right' && 'ml-auto')} />
                  </td>
                ))}
              </tr>
            ))
          ) : failed ? (
            stateRow(<ErrorState compact error={error} onRetry={onRetry} />)
          ) : rows.length === 0 ? (
            stateRow(empty ?? <span className="text-sm text-muted">No records.</span>)
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                /*
                 * Keyboard operability for clickable rows (WCAG 2.1.1 / 2.4.7): focusable,
                 * Enter/Space activates, with a visible focus ring.
                 *
                 * This used to also set `role="button"`, which replaced the row's own role.
                 * A row that is a button is no longer a row, so a screen reader lost the
                 * table's structure for every clickable table in the product - no "row 3
                 * of 12", no column headers read with the cells. The row keeps its role and
                 * is still focusable and operable; `rowLabel` says what it opens.
                 */
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target !== e.currentTarget) return // a button inside the row
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                className={cn(
                  'border-b last:border-0',
                  onRowClick &&
                    'cursor-pointer hover:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 text-sm text-ink-2 first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {loading && <span role="status" className="sr-only">Loading…</span>}
    </div>
  )
}
