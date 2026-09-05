import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Users, ArrowUp, ArrowDown } from 'lucide-react'
import { employeesApi } from '@/api/employeesApi'
import type {
  EmployeeRow, EmployeeSort, EmployeeStats, MedicalFilter,
} from '@/api/employees'
import { MEDICAL_LABEL } from '@/api/employees'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton,
  StatusPill,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { canManageEmployees, MEDICAL_KIND, relativeDays } from './lib'
import { EmployeeDrawer } from './components/EmployeeDrawer'
import { NewEmployeeDialog } from './components/NewEmployeeDialog'

const PAGE_SIZE = 25

/** The counters across the top. Each one is a filter you can click into. */
const KPI_DEFS: { key: keyof EmployeeStats; label: string; medical?: MedicalFilter; tone: (n: number) => string }[] = [
  { key: 'headcount', label: 'Active headcount', tone: () => 'var(--accent)' },
  { key: 'medicalExpired', label: 'Medical expired', medical: 'expired', tone: (n) => (n > 0 ? 'var(--critical)' : 'var(--good)') },
  { key: 'medicalExpiring', label: 'Medical expiring', medical: 'expiring', tone: (n) => (n > 0 ? 'var(--warning)' : 'var(--good)') },
  { key: 'medicalMissing', label: 'No medical on file', medical: 'missing', tone: (n) => (n > 0 ? 'var(--warning)' : 'var(--good)') },
  { key: 'ppeOverdue', label: 'PPE replacement due', tone: (n) => (n > 0 ? 'var(--serious)' : 'var(--good)') },
]

const SORT_COLUMNS: { key: EmployeeSort; label: string; className?: string }[] = [
  { key: 'employeeNo', label: 'No.' },
  { key: 'name', label: 'Name' },
  { key: 'position', label: 'Position' },
  { key: 'medicalExpiry', label: 'Medical', className: 'hidden lg:table-cell' },
  { key: 'hireDate', label: 'Joined', className: 'hidden xl:table-cell' },
]

