import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, ShieldAlert } from 'lucide-react'
import { api } from '@/api/client'
import type { Incident, IncidentSeverity, IncidentStatusFilter, IncidentType } from '@/api/incidents'
import { INCIDENT_STAGES, STAGE_LABEL, SEVERITY_LABEL, TYPE_LABEL } from '@/api/incidents'
import { OVERDUE_AFTER_DAYS } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, AttentionIcon, Badge, Card, DataTable, EmptyState, LinkButton, PageHeader, Skeleton, StatusPill,
  type Column, type SortState,
} from '@/components/ui'
import { daysOpen, INCIDENT_TYPE_GROUPS, severityKind, severityWeight, STAGE_COLOR } from './lib'
import { cn } from '@/lib/cn'
import { useUrlState } from '@/lib/useUrlState'

/*
 * Status filters, split by how often they are wanted - Hick's law.
 *
 * All eight sat in one row of equal chips, so every visit to the register started with an
 * eight-way choice to make before reading a single incident. Most visits want one of four:
 * what is open (the default, so usually no choice at all), what is dangerous, what is
 * late, or everything. Those stay one tap away. The workflow states - who is investigating,
 * what awaits review, what is closed or archived - are wanted by fewer people less often,
 * so they sit one step further, in a "More" list, rather than taxing every visit.
 */
