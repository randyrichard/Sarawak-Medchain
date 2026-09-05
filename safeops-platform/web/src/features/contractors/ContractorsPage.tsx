import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, HardHat, Building2, ArrowUp, ArrowDown, LogIn, LogOut } from 'lucide-react'
import { contractorsApi } from '@/api/contractorsApi'
import type {
  ComplianceFilter, ContractorCompanyRow, ContractorStats, ContractorWorkerRow, WorkerSort,
} from '@/api/contractors'
import { EXPIRY_LABEL } from '@/api/contractors'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StatusPill,
  Tabs, type TabItem,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { canManageContractors, canWorkGate, EXPIRY_KIND, gateBlockReason, relativeDays } from './lib'
import { WorkerDrawer } from './components/WorkerDrawer'
import { ContractorDrawer } from './components/ContractorDrawer'
import { NewContractorDialog } from './components/NewContractorDialog'
import { NewWorkerDialog } from './components/NewWorkerDialog'

const PAGE_SIZE = 25

type View = 'workers' | 'companies'

const VIEWS: TabItem<View>[] = [
  { value: 'workers', label: 'Workers' },
  { value: 'companies', label: 'Companies' },
]

/** Counters across the top. Each is a filter you can click into. */
const KPI_DEFS: {
  key: keyof ContractorStats
  label: string
  view?: View
  params?: Record<string, string>
  tone: (n: number) => string
}[] = [
  { key: 'onSite', label: 'On site now', view: 'workers', params: { onSite: 'true' }, tone: () => 'var(--accent)' },
  { key: 'activeWorkers', label: 'Active workers', view: 'workers', tone: () => 'var(--accent)' },
  { key: 'medicalExpired', label: 'Medical expired', view: 'workers', params: { medical: 'expired' }, tone: (n) => (n > 0 ? 'var(--critical)' : 'var(--good)') },
  { key: 'inductionExpired', label: 'Induction expired', view: 'workers', params: { induction: 'expired' }, tone: (n) => (n > 0 ? 'var(--critical)' : 'var(--good)') },
  { key: 'insuranceExpired', label: 'Insurance expired', view: 'companies', params: { insurance: 'expired' }, tone: (n) => (n > 0 ? 'var(--critical)' : 'var(--good)') },
  { key: 'contractorCompanies', label: 'Contractor companies', view: 'companies', tone: () => 'var(--accent)' },
]

const WORKER_COLUMNS: { key: WorkerSort; label: string; className?: string }[] = [
  { key: 'workerNo', label: 'No.' },
  { key: 'name', label: 'Worker' },
  { key: 'medicalExpiry', label: 'Medical', className: 'hidden lg:table-cell' },
  { key: 'inductionExpiry', label: 'Induction', className: 'hidden lg:table-cell' },
]