export function EmployeesPage() {
  const { company, sites, site, role } = useOrg()
  const [params, setParams] = useSearchParams()

  const [q, setQ] = useState('')
  const [rows, setRows] = useState<EmployeeRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<EmployeeStats | null>(null)
  const [departments, setDepartments] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  // URL-driven so a filtered register is a shareable link and survives a refresh.
  const openId = params.get('open')
  const page = Math.max(1, Number(params.get('page') ?? 1))
  const medical = (params.get('medical') as MedicalFilter) || 'all'
  const status = (params.get('status') as 'active' | 'inactive' | 'all') || 'active'
  const department = params.get('department') ?? ''
  const sort = (params.get('sort') as EmployeeSort) || 'name'
  const dir = (params.get('dir') as 'asc' | 'desc') || 'asc'

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    // Any change to the filters puts you back on page one; staying on page 6 of a list
    // that now has two pages shows an empty table.
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const canManage = canManageEmployees(role)

  const load = useCallback(() => {
    if (!company) return
    let cancelled = false
    setRows(null)
    setError(null)
    employeesApi
      .list(company.id, {
        q, siteId: site?.id, department: department || undefined,
        status, medical, sort, dir, page, pageSize: PAGE_SIZE,
      })
      .then((r) => {
        if (cancelled) return
        setRows(r.rows)
        setTotal(r.total)
      })
      .catch((e) => {
        if (cancelled) return
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the register.')
      })
    return () => { cancelled = true }
  }, [company, q, site?.id, department, status, medical, sort, dir, page])

  // Debounced while typing, immediate otherwise: a search box that fires per keystroke
  // is one database query per character across the whole workforce.
  useEffect(() => {
    const t = setTimeout(() => { load() }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const refreshAside = useCallback(() => {
    if (!company) return
    employeesApi.stats(company.id).then(setStats).catch(() => setStats(null))
    employeesApi.departments(company.id).then(setDepartments).catch(() => setDepartments([]))
  }, [company])

  useEffect(() => { refreshAside() }, [refreshAside])

  /** After any mutation: refresh the list and the counters so both agree. */
  const onChanged = useCallback((message?: string) => {
    load()
    refreshAside()
    if (message) {
      setFlash(message)
      setTimeout(() => setFlash(null), 2500)
    }
  }, [load, refreshAside])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const siteName = useMemo(
    () => new Map(sites.map((s) => [s.id, s.name])),
    [sites],
  )

  const toggleSort = (key: EmployeeSort) => {
    setParam({ sort: key, dir: sort === key && dir === 'asc' ? 'desc' : 'asc' })
  }

  return (
    <>
      <PageHeader
        title="Workforce"
        subtitle="Who works here, what they are qualified for, and whether they are fit to work"
        right={canManage ? (
          <Button icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>Add person</Button>
        ) : undefined}
      />

      {flash && <Alert tone="success" className="mb-3">{flash}</Alert>}
      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}

      {/* Counters. Clicking one filters the register to it. */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {KPI_DEFS.map((k) => {
          const value = stats?.[k.key]
          const active = !!k.medical && medical === k.medical
          return (
            <button
              key={k.key}
              disabled={!k.medical}
              onClick={() => k.medical && setParam({ medical: active ? null : k.medical })}
              className={cn(
                'rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors',
                k.medical && 'hover:bg-accent-soft',
                active && 'ring-2 ring-accent',
                !k.medical && 'cursor-default',
              )}
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

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Search the workforce"
            placeholder="Name, employee number, email or position…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select aria-label="Department" value={department} onChange={(e) => setParam({ department: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select aria-label="Medical status" value={medical} onChange={(e) => setParam({ medical: e.target.value })}>
          <option value="all">Any medical status</option>
          <option value="valid">Medical valid</option>
          <option value="expiring">Medical expiring</option>
          <option value="expired">Medical expired</option>
          <option value="missing">No medical on file</option>
        </Select>
        <Select aria-label="Employment status" value={status} onChange={(e) => setParam({ status: e.target.value })}>
          <option value="active">Active</option>
          <option value="inactive">Left</option>
          <option value="all">Active and left</option>
        </Select>
      </div>

      <Card>
        {rows === null ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q || medical !== 'all' || department ? 'Nobody matches these filters' : 'No one on the register yet'}
            action={canManage ? (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>Add person</Button>
            ) : undefined}
          >
            {q || medical !== 'all' || department
              ? 'Try widening the filters or clearing the search.'
              : 'Add your workforce so actions, permits and certificates can be assigned to real people.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-2xs uppercase tracking-wide text-muted">
                <tr>
                  {SORT_COLUMNS.map((c) => (
                    <th key={c.key} className={cn('px-3 py-2.5 font-semibold', c.className)}>
                      <button
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink coarse:min-h-11"
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.label}
                        {sort === c.key && (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    </th>
                  ))}
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Site</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Training</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setParam({ open: r.id })}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent-soft/40"
                  >
                    <td className="px-3 py-3 font-mono text-2xs text-muted">{r.employeeNo}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{r.name}</p>
                          <p className="truncate text-2xs text-muted">{r.email ?? r.department ?? '—'}</p>
                        </div>
                        {!r.active && <Badge tone="neutral">Left</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-2">{r.position || '—'}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <div className="flex items-center gap-2">
                        <StatusPill kind={MEDICAL_KIND[r.medicalStatus]} label={MEDICAL_LABEL[r.medicalStatus]} />
                        {r.medicalStatus !== 'missing' && (
                          <span className="text-2xs text-muted">{relativeDays(r.daysToMedicalExpiry)}</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-muted xl:table-cell">
                      {r.hireDate ? new Date(r.hireDate).toISOString().slice(0, 10) : '—'}
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-ink-2 md:table-cell">
                      {siteName.get(r.siteId) ?? r.siteId.toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-ink-2">
                      {r.certificateCount} cert{r.certificateCount === 1 ? '' : 's'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination. Only shown when there is more than one page to move between. */}
      {rows !== null && total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm" variant="secondary" disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm" variant="secondary" disabled={page >= pages}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <EmployeeDrawer
        employeeId={openId}
        canManage={canManage}
        onClose={() => setParam({ open: null })}
        onChanged={onChanged}
      />
      <NewEmployeeDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(name) => { setNewOpen(false); onChanged(`${name} added to the register`) }}
      />
    </>
  )
}
