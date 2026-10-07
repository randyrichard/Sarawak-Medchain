import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Megaphone, Plus, Search } from 'lucide-react'
import { toolboxApi, type ToolboxMeeting, type ToolboxToday } from '@/api/toolboxApi'
import { ApiError } from '@/api/types'
import { isBackendConfigured } from '@/api/authApi'
import { useOrg } from '@/features/org/OrgContext'
import { fmtDateTime } from '@/features/incidents/lib'
import {
  Alert, Button, Card, CardBody, DataTable, EmptyState, Input, PageHeader, Skeleton,
  type Column,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { ToolboxDialog } from './ToolboxDialog'
import { ToolboxDetail } from './ToolboxDetail'
import { canDeleteToolbox, canRecordToolbox } from './lib'

/**
 * The daily site toolbox meeting.
 *
 * Opens on today, because the question a safety officer asks first each morning is whether
 * every site has held its briefing yet - the register below is the record an auditor or a
 * client asks to see afterwards.
 */
export function ToolboxPage() {
  const { company, site, role } = useOrg()
  const canRecord = canRecordToolbox(role)

  const [today, setToday] = useState<ToolboxToday | null>(null)
  const [rows, setRows] = useState<ToolboxMeeting[] | null>(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ToolboxMeeting | 'new' | null>(null)
  const [open, setOpen] = useState<ToolboxMeeting | null>(null)
  const [revision, setRevision] = useState(0)

  const load = useCallback(() => {
    if (!company || !isBackendConfigured()) return
    setRows(null)
    toolboxApi.list(company.id, { siteId: site?.id, q: q.trim() || undefined, from: from || undefined, to: to || undefined, pageSize: 100 })
      .then((r) => { setRows(r.rows); setTotal(r.total) })
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the toolbox register.')
      })
    toolboxApi.today(company.id)
      .then(setToday)
      .catch(() => setToday(null))
  }, [company, site, q, from, to])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q, revision])

  const changed = () => setRevision((n) => n + 1)

  if (!isBackendConfigured()) {
    return (
      <>
        <PageHeader title="Toolbox meetings" subtitle="The daily site briefing, on record" />
        <Alert tone="info">Toolbox meetings are recorded on the server. Connect this app to the SafeOps API to use them.</Alert>
      </>
    )
  }

  const todaySites = site ? today?.sites.filter((s) => s.siteId === site.id) : today?.sites

  const columns: Column<ToolboxMeeting>[] = [
    { key: 'number', header: 'Meeting', width: '110px', render: (m) => <span className="font-mono text-xs">{m.number}</span> },
    { key: 'heldAt', header: 'Held', width: '170px', render: (m) => fmtDateTime(m.heldAt) },
    { key: 'site', header: 'Site', visibility: 'hidden md:table-cell', render: (m) => m.site?.name ?? '' },
    {
      key: 'topic', header: 'Topic',
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{m.topic}</p>
          <p className="truncate text-2xs text-muted">Led by {m.ledBy}</p>
        </div>
      ),
    },
    {
      key: 'headcount', header: 'Attendance', align: 'right', width: '120px',
      render: (m) => (
        <div title={m.groups.map((g) => `${g.organisation}: ${g.count}`).join('\n')}>
          <p className="font-semibold text-ink">{m.headcount.toLocaleString()}</p>
          <p className="whitespace-nowrap text-2xs text-muted">{m.groups.length} organisation{m.groups.length === 1 ? '' : 's'}</p>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Toolbox meetings"
        subtitle="The daily site briefing on record — what was covered, who led it and who attended"
        right={canRecord && (
          <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>Record meeting</Button>
        )}
      />

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <Card className="mb-4">
        <CardBody>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Today</h2>
            {today && todaySites && (
              <p className="text-xs text-ink-2">
                <span className="font-semibold text-ink">{todaySites.filter((s) => s.held).length} of {todaySites.length}</span>
                {' '}site{todaySites.length === 1 ? '' : 's'} held their briefing
                {' · '}
                <span className="font-semibold text-ink">{todaySites.reduce((n, s) => n + s.headcount, 0).toLocaleString()}</span> people briefed
              </p>
            )}
          </div>
          {!today ? <Skeleton className="h-10" /> : todaySites && todaySites.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {todaySites.map((s) => (
                <li
                  key={s.siteId}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
                    s.held ? 'border-good/40 bg-good-soft' : 'border-warning/40 bg-warning-soft',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {s.held
                      ? <CheckCircle2 size={15} className="shrink-0 text-good" aria-hidden="true" />
                      : <CircleAlert size={15} className="shrink-0 text-warning" aria-hidden="true" />}
                    <span className="truncate text-sm text-ink">{s.siteName}</span>
                  </span>
                  <span className="shrink-0 text-xs">
                    {s.held
                      ? <><span className="font-semibold text-ink">{s.headcount.toLocaleString()}</span> <span className="text-ink-2">present</span></>
                      : <span className="font-medium text-warning">Not yet held</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No active sites in scope.</p>
          )}
        </CardBody>
      </Card>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Search toolbox meetings"
            placeholder="Topic, hazard, leader or TBM number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        {(from || to || q) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setQ('') }}>Clear</Button>
        )}
      </div>

      {rows === null ? <Skeleton className="h-40" /> : (
        <>
          <DataTable
            caption="Toolbox meetings"
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            onRowClick={setOpen}
            empty={
              <EmptyState icon={Megaphone} title={q || from || to ? 'No meetings match these filters' : 'No toolbox meetings recorded yet'}>
                {canRecord
                  ? 'Record this morning\'s briefing — the topic, who led it and a headcount for each organisation that attended.'
                  : 'Meetings recorded by your site safety team will appear here.'}
              </EmptyState>
            }
          />
          {total > rows.length && (
            <p className="mt-2 text-xs text-muted">Showing the latest {rows.length} of {total}. Narrow the dates to see older meetings.</p>
          )}
        </>
      )}

      {company && editing && (
        <ToolboxDialog
          companyId={company.id}
          meeting={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); setOpen(m); changed() }}
        />
      )}

      {company && open && !editing && (
        <ToolboxDetail
          companyId={company.id}
          meeting={open}
          canEdit={canRecord}
          canDelete={canDeleteToolbox(role)}
          onClose={() => setOpen(null)}
          onEdit={() => setEditing(open)}
          onDeleted={() => { setOpen(null); changed() }}
        />
      )}
    </>
  )
}
