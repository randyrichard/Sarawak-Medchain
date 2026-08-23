import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KanbanSquare, List, CalendarDays, LineChart, Plus, Search } from 'lucide-react'
import { api } from '@/api/client'
import type { CapaFilters, CapaItem, CapaStats } from '@/api/capa'
import type { ActionPriority } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import { useActor, usePeople } from '@/features/incidents/lib'
import { Alert, Badge, Button, Card, PageHeader, Skeleton, Tabs, type TabItem } from '@/components/ui'
import { ApiError } from '@/api/types'
import { cn } from '@/lib/cn'
import { isManager } from './lib'
import { KanbanBoard } from './components/KanbanBoard'
import { ActionsTable } from './components/ActionsTable'
import { CalendarView } from './components/CalendarView'
import { CapaAnalyticsView } from './components/CapaAnalyticsView'
import { ActionDrawer } from './components/ActionDrawer'
import { NewActionDialog } from './components/NewActionDialog'

type View = 'board' | 'list' | 'calendar' | 'analytics'
type Bucket = NonNullable<CapaFilters['bucket']>

const KPI_DEFS: { key: keyof CapaStats; label: string; bucket: Bucket; tone: (n: number) => string }[] = [
  { key: 'open', label: 'Open actions', bucket: 'open', tone: () => 'var(--accent)' },
  { key: 'overdue', label: 'Overdue', bucket: 'overdue', tone: (n) => (n > 0 ? 'var(--critical)' : 'var(--good)') },
  { key: 'dueToday', label: "Due today", bucket: 'due_today', tone: (n) => (n > 0 ? 'var(--warning)' : 'var(--good)') },
  { key: 'verificationPending', label: 'Verification pending', bucket: 'verification', tone: (n) => (n > 0 ? 'var(--warning)' : 'var(--good)') },
  { key: 'highPriority', label: 'High priority', bucket: 'high_priority', tone: (n) => (n > 0 ? 'var(--serious)' : 'var(--good)') },
  { key: 'completed30d', label: 'Completed (30d)', bucket: 'completed', tone: () => 'var(--good)' },
]

