import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HardHat, Plus, Search } from 'lucide-react'
import { api } from '@/api/client'
import { PERMIT_TYPES, PERMIT_TYPE_LABEL, type PermitFilters, type PermitStats, type PermitType, type PermitView } from '@/api/permits'
import { useOrg } from '@/features/org/OrgContext'
import { useActor } from '@/features/incidents/lib'
import { Button, Card, EmptyState, PageHeader, Skeleton, AttentionIcon, attentionOf, attentionStripe } from '@/components/ui'
import { cn } from '@/lib/cn'
import { canIssuePermits, canOperatePermits, canRecordGasTests } from './lib'
import { PermitCard } from './components/PermitCard'
import { PermitDrawer } from './components/PermitDrawer'
import { NewPermitDialog } from './components/NewPermitDialog'
import { pollWhileVisible } from '@/lib/poll'
import { openParam } from '@/lib/links'

type StatusChip = NonNullable<PermitFilters['status']>

const CHIPS: { value: StatusChip; label: string }[] = [
  { value: 'live', label: 'Live board' },
  { value: 'active', label: 'In progress' },
  // Submitted or anywhere in the approval chain. It matched `submitted` alone, so a permit
  // left this list as soon as its first reviewer signed.
  { value: 'awaiting', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'expired', label: 'Expired' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

/**
 * Names for the statuses a link can ask for that have no chip of their own - Home links
 * to each stage of the approval chain, and to rejected permits. Shown as a selected chip,
 * so the list never looks unfiltered while it is filtered.
 */
const OTHER_STATUS: Partial<Record<StatusChip, string>> = {
  draft: 'Drafts',
  submitted: 'Submitted, not yet in review',
  supervisor_review: 'Supervisor review',
  hse_review: 'HSE review',
  area_authority: 'Area authority',
  rejected: 'Rejected',
  expiring: 'Expiring within 7 days',
}

export function PermitsPage() {
  const { company, site, role } = useOrg()
  const actor = useActor()
  const [params, setParams] = useSearchParams()

  const status = (params.get('status') as StatusChip) || 'live'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [type, setType] = useState<PermitType | ''>((params.get('type') as PermitType) || '')
  const [rows, setRows] = useState<PermitView[] | null>(null)
  const [stats, setStats] = useState<PermitStats | null>(null)
  // `permit` is this page's own name for the open permit; search and Home link with `open`.
  const [openId, setOpenId] = useState<string | null>(() => openParam(params, 'permit', 'focus'))
  const [newOpen, setNewOpen] = useState(false)

  const issuer = canIssuePermits(role)
  const operator = canOperatePermits(role)
  const gasTester = canRecordGasTests(role)

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

  // Arrived by another name: rewrite it as `permit`, so closing the drawer clears it.
  useEffect(() => {
    if (!openId || params.get('permit') === openId) return
    params.delete('open')
    params.delete('focus')
    setParam('permit', openId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const otherStatus = CHIPS.some((c) => c.value === status) ? null : OTHER_STATUS[status] ?? null

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
        title="Permits to work"
        subtitle="Written permission for high-risk work such as hot work or entering a confined space. A permit must be approved before work starts, and closed when the area is handed back."
        right={<Button icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>Request permit</Button>}
      />

      {/* Widget row — 2 up on phones, 4 across on desktop */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        {KPIS.map((k, i) => (
          <Card key={k.label} className="animate-rise px-4 py-3" style={attentionStripe(attentionOf(k.tone))}>
            <p className="text-2xs font-semibold text-ink-2" style={{ animationDelay: `${i * 35}ms` }}>{k.label}</p>
            {k.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-10" />
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight"
                style={{ color: k.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              <AttentionIcon level={attentionOf(k.tone)} /></p>
            )}
          </Card>
        ))}
      </div>

      {/* Anything demanding attention is surfaced above the board, not buried in it. */}
      {urgent.length > 0 && status === 'live' && (
        <Card className="mb-4 border-l-4 border-l-[color:var(--critical)] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--critical)' }}>
            Needs attention now
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
              className="h-9 coarse:h-11 w-full rounded-lg border bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value as PermitType | ''); setParam('type', e.target.value) }}
            aria-label="Filter by permit type"
            className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
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
                // The selected filter is marked softly - tint and accent border - not with the
                // solid fill of the page's primary button. Both used to be solid blue, so the
                // selected chip and "Request permit" competed as equals and neither stood out
                // (Von Restorff: one standout per view).
                status === c.value ? 'border-[color:var(--accent)] bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft',
              )}
            >
              {c.label}
            </button>
          ))}
          {otherStatus && (
            <button
              onClick={() => setParam('status', 'live')}
              aria-pressed
              aria-label={`${otherStatus}. Show the live board instead`}
              className="rounded-full border border-[color:var(--accent)] bg-accent-soft px-3 py-1 text-2xs font-semibold text-ink coarse:min-h-11 coarse:px-4"
            >
              {otherStatus} ✕
            </button>
          )}
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
        operator={operator}
        gasTester={gasTester}
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
