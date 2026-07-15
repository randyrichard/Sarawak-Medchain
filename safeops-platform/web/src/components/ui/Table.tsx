import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

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

export function DataTable<T>({
  columns, rows, rowKey, empty, onRowClick, className,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: ReactNode
  onRowClick?: (row: T) => void
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b text-2xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn('px-4 py-2.5 font-semibold first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b last:border-0', onRowClick && 'cursor-pointer hover:bg-accent-soft/40')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 text-sm text-ink-2 first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.visibility)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-10 text-center">
                {empty ?? <span className="text-sm text-muted">No records.</span>}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
