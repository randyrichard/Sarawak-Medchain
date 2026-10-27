import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Plus, ShieldAlert } from 'lucide-react'
import { isBackendConfigured } from '@/api/authApi'
import {
  LIKELIHOOD, RISK_ACTION, RISK_LEVEL_LABEL, riskApi, SEVERITY,
  type RiskAttention, type RiskLevel, type RiskRegister, type RiskRow,
} from '@/api/riskApi'
import {
  Button, Card, CardBody, CardHeader, Checkbox, DataTable, EmptyState, ErrorAlert, Input, NotInDemo, PageHeader, Select,
  Skeleton, Tabs, type Column,
} from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { saveBlob } from '@/lib/saveBlob'
import { RiskMatrix } from './RiskMatrix'
import { controlsBadge, fmtDay, RiskBadge, RiskDetailDialog, RiskEditDialog } from './RiskDialogs'

/**
 * The HIRARC register: every hazard of every work activity, the risk it carries now and once
 * its recommended controls are in place, and where those controls stand.
 *
 * The matrix is the picture a DOSH officer and a management review ask for first; the
 * table underneath is the register itself, and a cell of the matrix narrows it. What each
 * row still needs - further controls, a date, a review - is the server's judgement
 * (api/src/domain/hirarc.ts), shown here as it is given.
 */
export function RiskRegisterPage() {
  return (
    <>
      <PageHeader
        title="HIRARC Register"
        subtitle="The hazards of each work activity, the risk they carry, and the controls that bring it down"
      />
      {isBackendConfigured() ? <LiveRegister /> : (
        <Card>
          <CardBody>
            <NotInDemo>
              The HIRARC register needs the server. In a live workspace each hazard is rated on the DOSH 5 × 5 matrix,
              its recommended controls become corrective actions, and reviews fall due on their date.
            </NotInDemo>
          </CardBody>
        </Card>
      )}
    </>
  )
}

type Cell = { likelihood: number; severity: number }

const ATTENTION_LABEL: Record<RiskAttention, string> = {
  needs_controls: 'Medium or High, No Further Controls',
  controls_overdue: 'Controls Past Their Date',
  review_overdue: 'Review Overdue',
}