export function ActionsPage() {
  const { company, role, sites, site } = useOrg()
  const actor = useActor()
  const people = usePeople()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<View>((params.get('view') as View) || 'board')
  const bucket = (params.get('bucket') as Bucket) || 'all'
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [priority, setPriority] = useState<ActionPriority | ''>('')

  const [items, setItems] = useState<CapaItem[] | null>(null)
  const [stats, setStats] = useState<CapaStats | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const refresh = useCallback(() => {
    if (!company) return
    const filters: CapaFilters = { q, owner, priority, bucket, siteId: site?.id }
    api.listCapa(company.id, filters, actor).then(setItems)
    api.capaStats(company.id, actor).then(setStats)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, q, owner, priority, bucket, site?.id, actor.name, actor.role])

  useEffect(() => {
    setItems(null)
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  const setBucket = (b: Bucket) => {
    params.set('bucket', b)
    setParams(params, { replace: true })
  }
  const switchView = (v: View) => {
    setView(v)
    params.set('view', v)
    setParams(params, { replace: true })
  }

  /** In-place update after a mutation, then refresh counters. */
  const onChanged = useCallback(
    (updated: CapaItem) => {
      setItems((cur) => cur?.map((i) => (i.id === updated.id ? updated : i)) ?? null)
      // The deep-linked row is not in `items`, so it needs updating on its own or the
      // drawer keeps rendering the state from before the mutation.
      setDeepLinked((cur) => (cur && cur.id === updated.id ? updated : cur))
      if (company) api.capaStats(company.id, actor).then(setStats)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company, actor.name],
  )

  /*
   * Deep link from another module: /actions?open=<id>
   *
   * The named action is very often not in `items` - the list is filtered by bucket, owner,
   * priority, site and search, and a link arriving from a notification knows nothing about
   * any of that. Waiting for it to appear in the list meant the drawer silently never
   * opened and the operator was left staring at an unfiltered board wondering what the
   * link was for. So the id is taken immediately and, if the list does not hold it, the
   * one row is fetched by id.
   */
  const [deepLinked, setDeepLinked] = useState<CapaItem | null>(null)
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null)

  useEffect(() => {
    const openParam = params.get('open')
    if (!openParam) return
    setOpenId(openParam)
    params.delete('open')
    setParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!openId) { setDeepLinked(null); setDeepLinkError(null); return }
    if (items?.some((i) => i.id === openId)) { setDeepLinked(null); return }
    let cancelled = false
    api.getCapa(openId)
      .then((row) => { if (!cancelled) setDeepLinked(row) })
      .catch((e) => {
        // A stale or forbidden link is said out loud rather than opening nothing. The
        // server decides which it is; this only reports it.
        if (!cancelled) {
          setDeepLinked(null)
          setDeepLinkError(e instanceof ApiError ? e.message : 'That action could not be opened.')
        }
      })
    return () => { cancelled = true }
  }, [openId, items])

  const openItem = useMemo(
    () => items?.find((i) => i.id === openId) ?? deepLinked ?? null,
    [items, openId, deepLinked],
  )
  const readOnlyRole = role === 'ceo'

  const viewTabs: TabItem<View>[] = [
    { value: 'board', label: 'Board' },
    { value: 'list', label: 'List' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'analytics', label: 'Analytics' },
  ]
  const VIEW_ICON = { board: KanbanSquare, list: List, calendar: CalendarDays, analytics: LineChart }

  const scopeNote =
    role === 'employee' ? 'Showing actions assigned to you'
    : role === 'supervisor' || role === 'safety_officer' ? 'Showing your sites and your assignments'
    : readOnlyRole ? 'Read-only executive view'
    : 'Full organisation view'

  return (
    <>
      {/* A stale or forbidden deep link says so rather than opening nothing. */}
      {deepLinkError && (
        <Alert tone="critical" className="mb-3" onDismiss={() => setDeepLinkError(null)}>
          {deepLinkError}
        </Alert>
      )}

      <PageHeader
        title="Corrective Actions"
        subtitle={`Nothing falls through the cracks — ${scopeNote.toLowerCase()}`}
        right={
          !readOnlyRole && ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '') ? (
            <Button icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>New action</Button>
          ) : undefined
        }
      />

      {/* KPI strip — each tile filters the workspace */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPI_DEFS.map((def, i) => {
          const value = stats?.[def.key]
          const active = bucket === def.bucket
          return (
            <button
              key={def.key}
              onClick={() => setBucket(active ? 'all' : def.bucket)}
              className="animate-rise text-left"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <Card className={cn('px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-pop', active && 'ring-2 ring-[var(--accent)]')}>
                <p className="text-2xs font-semibold text-ink-2">{def.label}</p>
                {value === undefined ? (
                  <Skeleton className="mt-1.5 h-7 w-10" />
                ) : (
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: def.tone(value), fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                  </p>
                )}
              </Card>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-xs">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, title, owner, incident…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by owner">
          <option value="">All owners</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority | '')} className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by priority">
          <option value="">All priorities</option>
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
        {bucket !== 'all' && (
          <Badge tone="accent" className="cursor-pointer" >
            <button onClick={() => setBucket('all')}>filter: {bucket.replace('_', ' ')} ✕</button>
          </Badge>
        )}
        <div className="ml-auto min-w-0">
          <Tabs
            items={viewTabs.map((t) => {
              const Icon = VIEW_ICON[t.value]
              return { ...t, badge: <Icon size={13} className="text-muted" /> }
            })}
            value={view}
            onChange={switchView}
            className="border-b-0"
          />
        </div>
      </div>

      {view === 'board' && (
        <KanbanBoard items={items} actor={actor} readOnly={readOnlyRole} onOpen={setOpenId} onChanged={onChanged} />
      )}
      {view === 'list' && (
        <ActionsTable items={items} actor={actor} readOnly={readOnlyRole} sites={sites} onOpen={setOpenId} onChanged={refresh} />
      )}
      {view === 'calendar' && <CalendarView items={items} onOpen={setOpenId} />}
      {view === 'analytics' && <CapaAnalyticsView companyId={company?.id ?? null} sites={sites} />}

      <ActionDrawer
        item={openItem}
        actor={actor}
        readOnly={readOnlyRole}
        onClose={() => setOpenId(null)}
        onChanged={onChanged}
      />

      <NewActionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false)
          refresh()
        }}
      />

      <p className="mt-4 text-2xs text-muted">
        Reminders run automatically: 7 / 3 / 1 days before due, on the due date, when overdue — then escalate to the
        site manager (3+ days late) and HSE Manager (7+ days). {isManager(role ?? '') ? 'Escalations appear in your notification bell.' : ''}
      </p>
    </>
  )
}