export function ContractorsPage() {
  const { company, sites, site, role } = useOrg()
  const [params, setParams] = useSearchParams()

  const [q, setQ] = useState('')
  const [stats, setStats] = useState<ContractorStats | null>(null)
  const [workers, setWorkers] = useState<ContractorWorkerRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [firms, setFirms] = useState<ContractorCompanyRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newContractorOpen, setNewContractorOpen] = useState(false)
  const [newWorkerOpen, setNewWorkerOpen] = useState(false)

  // URL-driven so a filtered register is shareable and survives a refresh.
  const view = (params.get('view') as View) || 'workers'
  const openWorker = params.get('worker')
  const openContractor = params.get('contractor')
  const page = Math.max(1, Number(params.get('page') ?? 1))
  const medical = (params.get('medical') as ComplianceFilter) || 'all'
  const induction = (params.get('induction') as ComplianceFilter) || 'all'
  const insurance = (params.get('insurance') as ComplianceFilter) || 'all'
  const onSiteOnly = params.get('onSite') === 'true'
  const contractorFilter = params.get('contractorCompanyId') ?? ''
  const sort = (params.get('sort') as WorkerSort) || 'name'
  const dir = (params.get('dir') as 'asc' | 'desc') || 'asc'

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const canManage = canManageContractors(role)
  const canGate = canWorkGate(role)

  const loadWorkers = useCallback(() => {
    if (!company) return
    let cancelled = false
    setWorkers(null)
    setError(null)
    contractorsApi
      .listWorkers(company.id, {
        q, siteId: site?.id, contractorCompanyId: contractorFilter || undefined,
        medical, induction, onSite: onSiteOnly ? true : undefined,
        sort, dir, page, pageSize: PAGE_SIZE, status: 'active',
      })
      .then((r) => {
        if (cancelled) return
        setWorkers(r.rows)
        setTotal(r.total)
      })
      .catch((e) => {
        if (cancelled) return
        setWorkers([])
        setError(e instanceof ApiError ? e.message : 'Could not load contractor workers.')
      })
    return () => { cancelled = true }
  }, [company, q, site?.id, contractorFilter, medical, induction, onSiteOnly, sort, dir, page])

  const loadFirms = useCallback(() => {
    if (!company) return
    setFirms(null)
    contractorsApi
      .listCompanies(company.id, { q, insurance, status: 'all' })
      .then(setFirms)
      .catch((e) => {
        setFirms([])
        setError(e instanceof ApiError ? e.message : 'Could not load contractors.')
      })
  }, [company, q, insurance])

  const loadStats = useCallback(() => {
    if (!company) return
    contractorsApi.stats(company.id).then(setStats).catch(() => setStats(null))
  }, [company])

  // Debounced while typing: a search box that fires per keystroke is one query per
  // character across every contractor on the site.
  useEffect(() => {
    const t = setTimeout(() => {
      if (view === 'workers') loadWorkers()
      else loadFirms()
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [view, loadWorkers, loadFirms, q])

  useEffect(() => { loadStats() }, [loadStats])

  /** After any mutation: refresh the visible list and the counters so both agree. */
  const onChanged = useCallback((message?: string) => {
    if (view === 'workers') loadWorkers()
    else loadFirms()
    loadStats()
    if (message) {
      setFlash(message)
      setTimeout(() => setFlash(null), 2800)
    }
  }, [view, loadWorkers, loadFirms, loadStats])

  const gate = async (w: ContractorWorkerRow, action: 'in' | 'out') => {
    setBusyId(w.id)
    setError(null)
    try {
      await (action === 'in' ? contractorsApi.checkIn(w.id) : contractorsApi.checkOut(w.id))
      onChanged(`${w.name} checked ${action === 'in' ? 'in' : 'out'}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
    } finally {
      setBusyId(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites])
  const firmOptions = useMemo(() => firms ?? [], [firms])

  // The companies list is needed for the worker filter even while the workers tab is
  // showing, so it is fetched once regardless of which tab is active.
  useEffect(() => {
    if (!company || firms !== null) return
    contractorsApi.listCompanies(company.id, { status: 'all' }).then(setFirms).catch(() => setFirms([]))
  }, [company, firms])

  return (
    <>
      <PageHeader
        title="Contractors"
        subtitle="Who is on site, who they work for, and whether they are allowed to be here"
        right={canManage ? (
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setNewContractorOpen(true)}>
              Add contractor
            </Button>
            <Button icon={<Plus size={14} />} onClick={() => setNewWorkerOpen(true)}>Register worker</Button>
          </div>
        ) : undefined}
      />

      {flash && <Alert tone="success" className="mb-3">{flash}</Alert>}
      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {KPI_DEFS.map((k) => {
          const value = stats?.[k.key]
          return (
            <button
              key={k.key}
              onClick={() => setParam({
                view: k.view ?? view,
                medical: null, induction: null, insurance: null, onSite: null,
                ...(k.params ?? {}),
              })}
              className="rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-accent-soft"
            >
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{k.label}</p>
              {value === undefined ? (
                <Skeleton className="mt-1 h-6 w-10" />
              ) : (
                <p className="mt-0.5 text-xl font-semibold" style={{ color: k.tone(value), fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </p>
              )}
            </button>
          )
        })}
      </div>

      <div className="mb-3 border-b">
        <Tabs items={VIEWS} value={view} onChange={(v) => setParam({ view: v, page: null })} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Search contractors"
            placeholder={view === 'workers' ? 'Name, worker number, IC or position…' : 'Name, code or registration…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        {view === 'workers' ? (
          <>
            <Select aria-label="Contractor" value={contractorFilter} onChange={(e) => setParam({ contractorCompanyId: e.target.value })}>
              <option value="">All contractors</option>
              {firmOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select aria-label="Medical status" value={medical} onChange={(e) => setParam({ medical: e.target.value })}>
              <option value="all">Any medical</option>
              <option value="valid">Medical valid</option>
              <option value="expiring">Medical expiring</option>
              <option value="expired">Medical expired</option>
              <option value="missing">No medical</option>
            </Select>
            <Select aria-label="Induction status" value={induction} onChange={(e) => setParam({ induction: e.target.value })}>
              <option value="all">Any induction</option>
              <option value="valid">Induction valid</option>
              <option value="expiring">Induction expiring</option>
              <option value="expired">Induction expired</option>
              <option value="missing">No induction</option>
            </Select>
            <Button
              size="sm"
              variant={onSiteOnly ? 'primary' : 'secondary'}
              onClick={() => setParam({ onSite: onSiteOnly ? null : 'true' })}
            >
              On site only
            </Button>
          </>
        ) : (
          <Select aria-label="Insurance status" value={insurance} onChange={(e) => setParam({ insurance: e.target.value })}>
            <option value="all">Any insurance status</option>
            <option value="valid">Insurance valid</option>
            <option value="expiring">Insurance expiring</option>
            <option value="expired">Insurance expired</option>
            <option value="missing">No insurance on file</option>
          </Select>
        )}
      </div>

      <Card>
        {view === 'workers' ? (
          workers === null ? (
            <ListSkeleton />
          ) : workers.length === 0 ? (
            <EmptyState
              icon={HardHat}
              title={q || medical !== 'all' || induction !== 'all' || onSiteOnly
                ? 'No workers match these filters'
                : 'No contractor workers registered'}
              action={canManage ? (
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setNewWorkerOpen(true)}>Register worker</Button>
              ) : undefined}
            >
              {q || medical !== 'all' || induction !== 'all' || onSiteOnly
                ? 'Try widening the filters or clearing the search.'
                : 'Register the people your contractors send so the gate can check them.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-2xs uppercase tracking-wide text-muted">
                  <tr>
                    {WORKER_COLUMNS.map((c) => (
                      <th key={c.key} className={cn('px-3 py-2.5 font-semibold', c.className)}>
                        <button
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink coarse:min-h-11"
                          onClick={() => setParam({ sort: c.key, dir: sort === c.key && dir === 'asc' ? 'desc' : 'asc' })}
                        >
                          {c.label}
                          {sort === c.key && (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                        </button>
                      </th>
                    ))}
                    <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Site</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => {
                    const blocked = gateBlockReason(w)
                    return (
                      <tr
                        key={w.id}
                        onClick={() => setParam({ worker: w.id })}
                        className="cursor-pointer border-b last:border-0 hover:bg-accent-soft/40"
                      >
                        <td className="px-3 py-3 font-mono text-2xs text-muted">{w.workerNo}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">{w.name}</p>
                              <p className="truncate text-2xs text-muted">
                                {w.contractorName}{w.position ? ` · ${w.position}` : ''}
                              </p>
                            </div>
                            {w.onSite && <Badge tone="accent">On site</Badge>}
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <StatusPill kind={EXPIRY_KIND[w.medicalStatus]} label={EXPIRY_LABEL[w.medicalStatus]} />
                          {w.medicalStatus !== 'missing' && (
                            <span className="ml-2 text-2xs text-muted">{relativeDays(w.daysToMedicalExpiry)}</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <StatusPill kind={EXPIRY_KIND[w.inductionStatus]} label={EXPIRY_LABEL[w.inductionStatus]} />
                          {w.inductionStatus !== 'missing' && (
                            <span className="ml-2 text-2xs text-muted">{relativeDays(w.daysToInductionExpiry)}</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 text-xs text-ink-2 md:table-cell">
                          {siteName.get(w.siteId) ?? w.siteId.toUpperCase()}
                        </td>
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {!canGate ? (
                            <span className="text-2xs text-muted">—</span>
                          ) : w.onSite ? (
                            <Button size="sm" variant="secondary" icon={<LogOut size={12} />}
                              loading={busyId === w.id} onClick={() => void gate(w, 'out')}>
                              Check out
                            </Button>
                          ) : blocked ? (
                            // Shown rather than hidden: the gate operator needs to know why,
                            // and "the button is missing" is not an answer they can act on.
                            <span className="text-2xs font-medium text-critical">{blocked}</span>
                          ) : (
                            <Button size="sm" variant="secondary" icon={<LogIn size={12} />}
                              loading={busyId === w.id} onClick={() => void gate(w, 'in')}>
                              Check in
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : firms === null ? (
          <ListSkeleton />
        ) : firms.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={q || insurance !== 'all' ? 'No contractors match these filters' : 'No contractors yet'}
            action={canManage ? (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setNewContractorOpen(true)}>Add contractor</Button>
            ) : undefined}
          >
            {q || insurance !== 'all'
              ? 'Try widening the filters or clearing the search.'
              : 'Add the firms working on your sites so their insurance and workers can be tracked.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-2xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Contractor</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Insurance</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Contact</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Workers</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setParam({ contractor: f.id })}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent-soft/40"
                  >
                    <td className="px-3 py-3 font-mono text-2xs text-muted">{f.code}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{f.name}</p>
                          <p className="truncate text-2xs text-muted">{f.registrationNumber || 'No registration recorded'}</p>
                        </div>
                        {f.status === 'suspended' && <Badge tone="critical">Suspended</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <StatusPill kind={EXPIRY_KIND[f.insuranceStatus]} label={EXPIRY_LABEL[f.insuranceStatus]} />
                      {f.insuranceStatus !== 'missing' && (
                        <span className="ml-2 text-2xs text-muted">{relativeDays(f.daysToInsuranceExpiry)}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-ink-2 md:table-cell">
                      {f.contactPerson || '—'}
                      {f.phone && <span className="block text-2xs text-muted">{f.phone}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-ink-2">
                      {f.workerCount}
                      {f.onSiteCount > 0 && <span className="ml-1.5 text-2xs text-accent">({f.onSiteCount} on site)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {view === 'workers' && workers !== null && total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </div>
      )}

      <WorkerDrawer
        workerId={openWorker} canManage={canManage} canGate={canGate}
        onClose={() => setParam({ worker: null })}
        onChanged={onChanged}
      />
      <ContractorDrawer
        contractorId={openContractor} canManage={canManage}
        onClose={() => setParam({ contractor: null })}
        onChanged={onChanged}
        onViewWorkers={(id) => setParam({ contractor: null, view: 'workers', contractorCompanyId: id })}
      />
      <NewContractorDialog
        open={newContractorOpen}
        onClose={() => setNewContractorOpen(false)}
        onCreated={(name) => { setNewContractorOpen(false); setFirms(null); onChanged(`${name} added`) }}
      />
      <NewWorkerDialog
        open={newWorkerOpen} contractors={firmOptions}
        onClose={() => setNewWorkerOpen(false)}
        onCreated={(name) => { setNewWorkerOpen(false); onChanged(`${name} registered`) }}
      />
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
