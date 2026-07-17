import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, ShieldAlert } from 'lucide-react'
import { api } from '@/api/client'
import type { Incident, IncidentSeverity, IncidentStatusFilter, IncidentType } from '@/api/incidents'
import { INCIDENT_TYPES, STAGE_LABEL, TYPE_LABEL } from '@/api/incidents'
import { OVERDUE_AFTER_DAYS } from '@/api/mock/incidents'
import { useOrg } from '@/features/org/OrgContext'
import {
  Badge, Button, Card, DataTable, EmptyState, PageHeader, Skeleton, StatusPill, type Column,
} from '@/components/ui'
import { daysOpen, severityKind, STAGE_COLOR, TYPE_ICON } from './lib'
import { cn } from '@/lib/cn'

const STATUS_CHIPS: { value: IncidentStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigation ongoing' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'high_risk', label: 'High risk' },
  { value: 'overdue', label: `Overdue (> ${OVERDUE_AFTER_DAYS}d)` },
  { value: 'closed', label: 'Closed' },
]

export function IncidentsListPage() {
  const { company, site, sites } = useOrg()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const status = (params.get('status') as IncidentStatusFilter) || 'open'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [type, setType] = useState<IncidentType | ''>((params.get('type') as IncidentType) || '')
  const [severity, setSeverity] = useState<IncidentSeverity | ''>((params.get('severity') as IncidentSeverity) || '')

  const [rows, setRows] = useState<Incident[] | null>(null)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    setRows(null)
    const t = setTimeout(() => {
      api
        .listIncidents(company.id, { q, siteId: site?.id, type, severity, status })
        .then((list) => !cancelled && setRows(list))
    }, q ? 250 : 0) // debounce typing
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [company, site, q, type, severity, status])

  const setStatus = (s: IncidentStatusFilter) => {
    params.set('status', s)
    setParams(params, { replace: true })
  }

  const openCount = useMemo(() => rows?.filter((r) => r.stage !== 'closed').length ?? 0, [rows])

  const columns: Column<Incident>[] = [
    {
      key: 'incident',
      header: 'Incident',
      render: (i) => {
        const Icon = TYPE_ICON[i.type]
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
              <Icon size={14} className="text-accent" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
              <p className="mt-0.5 text-2xs text-muted">
                <span className="font-mono">{i.number}</span> · {TYPE_LABEL[i.type]}
                {i.highRisk && i.stage !== 'closed' && (
                  <Badge tone="critical" className="ml-1.5 gap-0.5"><ShieldAlert size={9} /> High risk</Badge>
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
      render: (i) => <StatusPill kind={severityKind(i.severity)} label={i.severity} />,
    },
    {
      key: 'stage',
      header: 'Stage',
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
      header: 'Days open',
      align: 'right',
      render: (i) => {
        const d = daysOpen(i)
        const overdue = i.stage !== 'closed' && d > OVERDUE_AFTER_DAYS
        return (
          <span
            className={cn('text-sm font-semibold', overdue ? 'text-critical' : 'text-ink')}
            style={{ fontVariantNumeric: 'tabular-nums' }}
            title={overdue ? 'Investigation overdue' : undefined}
          >
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
        subtitle={`${openCount} open in scope · worst severity always on top`}
        right={
          <Button icon={<Plus size={15} />} onClick={() => navigate('/incidents/new')}>
            Report Incident
          </Button>
        }
      />

      {/* Search + dimension filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-sm">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, title, reporter, location…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as IncidentType | '')}
          className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
          aria-label="Filter by incident type"
        >
          <option value="">All types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as IncidentSeverity | '')}
          className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
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
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              status === chip.value ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink',
            )}
            style={status === chip.value ? { borderColor: 'var(--accent)' } : undefined}
          >
            {chip.label}
          </button>
        ))}
      </div>

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
            columns={columns}
            rows={rows}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/incidents/${i.id}`)}
            empty={
              <EmptyState
                icon={ShieldAlert}
                title="No incidents match these filters"
                action={
                  <Link to="/incidents/new">
                    <Button size="sm" icon={<Plus size={14} />}>Report Incident</Button>
                  </Link>
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
