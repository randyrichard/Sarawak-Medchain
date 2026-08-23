import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import type { DashboardFilterState } from '../useDashboard'

/**
 * The global filters.
 *
 * Only what the data can actually answer: a window on when things happened, and a
 * department. Site is deliberately absent - the org switcher in the header already owns
 * scope, and a second site control on this page would let the two disagree.
 *
 * Every value is held in the URL, so a refresh keeps the view and the link can be sent.
 */
const RANGES: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function DashboardFilters({
  filters, departments, onChange, onClear, filtered,
}: {
  filters: DashboardFilterState
  /** Department names actually present in this workspace. Never a hardcoded list. */
  departments: string[]
  onChange: (patch: Partial<DashboardFilterState>) => void
  onClear: () => void
  filtered: boolean
}) {
  const applyRange = (days: number) => {
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    onChange({ from: ymd(from), to: ymd(to) })
  }

  /** Which preset, if any, the current window matches. */
  const activeRange = RANGES.find((r) => {
    if (!filters.from || !filters.to || r.days === null) return false
    const span = Math.round(
      (new Date(filters.to).getTime() - new Date(filters.from).getTime()) / 86_400_000,
    )
    return span === r.days
  })

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-2xs font-semibold text-muted">Period</span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => applyRange(r.days!)}
            aria-pressed={activeRange?.label === r.label}
            className={`rounded-full border px-2.5 py-1 text-2xs font-semibold transition ${
              activeRange?.label === r.label
                ? 'border-[var(--accent)] bg-accent-soft text-ink'
                : 'border-line text-muted hover:text-ink'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1 text-2xs text-muted">
        From
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => onChange({ from: e.target.value || null })}
          className="rounded-lg border border-line bg-transparent px-2 py-1 text-2xs text-ink"
        />
      </label>
      <label className="flex items-center gap-1 text-2xs text-muted">
        To
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => onChange({ to: e.target.value || null })}
          className="rounded-lg border border-line bg-transparent px-2 py-1 text-2xs text-ink"
        />
      </label>

      {/* Offered only when the workspace actually records departments. */}
      {departments.length > 0 && (
        <label className="flex items-center gap-1 text-2xs text-muted">
          Department
          <select
            value={filters.department ?? ''}
            onChange={(e) => onChange({ department: e.target.value || null })}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-2xs text-ink"
          >
            <option value="">All</option>
            {departments.map((dep) => <option key={dep} value={dep}>{dep}</option>)}
          </select>
        </label>
      )}

      {filtered && (
        <Button size="sm" variant="secondary" icon={<X size={12} />} onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  )
}