export const STATUS_CHIPS: { value: IncidentStatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'high_risk', label: 'High Risk' },
  { value: 'overdue', label: `Overdue (> ${OVERDUE_AFTER_DAYS}d)` },
  { value: 'all', label: 'All' },
]
export const MORE_STATUSES: { value: IncidentStatusFilter; label: string }[] = [
  { value: 'investigating', label: 'Investigation Ongoing' },
  { value: 'awaiting_review', label: 'Awaiting Review' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

export function IncidentsListPage() {
  const { company, site, sites } = useOrg()
  const [params, setParams] = useSearchParams()

  const status = (params.get('status') as IncidentStatusFilter) || 'open'
  /*
   * Every filter lives in the URL, so a filtered register can be refreshed, bookmarked and
   * sent to a colleague - "here are the open serious ones at Bintulu" as a link, the way a
   * filtered search works on any site. These were read from the URL once and then held in
   * memory, so the address bar stopped matching the screen after the first change, and
   * refresh or Back quietly reset them. `replace`, so filtering does not fill Back with
   * every keystroke.
   */
  const [q, setQParam] = useUrlState<string>('q', '')
  const [type, setTypeParam] = useUrlState<IncidentType | ''>('type', '')
  const [severity, setSeverityParam] = useUrlState<IncidentSeverity | ''>('severity', '')
  const setQ = (v: string) => setQParam(v, { replace: true })
  const setType = (v: IncidentType | '') => setTypeParam(v, { replace: true })
  const setSeverity = (v: IncidentSeverity | '') => setSeverityParam(v, { replace: true })
  const [sortParam, setSortParam] = useUrlState<string>('sort', '')
  const sort = parseSort(sortParam)

  const [rows, setRows] = useState<Incident[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    setRows(null)
    setError(null)
    const t = setTimeout(() => {
      api
        .listIncidents(company.id, { q, siteId: site?.id, type, severity, status })
        .then((list) => !cancelled && setRows(list))
        // Without this a rejected request left rows null forever and the register read as
        // an empty result — a broken filter and a genuinely empty one looked identical.
        .catch(() => {
          if (cancelled) return
          setRows([])
          setError('Could not load incidents. Check your connection and try again.')
        })
    }, q ? 250 : 0) // debounce typing
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [company, site, q, type, severity, status])

  const setStatus = (s: IncidentStatusFilter) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('status', s)
      return next
    }, { replace: true })
  }

  const openCount = useMemo(() => rows?.filter((r) => r.stage !== 'closed').length ?? 0, [rows])

  const columns: Column<Incident>[] = [
    {
      key: 'incident',
      header: 'Incident',
      sortValue: (i) => i.number,
      render: (i) => {
        return (
          <div className="flex items-start gap-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
              <p className="mt-0.5 text-2xs text-muted">
                <span className="font-mono">{i.number}</span> · {TYPE_LABEL[i.type]}
                {i.highRisk && i.stage !== 'closed' && (
                  <Badge tone="critical" className="ml-1.5">High Risk</Badge>
                )}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'severity',
      header: 'Severity',
      sortValue: (i) => severityWeight(i.severity),
      render: (i) => <StatusPill kind={severityKind(i.severity)} label={SEVERITY_LABEL[i.severity] ?? i.severity} />,
    },
    {
      key: 'stage',
      header: 'Stage',
      sortValue: (i) => (i.stage === 'draft' ? -1 : INCIDENT_STAGES.indexOf(i.stage)),
      visibility: 'hidden lg:table-cell',
      render: (i) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[i.stage] }} />
          {STAGE_LABEL[i.stage]}
        </span>
      ),
    },
    {
      key: 'site',
      header: 'Site / Dept',
      visibility: 'hidden md:table-cell',
      render: (i) => (
        <span className="text-xs text-ink-2">
          {sites.find((s) => s.id === i.siteId)?.short ?? i.siteId}
          <span className="text-muted"> · {i.department}</span>
        </span>
      ),
    },
    {
      key: 'investigator',
      header: 'Investigator',
      visibility: 'hidden xl:table-cell',
      render: (i) => <span className="text-xs text-ink-2">{i.investigator ?? <span className="text-muted">unassigned</span>}</span>,
    },
    {
      key: 'age',
      header: 'Days Open',
      sortValue: (i) => (i.stage === 'closed' ? null : daysOpen(i)),
      align: 'right',
      render: (i) => {
        const d = daysOpen(i)
        const overdue = i.stage !== 'closed' && d > OVERDUE_AFTER_DAYS
        /*
         * Overdue stands out by shape and words, not by red alone (Von Restorff, WCAG 1.4.1):
         * a red "18d" among black ones was the only cue, plus a tooltip nobody hovers on a
         * phone - so to anyone who cannot tell the red apart, an overdue investigation looked
         * like any other.
         */
        return (
          <span
            className={cn('inline-flex items-center justify-end gap-1 text-sm font-semibold', overdue ? 'text-critical' : 'text-ink')}
            style={{ fontVariantNumeric: 'tabular-nums' }}
            title={overdue ? 'Investigation overdue' : undefined}
          >
            {overdue && <AttentionIcon level="critical" label="Overdue:" />}
            {i.stage === 'closed' ? '—' : `${d}d`}
          </span>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle={`Every incident and near miss reported at your sites. ${openCount} open, most serious first. Open one to see or investigate it.`}
        right={
          <LinkButton icon={<Plus size={15} />} to="/incidents/new">
            Report Incident
          </LinkButton>
        }
      />

      {/* Search + dimension filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/*
          A <label>, so the whole bordered box is the target - the icon and padding included -
          not just the text field inside it (Fitts's law: the target is whatever responds).
        */}
        <label className="flex min-w-56 flex-1 cursor-text items-center gap-2 rounded-lg border coarse:min-h-11 bg-surface px-3 py-2 coarse:py-0 focus-within:border-accent md:max-w-sm">
          <Search size={14} aria-hidden className="shrink-0 text-muted" />
          <input
            type="search"
            aria-label="Search incidents"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, title, reporter, location…"
            className="w-full coarse:self-stretch bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as IncidentType | '')}
          className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
          aria-label="Filter by incident type"
        >
          <option value="">All types</option>
          {/* The same groups as the report form, so the list is scanned by kind, not read top to bottom. */}
          {INCIDENT_TYPE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </optgroup>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IncidentSeverity | '')}
          className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {(['Critical', 'Serious', 'Moderate', 'Minor'] as const).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Status chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatus(chip.value)}
            aria-pressed={status === chip.value}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors coarse:min-h-11 coarse:px-4',
              status === chip.value ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink',
            )}
            style={status === chip.value ? { borderColor: 'var(--accent)' } : undefined}
          >
            {chip.label}
          </button>
        ))}
        {/*
          The less-used statuses, one step away. Shown as active - and naming the status -
          when one of them is the current filter, so the row never hides what is applied.
        */}
        {(() => {
          const moreActive = MORE_STATUSES.find((m) => m.value === status)
          return (
            <select
              aria-label="More statuses"
              value={moreActive?.value ?? ''}
              onChange={(e) => e.target.value && setStatus(e.target.value as IncidentStatusFilter)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors coarse:min-h-11 coarse:px-4',
                moreActive ? 'bg-accent-soft text-ink' : 'bg-surface text-ink-2 hover:text-ink',
              )}
              style={moreActive ? { borderColor: 'var(--accent)' } : undefined}
            >
              <option value="" disabled>More…</option>
              {MORE_STATUSES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )
        })()}
      </div>

      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}

      <Card>
        {rows === null ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <DataTable
            caption="Incidents"
            columns={columns}
            rows={rows}
            rowKey={(i) => i.id}
            // Real links: Ctrl/Cmd-click opens an incident in a new tab, as people expect.
            rowHref={(i) => `/incidents/${i.id}`}
            rowLabel={(i) => `${i.number}: ${i.title}`}
            sort={sort}
            onSortChange={(next) => setSortParam(`${next.key}-${next.direction}`, { replace: true })}
            empty={
              <EmptyState
                icon={ShieldAlert}
                title="No incidents match these filters"
                action={
                  <LinkButton to="/incidents/new" size="sm" icon={<Plus size={14} />}>
                    Report Incident
                  </LinkButton>
                }
              >
                Try widening the status or clearing the search — or report something you've seen.
              </EmptyState>
            }
          />
        )}
      </Card>
    </>
  )
}

/** `?sort=age-desc` -> { key: 'age', direction: 'desc' }. Anything else means server order. */
function parseSort(raw: string): SortState | null {
  const m = /^([a-z]+)-(asc|desc)$/.exec(raw)
  return m ? { key: m[1], direction: m[2] as SortState['direction'] } : null
}
