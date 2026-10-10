import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Users, Search } from 'lucide-react'
import {
  VISITOR_STATUS_LABEL, VISITOR_STATUS_TONE, visitorsApi,
  type Visitor, type VisitorFilters,
} from '@/api/visitorsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { fmtDateTime } from '@/features/incidents/lib'
import { Alert, Badge, Button, Input, PageHeader, Select, Skeleton, Tabs, type TabItem } from '@/components/ui'
import { NewVisitorDialog } from './components/NewVisitorDialog'
import { VisitorDrawer } from './components/VisitorDrawer'
import { VisitorBoard } from './components/VisitorBoard'
import { BlacklistPanel } from './components/BlacklistPanel'
import { cn } from '@/lib/cn'

type View = 'register' | 'board' | 'blacklist'

const STATUSES: NonNullable<VisitorFilters['status']>[] = [
  'all', 'on_site', 'today', 'overdue', 'pre_registered', 'waiting',
  'checked_out', 'expired', 'denied', 'blacklisted', 'cancelled',
]

/**
 * Visitor management.
 *
 * The board is the default view rather than the register, because the question this module
 * exists to answer - who is inside the fence - is a live count, not a list of bookings.
 */
export function VisitorsPage() {
  const { company, site } = useOrg()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<View>((params.get('view') as View) ?? 'board')
  // Home links straight to "on site", "expected today" and "overdue out".
  const [status, setStatus] = useState<NonNullable<VisitorFilters['status']>>(() => {
    const asked = params.get('status') as NonNullable<VisitorFilters['status']> | null
    return asked && STATUSES.includes(asked) ? asked : 'all'
  })
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Visitor[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  /** Bumped by anything that writes, so the board and the register re-read together. */
  const [revision, setRevision] = useState(0)

  const load = useCallback(() => {
    if (!company) return
    setRows(null)
    visitorsApi.list(company.id, { status, q: q.trim() || undefined, siteId: site?.id })
      .then((r) => { setRows(r.rows); setTotal(r.total) })
      .catch((e) => {
        // A rejected request must not render as an empty register: "nobody is on site"
        // is the most dangerous wrong answer this screen can give.
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the visitor register.')
      })
  }, [company, status, q, site])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q, revision])

  const switchView = (v: View) => {
    setView(v)
    params.set('view', v)
    setParams(params, { replace: true })
  }

  const openVisit = (id: string | null) => {
    setOpenId(id)
    if (id) params.set('open', id)
    else params.delete('open')
    setParams(params, { replace: true })
  }

  const changed = () => setRevision((n) => n + 1)

  const tabs: TabItem<View>[] = [
    { value: 'board', label: 'Live board' },
    { value: 'register', label: 'Register' },
    { value: 'blacklist', label: 'Blacklist' },
  ]

  const filterLabel = (s: NonNullable<VisitorFilters['status']>) =>
    s === 'all' ? 'All visits'
      : s === 'on_site' ? 'On site now'
        : s === 'today' ? 'Expected today'
          : s === 'overdue' ? 'Overdue'
            : VISITOR_STATUS_LABEL[s]

  return (
    <>
      <PageHeader
        title="Visitors"
        subtitle="Register visitors, check them in after they accept the site rules, and know who is on site in an emergency"
        right={
          <Button icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
            Register visitor
          </Button>
        }
      />

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <Tabs items={tabs} value={view} onChange={switchView} className="mb-4" />

      {view === 'board' && company && (
        <VisitorBoard
          companyId={company.id} siteId={site?.id} revision={revision}
          onOpen={openVisit}
        />
      )}

      {view === 'blacklist' && company && (
        <BlacklistPanel companyId={company.id} onChanged={changed} />
      )}

      {view === 'register' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                aria-label="Search visitors"
                placeholder="Name, IC, company, vehicle, badge or host…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value as NonNullable<VisitorFilters['status']>)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{filterLabel(s)}</option>)}
            </Select>
          </div>

          {rows === null ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted">
              No visits match. Register one to get started.
            </p>
          ) : (
            <>
              <p className="mb-2 text-2xs text-muted">{total} visit{total === 1 ? '' : 's'}</p>
              {/*
                Cards rather than a table: the register is read on a phone at a gatehouse
                more often than at a desk, and the fields that matter there are the name,
                who they are for and whether they are inside.
              */}
              <ul className="space-y-2">
                {rows.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => openVisit(v.id)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition hover:border-accent hover:bg-accent-soft/30',
                        v.overdueMinutes !== null && 'border-critical/60 bg-critical-soft/20',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{v.name}</span>
                        <Badge tone={VISITOR_STATUS_TONE[v.status]}>{v.statusLabel}</Badge>
                        {v.overdueMinutes !== null && (
                          <Badge tone="critical">
                            {v.overdueMinutes < 60
                              ? `${v.overdueMinutes} min overdue`
                              : `${Math.floor(v.overdueMinutes / 60)}h overdue`}
                          </Badge>
                        )}
                        {v.badgeNumber && <Badge tone="neutral">Badge {v.badgeNumber}</Badge>}
                      </div>
                      <p className="mt-0.5 text-2xs text-muted">
                        <span className="font-mono">{v.code}</span>
                        {v.visitorCompany && <> · {v.visitorCompany}</>}
                        {v.hostNameAtBooking && <> · host {v.hostNameAtBooking}</>}
                        {v.vehicleNumber && <> · {v.vehicleNumber}</>}
                      </p>
                      <p className="text-2xs text-muted">
                        {v.checkedInAt
                          ? `In ${fmtDateTime(v.checkedInAt)}${v.checkedOutAt ? ` · out ${fmtDateTime(v.checkedOutAt)}` : ''}`
                          : `Expected ${fmtDateTime(v.expectedArrival)}`}
                        {v.durationLabel && <> · {v.durationLabel}</>}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <NewVisitorDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => { setNewOpen(false); changed(); openVisit(id) }}
      />

      <VisitorDrawer
        visitorId={openId}
        onClose={() => openVisit(null)}
        onChanged={changed}
      />
    </>
  )
}

export { Users }
