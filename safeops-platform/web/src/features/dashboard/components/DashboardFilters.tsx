import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import type { DashboardFilterState } from '../useDashboard'
import { localISODate } from '@/lib/localDate'

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
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
]

const ymd = (d: Date) => localISODate(d)

/**
 * What is wrong with a chosen range, in words, or null when it can be applied.
 *
 * Dates are `YYYY-MM-DD`, so they compare as text. Either end may be left empty: an open
 * start counts everything up to the end date, and an open end everything since the start.
 */
export function rangeProblem(from: string, to: string, today: string): string | null {
  if (from && to && from > to) return 'The start date is after the end date.'
  if (from > today) return 'The start date is later than today.'
  if (to > today) return 'The end date is later than today.'
  return null
}

export function DashboardFilters({
  filters, shown, departments, onChange, onClear, filtered,
}: {
  filters: DashboardFilterState
  /**
   * The window the figures on screen cover, as the server reports it (two instants).
   * With no dates chosen it is still a window - the last 30 days - and the fields and
   * presets show it, rather than blank dates beside figures that cover a month.
   */
  shown?: { from: string; to: string } | null
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

  // The dates in force: the ones chosen, else the ones the figures were worked out for.
  const applied = {
    from: filters.from ?? (shown ? ymd(new Date(shown.from)) : ''),
    to: filters.to ?? (shown ? ymd(new Date(shown.to)) : ''),
  }

  /** Which preset, if any, the window in force matches. */
  const activeRange = RANGES.find((r) => {
    if (!applied.from || !applied.to || r.days === null) return false
    const span = Math.round(
      (new Date(applied.to).getTime() - new Date(applied.from).getTime()) / 86_400_000,
    )
    return span === r.days
  })

  /*
   * The two dates are a draft until Apply.
   *
   * Each used to apply the moment it changed. A range is two choices, so the page reloaded
   * halfway through - after "From", for a window nobody asked for - and on a phone the date
   * wheel fires a change on every turn. Nothing confirmed the choice either: there was no
   * Apply to press. A preset still applies in one tap; it is one choice.
   */
  const [draft, setDraft] = useState(applied)
  const [problem, setProblem] = useState<string | null>(null)
  // A preset, Clear, a shared link or the figures arriving set the range: the draft follows.
  useEffect(() => {
    setDraft({ from: applied.from, to: applied.to })
    setProblem(null)
  }, [applied.from, applied.to])

  const today = ymd(new Date())
  const pending = draft.from !== applied.from || draft.to !== applied.to
  const edit = (patch: Partial<typeof draft>) => { setDraft((d) => ({ ...d, ...patch })); setProblem(null) }

  const apply = (e: FormEvent) => {
    e.preventDefault()
    const wrong = rangeProblem(draft.from, draft.to, today)
    setProblem(wrong)
    // Nothing changed is nothing to apply: it would only pin the rolling 30 days to dates.
    if (!wrong && pending) onChange({ from: draft.from || null, to: draft.to || null })
  }

  // Beside its field at a desk; above it on a phone, where the fields share the width.
  const labelCls = 'flex flex-col gap-1 text-2xs text-muted sm:flex-row sm:items-center'
  const fieldCls = 'w-full rounded-lg border border-line bg-transparent px-2 py-1 text-2xs text-ink coarse:min-h-touch coarse:px-3 sm:w-auto'

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
            // `coarse:` gives a finger something to hit; the desk size is unchanged.
            className={`rounded-full border px-2.5 py-1 text-2xs font-semibold transition coarse:min-h-touch-sm coarse:px-3 ${
              activeRange?.label === r.label
                ? 'border-[var(--accent)] bg-accent-soft text-ink'
                : 'border-line text-muted hover:text-ink'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={apply}
        aria-label="Dates to show"
        noValidate
        className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
      >
        <label className={labelCls}>
          From
          <input
            type="date"
            value={draft.from}
            max={draft.to || today}
            onChange={(e) => edit({ from: e.target.value })}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'dash-dates-problem' : undefined}
            className={fieldCls}
          />
        </label>
        <label className={labelCls}>
          To
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            max={today}
            onChange={(e) => edit({ to: e.target.value })}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'dash-dates-problem' : undefined}
            className={fieldCls}
          />
        </label>
        <div className="col-span-2 flex items-center gap-2">
          {/* Solid while there are dates to apply, so the next step stands out. */}
          <Button type="submit" size="sm" variant={pending ? 'primary' : 'secondary'}>
            Apply
          </Button>
          {pending && !problem && <span className="text-2xs text-muted">Not applied yet</span>}
        </div>
        {problem && (
          <p id="dash-dates-problem" role="alert" className="col-span-2 text-2xs font-medium text-critical sm:basis-full">
            {problem}
          </p>
        )}
      </form>

      {/* Offered only when the workspace actually records departments. */}
      {departments.length > 0 && (
        <label className="flex items-center gap-1 text-2xs text-muted">
          Department
          <select
            value={filters.department ?? ''}
            onChange={(e) => onChange({ department: e.target.value || null })}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-2xs text-ink coarse:min-h-touch coarse:px-3"
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
