import type { ReactNode } from 'react'

/**
 * One fact about a record in a drawer: its name, then its value, both starting on the left.
 *
 * Three drawers had their own copy, with the name on the left and the value pushed to the
 * right edge. On a phone every value then began somewhere different, and a long one wrapped
 * against the right margin. Here the names share a column and every value starts at the
 * same place, as in a settings page.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b py-2 last:border-0">
      <span className="w-32 shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm text-ink">{value || '—'}</span>
    </div>
  )
}
