import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HardHat, Plus, Search, ShieldAlert } from 'lucide-react'
import { api } from '@/api/client'
import { PERMIT_TYPES, PERMIT_TYPE_LABEL, type PermitFilters, type PermitStats, type PermitType, type PermitView } from '@/api/permits'
import { useOrg } from '@/features/org/OrgContext'
import { useActor } from '@/features/incidents/lib'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { canIssuePermits } from './lib'
import { PermitCard } from './components/PermitCard'
import { PermitDrawer } from './components/PermitDrawer'
import { NewPermitDialog } from './components/NewPermitDialog'
import { pollWhileVisible } from '@/lib/poll'

type StatusChip = NonNullable<PermitFilters['status']>

const CHIPS: { value: StatusChip; label: string }[] = [
  { value: 'live', label: 'Live board' },
  { value: 'active', label: 'In progress' },
  { value: 'submitted', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'expired', label: 'Expired' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

export function PermitsPage() {
  const { company, site, role } = useOrg()
  const actor = useActor()
  const [params, setParams] = useSearchParams()

  const status = (params.get('status') as StatusChip) || 'live'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [type, setType] = useState<PermitType | ''>((params.get('type') as PermitType) || '')
  const [rows, setRows] = useState<PermitView[] | null>(null)
  const [stats, setStats] = useState<PermitStats | null>(null)
  const [openId, setOpenId] = useState<string | null>(params.get('permit'))
  const [newOpen, setNewOpen] = useState(false)

  const issuer = canIssuePermits(role)

  const refresh = useCallback(() => {
    if (!company) return
    // Fire the expiry sweep on every load so warnings land even without a background job.
    void api.sweepPermitExpiry(company.id)
    api.listPermits(company.id, { q, siteId: site?.id, type, status }).then(setRows)
    api.permitStats(company.id, site?.id ?? null).then(setStats)
  }, [company, site?.id, q, type, status])

  useEffect(() => {
    const t = setTimeout(refresh, q ? 250 : 0) // debounce typing
    return () => clearTimeout(t)
  }, [refresh, q])

  // Permits are time-critical: re-derive remaining time every 30s without a full refetch.
  useEffect(() => {
    return pollWhileVisible(() => { if (company) refresh() }, 30_000)
  }, [company, refresh])

  const setParam = (k: string, v: string) => {
    if (v) params.set(k, v)
    else params.delete(k)
    setParams(params, { replace: true })
  }

  /*
   * The permit office's board. Ordered by how urgently each number changes what someone
   * does: work happening now, people inside a vessel, then what is stuck or about to
   * lapse, then the day's shape.
   */
  const KPIS = useMemo(() => [
    { label: 'Active permits', value: stats?.activeNow, tone: undefined },
    {
      label: 'Inside confined space',
      value: stats?.insideConfinedSpace,
      tone: stats && stats.insideConfinedSpace > 0 ? 'var(--accent)' : undefined,
    },
    {
      label: 'Awaiting review',
      value: stats?.awaitingReview,
      tone: stats && stats.awaitingReview > 0 ? 'var(--warning)' : undefined,
    },
    {
      label: 'Expiring today',
      value: stats?.expiringToday,
      tone: stats && stats.expiringToday > 0 ? 'var(--warning)' : 'var(--good)',
    },
    {
      label: 'Expired, still open',
      value: stats?.expiredOpen,
      tone: stats && stats.expiredOpen > 0 ? 'var(--critical)' : 'var(--good)',
    },
    {
      label: 'Suspended',
      value: stats?.suspended,
      tone: stats && stats.suspended > 0 ? 'var(--critical)' : 'var(--good)',
    },
    { label: 'Starting today', value: stats?.startingToday, tone: undefined },
    { label: 'Closed this month', value: stats?.closedThisMonth, tone: undefined },
  ], [stats])

  const urgent = rows?.filter((r) => r.expiringSoon || r.status === 'expired' || r.status === 'suspended') ?? []

  return (
    <>
      <PageHeader
        title="Permit to Work"
        subtitle="Every high-risk job authorised, time-bound and handed back"
        right={<Button icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>Request permit</Button>}
      />

      {/* Widget row — 2 up on phones, 4 across on desktop */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <Card key={k.label} className="animate-rise px-4 py-3">
            <p className="text-2xs font-semibold text-ink-2" style={{ animationDelay: `${i * 35}ms` }}>{k.label}</p>
            {k.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-10" />
            ) : (
              <p className="mt-0.5 text-2xl font-semibold tracking-tight"
                style={{ color: k.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Anything demanding attention is surfaced above the board, not buried in it. */}
      {urgent.length > 0 && status === 'live' && (
        <Card className="mb-4 border-l-4 border-l-[color:var(--critical)] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--critical)' }}>
            <ShieldAlert size={13} /> Needs attention now
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {urgent.map((p) => <PermitCard key={p.id} permit={p} onOpen={() => { setOpenId(p.id); setParam('permit', p.id) }} />)}
          </div>
        </Card>
      )}

      {/* Filters: search + type + status, all deep-linkable */}
      <div className="mb-3 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value) }}
              placeholder="Search permit no., work, location, applicant…"
              aria-label="Search permits"
              className="h-9 w-full rounded-lg border bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value as PermitType | ''); setParam('type', e.target.value) }}
            aria-label="Filter by permit type"
            className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
          >
            <option value="">All permit types</option>
            {PERMIT_TYPES.map((t) => <option key={t} value={t}>{PERMIT_TYPE_LABEL[t]}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setParam('status', c.value)}
              aria-pressed={status === c.value}
              className={cn(
                'rounded-full border px-3 py-1 text-2xs font-semibold transition-colors coarse:min-h-11 coarse:px-4',
                status === c.value ? 'border-transparent bg-accent text-white' : 'text-ink-2 hover:bg-accent-soft',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Board */}
      {rows === null ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={HardHat} title="No permits match">
            {status === 'live'
              ? 'No live permits in this scope. High-risk work should not proceed without one.'
              : 'Try a different filter, or clear the search.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {rows.map((p) => (
            <PermitCard key={p.id} permit={p} onOpen={() => { setOpenId(p.id); setParam('permit', p.id) }} />
          ))}
        </div>
      )}

      <PermitDrawer
        permitId={openId}
        actor={actor}
        issuer={issuer}
        onClose={() => { setOpenId(null); setParam('permit', '') }}
        onChanged={refresh}
      />

      <NewPermitDialog
        open={newOpen}
        actor={actor}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => { setNewOpen(false); refresh(); setOpenId(id); setParam('permit', id) }}
      />
    </>
  )
}