function LiveRegister() {
  const { company, site, sites } = useOrg()
  const [data, setData] = useState<RiskRegister | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [view, setView] = useState<'now' | 'residual'>('now')
  const [cell, setCell] = useState<Cell | null>(null)
  const [level, setLevel] = useState<RiskLevel | ''>('')
  const [attention, setAttention] = useState<RiskAttention | ''>('')
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [open, setOpen] = useState<RiskRow | null>(null)
  const [editing, setEditing] = useState<RiskRow | 'new' | null>(null)

  const companyId = company?.id
  // Two filters pressed in quick succession race; only the answer to the last one is shown.
  const latest = useRef(0)
  const load = useCallback(async () => {
    if (!companyId) return
    const mine = ++latest.current
    setLoading(true)
    try {
      setError(null)
      const answer = await riskApi.list(companyId, {
        siteId: site?.id, level: level || null, attention: attention || null, q, archived,
        likelihood: cell?.likelihood, severity: cell?.severity, residual: view === 'residual',
      })
      if (mine === latest.current) setData(answer)
    } catch (e) {
      if (mine === latest.current) setError(e)
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [companyId, site?.id, level, attention, q, archived, cell, view])

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const changed = (row: RiskRow) => { setOpen(row); void load() }

  const exportCsv = async () => {
    if (!companyId) return
    try {
      saveBlob(await riskApi.exportCsv(companyId, site?.id), `hirarc-register${site ? `-${site.short || site.name}` : ''}.csv`)
    } catch (e) {
      setError(e)
    }
  }

  if (!company) return <Skeleton className="h-64" />

  const columns: Column<RiskRow>[] = [
    {
      key: 'code', header: 'Ref', width: '6.5rem', visibility: 'hidden sm:table-cell',
      render: (r) => <span className="whitespace-nowrap font-medium tabular-nums text-ink">{r.code}</span>, sortValue: (r) => r.code,
    },
    {
      key: 'hazard', header: 'Hazard',
      render: (r) => (
        <span className="block min-w-0">
          <span className="block font-medium text-ink">{r.hazard}</span>
          {/* The reference moves in here on a phone, where its own column squeezed the hazard to a word a line. */}
          <span className="block text-xs text-ink-2"><span className="sm:hidden">{r.code} · </span>{r.activity} · {r.effect}</span>
        </span>
      ),
      sortValue: (r) => r.hazard.toLowerCase(),
    },
    { key: 'site', header: 'Site', visibility: 'hidden lg:table-cell', render: (r) => r.siteName, sortValue: (r) => r.siteName },
    { key: 'risk', header: 'Risk', width: '7.5rem', render: (r) => <RiskBadge score={r.riskScore} />, sortValue: (r) => r.riskScore },
    {
      key: 'residual', header: 'Once Controlled', width: '8.5rem', visibility: 'hidden md:table-cell',
      render: (r) => (r.residualScore !== null ? <RiskBadge score={r.residualScore} /> : <span className="text-muted">—</span>),
      sortValue: (r) => r.residualScore,
    },
    { key: 'controls', header: 'Controls', width: '8rem', render: controlsBadge },
    {
      key: 'review', header: 'Next Review', width: '8.5rem', visibility: 'hidden sm:table-cell',
      render: (r) => <span className={r.reviewOverdue ? 'font-semibold text-critical' : 'text-ink-2'}>{fmtDay(r.reviewDue)}</span>,
      sortValue: (r) => r.reviewDue,
    },
  ]

  const counts = data?.counts
  const matrix = data ? (view === 'now' ? data.matrix.now : data.matrix.residual) : null
  const cellLabel = cell
    ? `${LIKELIHOOD.find((l) => l.value === cell.likelihood)!.label} × ${SEVERITY.find((s) => s.value === cell.severity)!.label}`
    : null

  return (
    <div className="space-y-4">
      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Risk Matrix"
            subtitle={view === 'now' ? 'Live hazards by the risk they carry now.' : 'Hazards whose risk once controlled has been rated.'}
          />
          <CardBody className="space-y-3">
            <Tabs
              label="Which risk the matrix shows"
              value={view}
              onChange={(v) => { setView(v); setCell(null) }}
              items={[{ value: 'now', label: 'Now' }, { value: 'residual', label: 'Once Controlled' }]}
            />
            {matrix ? (
              <RiskMatrix counts={matrix} selected={cell} onSelect={setCell} label={view === 'now' ? 'Risk now' : 'Risk once controlled'} />
            ) : <Skeleton className="h-72" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What Needs Doing" subtitle="Across the live register, for the site you have chosen." />
          <CardBody className="space-y-2">
            {counts ? (
              <>
                <p className="text-sm text-ink">
                  <span className="font-semibold">{counts.high}</span> high, <span className="font-semibold">{counts.medium}</span> medium,
                  {' '}<span className="font-semibold">{counts.low}</span> low.
                </p>
                {([
                  ['needs_controls', counts.needsControls], ['controls_overdue', counts.controlsOverdue], ['review_overdue', counts.reviewOverdue],
                ] as const).map(([key, n]) => (
                  <button
                    key={key} type="button" disabled={n === 0}
                    onClick={() => { setAttention(attention === key ? '' : key); setCell(null) }}
                    aria-pressed={attention === key}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-sunken/60 disabled:cursor-default disabled:opacity-60 aria-pressed:border-accent aria-pressed:bg-accent-soft"
                  >
                    <span className="text-ink">{ATTENTION_LABEL[key]}</span>
                    <span className="font-semibold tabular-nums text-ink">{n}</span>
                  </button>
                ))}
                <ul className="space-y-1.5 pt-2 text-xs text-ink-2">
                  {(['high', 'medium', 'low'] as const).map((b) => (
                    <li key={b}><span className="font-semibold text-ink">{RISK_LEVEL_LABEL[b]}:</span> {RISK_ACTION[b]}</li>
                  ))}
                </ul>
              </>
            ) : <Skeleton className="h-40" />}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Register"
          subtitle={cellLabel ? `Showing ${cellLabel}${view === 'residual' ? ', once controlled' : ''}.` : 'Highest risk first. Open a row for the whole assessment.'}
          right={(
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void exportCsv()}><Download size={14} aria-hidden /> Export CSV</Button>
              {data?.canEdit && <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden /> Add Hazard</Button>}
            </div>
          )}
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-64">
              <Input aria-label="Search the register" placeholder="Search hazards, activities, people" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Risk band" value={level} onChange={(e) => setLevel(e.target.value as RiskLevel | '')}>
              <option value="">Every band</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
            <Select aria-label="What a row still needs" value={attention} onChange={(e) => setAttention(e.target.value as RiskAttention | '')}>
              <option value="">Anything</option>
              {(Object.keys(ATTENTION_LABEL) as RiskAttention[]).map((k) => <option key={k} value={k}>{ATTENTION_LABEL[k]}</option>)}
            </Select>
            <Checkbox label="Archived" checked={archived} onChange={(e) => { setArchived(e.target.checked); setCell(null) }} />
            {(cell || level || attention || q) && (
              <Button variant="ghost" size="sm" onClick={() => { setCell(null); setLevel(''); setAttention(''); setQ('') }}>Clear Filters</Button>
            )}
          </div>
          {data === null ? <Skeleton className="h-40" /> : (
            <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <DataTable
                caption="HIRARC register"
                columns={columns}
                rows={data.rows}
                rowKey={(r) => r.id}
                onRowClick={setOpen}
                empty={(
                  <EmptyState icon={ShieldAlert} title={cell || level || attention || q || archived ? 'No hazards match' : 'No hazards assessed yet'}>
                    {cell || level || attention || q || archived
                      ? 'Clear the filters to see the whole register.'
                      : data.canEdit
                        ? 'Add the hazards of each work activity, or import the HIRARC spreadsheet you already keep from Import Data.'
                        : 'Hazards your safety team assesses will appear here.'}
                  </EmptyState>
                )}
              />
              {data.capped && <p className="mt-2 text-xs text-muted">Showing the first {data.rows.length} of {data.total}, highest risk first. Narrow by site or band to see the rest.</p>}
            </div>
          )}
        </CardBody>
      </Card>

      {open && !editing && (
        <RiskDetailDialog row={open} onClose={() => setOpen(null)} onEdit={() => setEditing(open)} onChanged={changed} />
      )}
      {editing && (
        <RiskEditDialog
          companyId={company.id}
          sites={sites}
          defaultSiteId={site?.id ?? sites[0]?.id ?? ''}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => { setEditing(null); changed(row) }}
        />
      )}
    </div>
  )
}
