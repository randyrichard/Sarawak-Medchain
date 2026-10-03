import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Activity, ClipboardCheck, CheckCircle2, Search, X, ChevronLeft, ChevronRight,
  HeartPulse, ShieldAlert, Microscope,
} from 'lucide-react'
import { incidentsApi } from '@/api/incidentsApi'
import { investigationApi, type IncidentBoard } from '@/api/investigationApi'
import {
  INCIDENT_STAGES, SEVERITY_LABEL, STAGE_LABEL, TYPE_LABEL,
  type Incident, type IncidentSeverity, type IncidentStage, type IncidentType,
} from '@/api/incidents'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { useDepartments } from '@/features/org/departments'
import { usePeople } from './lib'
import {
  Alert, Badge, Breadcrumbs, Button, Card, LinkButton, CardBody, Input, SuggestSelect, PageHeader, Select, Skeleton,
  StatusPill,
} from '@/components/ui'
import { usePageTitle } from '@/app/pageTitle'
import { severityKind, fmtDate, fmtDateTime } from './lib'
import {
  EMPTY_FILTERS, SORT_LABEL, activeFilterCount, applyChange, highSeverityCount,
  parseFilters, toQuery, toSearchParams,
  type BoardFilters, type SortKey,
} from './boardFilters'
import { cn } from '@/lib/cn'

/**
 * The incident board.
 *
 * Built for the question an HSE manager opens it to answer: what is serious, what is
 * stuck, and what needs me today. Every count comes from GET /incidents/board and every
 * row from GET /incidents — filtering, sorting and paging all happen in Postgres, because
 * a board that fetches the whole table to sort it in the browser stops working at the
 * exact customer size that matters.
 *
 * Filter state lives in the URL so a filtered board can be sent to somebody, survives a
 * refresh, and works with the back button.
 */
const PAGE_SIZE = 25

