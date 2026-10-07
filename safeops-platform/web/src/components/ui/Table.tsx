import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
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
  /**
   * Makes the column sortable: clicking its header sorts by this value, clicking again
   * reverses it. Empty values (null, undefined, '') always sort last, in either direction.
   */
  sortValue?: (row: T) => string | number | Date | null | undefined
  /**
   * The cell that carries the row's link when the table has `rowHref`. Defaults to the
   * first column.
   */
  link?: boolean
}

export type SortDirection = 'asc' | 'desc'
export interface SortState { key: string; direction: SortDirection }

/** Compares two sort values; empties are handled by the caller. */
function compare(a: string | number | Date, b: string | number | Date): number {
  if (a instanceof Date || b instanceof Date) return +a - +b
  if (typeof a === 'number' && typeof b === 'number') return a - b
  // `numeric` so "INC-9" sorts before "INC-10", as people read them.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === ''

/**
 * Rows in the order the sort asks for. Stable - rows that compare equal keep the order the
 * server sent them in - so re-sorting never shuffles ties.
 */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState | null): T[] {
  const column = sort && columns.find((c) => c.key === sort.key)
  if (!sort || !column?.sortValue) return rows
  const value = column.sortValue
  const sign = sort.direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((x, y) => {
      if (isEmpty(x.v) || isEmpty(y.v)) {
        if (isEmpty(x.v) && isEmpty(y.v)) return x.index - y.index
        return isEmpty(x.v) ? 1 : -1
      }
      return sign * compare(x.v as string | number | Date, y.v as string | number | Date) || x.index - y.index
    })
    .map((x) => x.row)
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Shown in place of the rows when there are none. */
  empty?: ReactNode
  onRowClick?: (row: T) => void
  /**
   * Where a row leads. Prefer this over `onRowClick` for anything that opens a page.
   *
   * The row then works like every link people use elsewhere: its main cell is a real link,
   * so hovering shows the address, Ctrl/Cmd-click and middle-click open it in a new tab, and
   * right-click offers "Open in new tab" and "Copy link". A click anywhere else on the row
   * follows the link too, as it does in Gmail and Jira. With `onRowClick` alone, none of
   * that works - the row is a click handler, not a destination.
   */
  rowHref?: (row: T) => string
  /** The column and direction to sort by at first. The person can change it. */
  defaultSort?: SortState
  /** Controlled sort, e.g. kept in the URL. Pair with `onSortChange`. */
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
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
  columns, rows, rowKey, empty, onRowClick, rowHref, rowLabel, loading = false, loadingRows = 5,
  error, onRetry, caption, captionVisible = false, stickyHeader = false, className,
  defaultSort, sort: controlledSort, onSortChange,
}: DataTableProps<T>) {
  const failed = error !== undefined && error !== null && error !== false
  const interactive = Boolean(onRowClick || rowHref)
  // Rows can carry the keyboard only when there are rows. Empty or loading, an interactive
  // table still scrolls sideways on a phone - its header is wider than 320px - and with
  // nothing inside to focus, a keyboard user could not scroll it.
  const rowsFocusable = interactive && !loading && rows.length > 0

  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort ?? null)
  const sort = controlledSort !== undefined ? controlledSort : ownSort
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])
  const changeSort = (key: string) => {
    // A new column starts ascending; the same column again reverses - spreadsheet behaviour.
    const next: SortState = sort?.key === key
      ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }
    if (controlledSort === undefined) setOwnSort(next)
    onSortChange?.(next)
  }

  const linkColumn = columns.find((c) => c.link)?.key ?? columns[0]?.key

  /*
   * A click on the row, away from its link, behaves like a click on the link. Modifier and
   * middle clicks open a new tab, as they would on the link itself. Clicks on the link, or
   * on any other control in the row, are left to that control.
   */
  const onRowLinkClick = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    const target = e.target as HTMLElement
    if (target.closest('a, button, input, select, textarea, label, [role="menuitem"]')) return
    // Selecting text in a row is not a click on it.
    if (window.getSelection?.()?.toString()) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
      window.open(href, '_blank', 'noopener')
      return
    }
    e.currentTarget.querySelector<HTMLAnchorElement>('a[data-row-link]')?.click()
  }

  // One full-width row for every state that is not data, so the header stays in place and
  // the table does not jump when the data arrives.
  const stateRow = (content: ReactNode) => (
    <tr>
      <td colSpan={columns.length} className="px-5 py-10 text-center">{content}</td>
    </tr>
  )

  return (
    <div
      className={cn('relative overflow-x-auto', className)}
      // A table wider than a phone scrolls sideways inside this box. Given a caption, the box
      // becomes a named, focusable region so a keyboard user can scroll it (WCAG 2.1.1) -
      // but not while the rows are focusable themselves, or there would be two stops for one
      // table. Opt-in rather than always, so tables that never overflow add no tab stop.
      tabIndex={!rowsFocusable && caption ? 0 : undefined}
      role={!rowsFocusable && caption ? 'region' : undefined}
      aria-label={!rowsFocusable && caption ? caption : undefined}
    >
      <table className="w-full text-left" aria-busy={loading || undefined}>
        {caption && (
          <caption className={cn(captionVisible ? 'px-5 pb-2 text-left text-xs text-muted' : 'sr-only')}>
            {caption}
          </caption>
        )}
        <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-surface')}>
          <tr className="border-b text-2xs uppercase tracking-wide text-muted">
            {columns.map((c) => {
              const active = sort?.key === c.key ? sort.direction : null
              const SortIcon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ChevronsUpDown
              return (
                <th
                  key={c.key}
                  // Names the column this header governs, so a screen reader can say
                  // "Severity, Lost time injury" when reading a cell rather than reading a
                  // bare value out of a grid with no context. WCAG 1.3.1.
                  scope="col"
                  aria-sort={c.sortValue ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined}
                  className={cn('px-4 py-2.5 font-semibold first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.sortValue ? (
                    // The header is the control, as in every spreadsheet and table people
                    // know: click to sort, again to reverse, with an arrow saying which way.
                    <button
                      type="button"
                      onClick={() => changeSort(c.key)}
                      className={cn(
                        // At least 24px tall for a mouse and 44px on touch (Fitts's law): sized
                        // to its text alone, a header was a 17px strip to tap on a phone.
                        'inline-flex min-h-6 items-center gap-1 rounded uppercase tracking-wide hover:text-ink coarse:min-h-11',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]',
                        c.align === 'right' && 'flex-row-reverse',
                        active && 'text-ink',
                      )}
                    >
                      {c.header}
                      <SortIcon size={11} aria-hidden className={cn(!active && 'opacity-50')} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
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
            sorted.map((row) => {
              const href = rowHref?.(row)
              return (
              <tr
                key={rowKey(row)}
                onClick={href ? (e) => onRowLinkClick(e, href) : onRowClick ? () => onRowClick(row) : undefined}
                onAuxClick={href ? (e) => { if (e.button === 1) onRowLinkClick(e, href) } : undefined}
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
                  onRowClick && !href
                    ? (e) => {
                        if (e.target !== e.currentTarget) return // a button inside the row
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                // With a link the link is the tab stop, so the row itself is not one.
                tabIndex={onRowClick && !href ? 0 : undefined}
                aria-label={onRowClick && !href && rowLabel ? rowLabel(row) : undefined}
                className={cn(
                  'border-b last:border-0',
                  (onRowClick || href) && 'cursor-pointer hover:bg-accent-soft/40',
                  onRowClick && !href &&
                    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]',
                  // The whole row lights up while its link has focus.
                  href && 'focus-within:bg-accent-soft/40',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 text-sm text-ink-2 first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}>
                    {href && c.key === linkColumn ? (
                      <Link
                        to={href}
                        data-row-link
                        aria-label={rowLabel?.(row)}
                        className="block rounded text-inherit no-underline outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {c.render(row)}
                      </Link>
                    ) : (
                      c.render(row)
                    )}
                  </td>
                ))}
              </tr>
              )
            })
          )}
        </tbody>
      </table>
      {loading && <span role="status" className="sr-only">Loading…</span>}
    </div>
  )
}