export function IncidentBoardPage() {
  usePageTitle('Incident board')
  const { company, sites } = useOrg()
  const [params, setParams] = useSearchParams()

  // Parsed by the module the tests cover, so the board and its tests cannot drift apart.
  const filters = useMemo<BoardFilters>(() => parseFilters(params), [params])

  const departments = useDepartments()

  const people = usePeople()


  const [board, setBoard] = useState<IncidentBoard | null>(null)
  const [rows, setRows] = useState<Incident[] | null>(null)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)
  /** Kept local so typing does not fight a round trip; pushed to the URL on a debounce. */
  const [qDraft, setQDraft] = useState(filters.q)

  useEffect(() => { setQDraft(filters.q) }, [filters.q])

  const patch = useCallback((next: Partial<BoardFilters>) => {
    setParams(toSearchParams(applyChange(filters, next)))
  }, [filters, setParams])

  // Free-text search is debounced into the URL; everything else applies immediately.
  useEffect(() => {
    if (qDraft === filters.q) return
    const t = setTimeout(() => patch({ q: qDraft }), 300)
    return () => clearTimeout(t)
  }, [qDraft, filters.q, patch])

  const load = useCallback(() => {
    if (!company) return
    setError(null)
    setRows(null)

    incidentsApi.list(company.id, toQuery(filters, PAGE_SIZE))
      .then((res) => {
        setRows(res.rows)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch((e) => {
        // A rejected request must not render as an empty board. "No incidents" is the most
        // dangerous wrong answer this screen can give.
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the incident register.')
      })
  }, [company, filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!company) return
    investigationApi.board(company.id, filters.siteId || undefined)
      .then(setBoard)
      .catch(() => setBoard(null))
  }, [company, filters.siteId])

  const activeCount = useMemo(() => activeFilterCount(filters), [filters])

  /** Widgets jump to the register already filtered for what the number counted. */
  const tiles: {
    label: string; value: number | undefined; icon: typeof Activity
    tone?: string; hint?: string; go?: Partial<BoardFilters>
  }[] = [
    { label: 'Open incidents', value: board?.openIncidents, icon: Activity,
      go: { stage: '', severity: '' } },
    { label: 'High severity', value: board ? highSeverityCount(board.bySeverity) : undefined,
      icon: ShieldAlert, tone: 'var(--critical)', hint: 'LTI and above',
      go: { sort: 'severity' } },
    { label: 'Investigations open', value: board?.openInvestigations, icon: Microscope,
      tone: board?.openInvestigations ? 'var(--warning)' : undefined,
      hint: 'Started, not signed off', go: { stage: 'investigation' } },
    { label: 'Overdue actions', value: board?.overdueCapas, icon: AlertTriangle,
      tone: board?.overdueCapas ? 'var(--critical)' : undefined,
      hint: 'Past their due date' },
    { label: 'Lost time', value: board?.lostTime, icon: HeartPulse,
      tone: board?.lostTime ? 'var(--critical)' : undefined,
      go: { severity: 'lost_time_injury' } },
    { label: 'Near misses', value: board?.nearMisses, icon: ClipboardCheck,
      go: { severity: 'near_miss' } },
    { label: 'This month', value: board?.thisMonth, icon: Activity },
    { label: 'Total in scope', value: board?.total, icon: CheckCircle2,
      hint: 'Excludes archived' },
  ]

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Incidents', to: '/incidents' },
          { label: 'Board' },
        ]}
      />
      <PageHeader
        title="Incident board"
        subtitle="What is serious, what is stuck, and what needs you today"
        right={<LinkButton to="/incidents/new">Report incident</LinkButton>}
      />

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const clickable = !!t.go
          const Tag = clickable ? 'button' : 'div'
          return (
            <Card key={t.label}>
              <Tag
                {...(clickable ? { onClick: () => setParams(toSearchParams({ ...EMPTY_FILTERS, ...t.go })), type: 'button' as const } : {})}
                className={cn('block w-full text-left', clickable && 'hover:bg-accent-soft/30')}
              >
                <CardBody className="py-3">
                  <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted hyphens-auto [overflow-wrap:anywhere]">
                    <t.icon size={11} /> {t.label}
                  </p>
                  {t.value === undefined ? (
                    <Skeleton className="mt-1 h-7 w-12" />
                  ) : (
                    <p className="mt-0.5 text-2xl font-bold" style={{ color: t.tone }}>{t.value}</p>
                  )}
                  {t.hint && <p className="text-2xs text-muted">{t.hint}</p>}
                </CardBody>
              </Tag>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-[34px] text-muted" />
              <Input
                label="Search"
                aria-label="Search incidents"
                placeholder="Number, title, location or reporter"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select label="Sort by" value={filters.sort}
              onChange={(e) => patch({ sort: e.target.value as SortKey })}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </Select>
            {activeCount > 0 && (
              <Button variant="secondary" icon={<X size={12} />}
                onClick={() => setParams(new URLSearchParams())}>
                Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Site" value={filters.siteId} onChange={(e) => patch({ siteId: e.target.value })}>
              <option value="">All sites</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select label="Type" value={filters.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="">All types</option>
              {(Object.keys(TYPE_LABEL) as IncidentType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </Select>
            <Select label="Severity" value={filters.severity} onChange={(e) => patch({ severity: e.target.value })}>
              <option value="">All severities</option>
              {(Object.keys(SEVERITY_LABEL) as IncidentSeverity[]).map((sv) => (
                <option key={sv} value={sv}>{SEVERITY_LABEL[sv]}</option>
              ))}
            </Select>
            <Select label="Stage" value={filters.stage} onChange={(e) => patch({ stage: e.target.value })}>
              <option value="">All stages</option>
              {INCIDENT_STAGES.map((st) => (
                <option key={st} value={st}>{STAGE_LABEL[st as IncidentStage]}</option>
              ))}
            </Select>

            {/*
              allowEmpty, unlike the same field on a form: "any department" is a real answer
              to a filter and has to be reachable again after one has been picked.
            */}
            <SuggestSelect
              options={departments}
              label="Department"
              value={filters.department}
              onChange={(v) => patch({ department: v })}
              placeholder="Any department"
              addLabel="Type a name instead…"
              allowEmpty
            />
            <SuggestSelect
              options={people}
              label="Investigator"
              value={filters.investigator}
              onChange={(v) => patch({ investigator: v })}
              placeholder="Any investigator"
              addLabel="Type a name instead…"
              allowEmpty
            />
            <Input label="From" type="date" value={filters.from}
              onChange={(e) => patch({ from: e.target.value })} />
            <Input label="To" type="date" value={filters.to}
              onChange={(e) => patch({ to: e.target.value })} />

            <Select label="Shift" value={filters.shift} onChange={(e) => patch({ shift: e.target.value })}>
              <option value="">Any shift</option>
              {['Day', 'Night', 'Swing', 'Rotating', 'Office hours'].map((sh) => (
                <option key={sh} value={sh}>{sh}</option>
              ))}
            </Select>
            <Select label="Reported" value={filters.anonymous}
              onChange={(e) => patch({ anonymous: e.target.value })}>
              <option value="">Named or anonymous</option>
              <option value="false">Named only</option>
              <option value="true">Anonymous only</option>
            </Select>
            <Select label="Emergency response" value={filters.emergencyResponse}
              onChange={(e) => patch({ emergencyResponse: e.target.value })}>
              <option value="">Either</option>
              <option value="true">Activated</option>
              <option value="false">Not activated</option>
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Register */}
      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-sm text-ink">No incidents match.</p>
            <p className="mt-1 text-2xs text-muted">
              {activeCount > 0
                ? 'Try widening or clearing the filters.'
                : 'Nothing has been reported in this workspace yet.'}
            </p>
            {activeCount > 0 && (
              <Button variant="secondary" className="mt-3"
                onClick={() => setParams(new URLSearchParams())}>
                Clear filters
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="mb-2 text-2xs text-muted">
            {total} incident{total === 1 ? '' : 's'}
            {activeCount > 0 && ' matching the filters'}
            {' · '}page {filters.page} of {totalPages}
          </p>

          {/*
            Cards, not a table. The register is read on a phone in a gatehouse as often as
            at a desk, and the fields that matter there are what happened, how bad, and
            whether anybody is on it.
          */}
          <ul className="space-y-2">
            {rows.map((i) => (
              <li key={i.id}>
                {/*
                  A link, not a button that navigates: it goes somewhere, so it should behave
                  like everything else that does - Ctrl/Cmd-click or middle-click for a new
                  tab, right-click to copy the address, the URL shown on hover.
                */}
                <Link
                  to={`/incidents/${i.id}`}
                  className="block w-full rounded-lg border px-3 py-2.5 text-left transition hover:border-accent hover:bg-accent-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-2xs text-muted">{i.number}</span>
                    <span className="text-sm font-medium text-ink">{i.title}</span>
                    <StatusPill kind={severityKind(i.severity)}
                      label={SEVERITY_LABEL[i.severity] ?? i.severity} />
                    <Badge tone="neutral">{STAGE_LABEL[i.stage] ?? i.stage}</Badge>
                    {i.anonymous && <Badge tone="neutral">Anonymous</Badge>}
                  </div>
                  <p className="mt-0.5 text-2xs text-muted">
                    {TYPE_LABEL[i.type] ?? i.type}
                    {' · '}{fmtDateTime(i.occurredAt)}
                    {i.siteId && <> · {i.siteId.toUpperCase()}</>}
                    {i.department && <> · {i.department}</>}
                    {i.location && <> · {i.location}</>}
                  </p>
                  <p className="text-2xs text-muted">
                    {i.investigator ? <>Investigator {i.investigator}</> : 'No investigator assigned'}
                    {' · '}reported by {i.reporter}
                    {i.updatedAt && <> · updated {fmtDate(i.updatedAt)}</>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button variant="secondary" icon={<ChevronLeft size={12} />}
                disabled={filters.page <= 1}
                onClick={() => patch({ page: filters.page - 1 })}>
                Previous
              </Button>
              <span className="text-2xs text-muted">
                Page {filters.page} of {totalPages}
              </span>
              <Button variant="secondary"
                disabled={filters.page >= totalPages}
                onClick={() => patch({ page: filters.page + 1 })}>
                Next <ChevronRight size={12} />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
