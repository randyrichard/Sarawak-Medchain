import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarClock, ClipboardCheck, FileText, LineChart, Plus, ScrollText, Search, ShieldCheck,
} from 'lucide-react'
import { api } from '@/api/client'
import type {
  AuditFindingView, AuditStats, AuditView, ComplianceDocument, ObligationView,
} from '@/api/audits'
import { useOrg } from '@/features/org/OrgContext'
import { useActor } from '@/features/incidents/lib'
import { Badge, Button, Card, PageHeader, Skeleton, StatusPill, Tabs, type TabItem } from '@/components/ui'
import { cn } from '@/lib/cn'
import { isComplianceManager, scoreColor, AUDIT_STATUS_META } from './lib'
import { AUDIT_TYPE_LABEL } from '@/api/audits'
import { AuditDrawer } from './components/AuditDrawer'
import { PlanAuditDialog } from './components/PlanAuditDialog'
import { FindingsList } from './components/FindingsList'
import { ComplianceRegister } from './components/ComplianceRegister'
import { DocumentsPanel } from './components/DocumentsPanel'
import { AuditAnalyticsView } from './components/AuditAnalyticsView'
import { Avatar } from '@/components/ui'

type View = 'audits' | 'findings' | 'compliance' | 'documents' | 'analytics'

export function AuditsPage() {
  const { company, role, site, sites } = useOrg()
  const actor = useActor()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<View>((params.get('view') as View) || 'audits')
  const [q, setQ] = useState('')
  const [audits, setAudits] = useState<AuditView[] | null>(null)
  const [findings, setFindings] = useState<AuditFindingView[] | null>(null)
  const [obligations, setObligations] = useState<ObligationView[] | null>(null)
  const [documents, setDocuments] = useState<ComplianceDocument[] | null>(null)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [openAuditId, setOpenAuditId] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)

  const manage = isComplianceManager(role)

  const refresh = useCallback(() => {
    if (!company) return
    api.listAudits(company.id, { q, siteId: site?.id }).then(setAudits)
    api.listFindings(company.id).then(setFindings)
    api.listObligations(company.id).then(setObligations)
    api.listDocuments(company.id).then(setDocuments)
    api.auditStats(company.id).then(setStats)
  }, [company, q, site?.id])

  useEffect(() => {
    setAudits(null)
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  const switchView = (v: View) => {
    setView(v)
    params.set('view', v)
    setParams(params, { replace: true })
  }

  const KPIS: { label: string; value: string | number | undefined; tone?: string }[] = [
    { label: 'Audit readiness', value: stats !== null ? `${stats.readiness}` : undefined, tone: stats ? scoreColor(stats.readiness) : undefined },
    { label: 'Compliance', value: stats !== null ? `${stats.compliancePct}%` : undefined, tone: stats && stats.compliancePct < 85 ? 'var(--serious)' : 'var(--good)' },
    { label: 'Upcoming (30d)', value: stats?.upcoming30d },
    { label: 'Open findings', value: stats?.openFindings, tone: stats && stats.openFindings > 0 ? 'var(--warning)' : 'var(--good)' },
    { label: 'Critical findings', value: stats?.criticalFindings, tone: stats && stats.criticalFindings > 0 ? 'var(--critical)' : 'var(--good)' },
    { label: 'Avg. audit score', value: stats?.avgScore !== null && stats !== null ? `${stats.avgScore}%` : stats === null ? undefined : '—' },
  ]

  const viewTabs: TabItem<View>[] = [
    { value: 'audits', label: 'Audits', badge: <CalendarClock size={13} className="text-muted" /> },
    { value: 'findings', label: 'Findings', badge: <ClipboardCheck size={13} className="text-muted" /> },
    { value: 'compliance', label: 'Compliance', badge: <ShieldCheck size={13} className="text-muted" /> },
    { value: 'documents', label: 'Documents', badge: <FileText size={13} className="text-muted" /> },
    { value: 'analytics', label: 'Analytics', badge: <LineChart size={13} className="text-muted" /> },
  ]

  return (
    <>
      <PageHeader
        title="Audit & Compliance"
        subtitle="Audit-ready every day — not just when the auditor is in the car park"
        right={manage ? <Button icon={<Plus size={15} />} onClick={() => setPlanOpen(true)}>Plan audit</Button> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k, i) => (
          <Card key={k.label} className="animate-rise px-4 py-3" >
            <p className="text-2xs font-semibold text-ink-2" style={{ animationDelay: `${i * 35}ms` }}>{k.label}</p>
            {k.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-10" />
            ) : (
              <p className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: k.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(view === 'audits' || view === 'findings' || view === 'documents') && (
          <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border bg-surface px-3 py-2 md:max-w-xs">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={view === 'documents' ? 'Search documents…' : 'Search audit, auditor, finding…'}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </div>
        )}
        <div className="ml-auto">
          <Tabs items={viewTabs} value={view} onChange={switchView} className="border-b-0" />
        </div>
      </div>

      {view === 'audits' && <AuditsList audits={audits} sites={sites} onOpen={setOpenAuditId} />}
      {view === 'findings' && <FindingsList findings={findings} q={q} onOpenAudit={setOpenAuditId} />}
      {view === 'compliance' && <ComplianceRegister obligations={obligations} manage={manage} sites={sites} onChanged={refresh} />}
      {view === 'documents' && <DocumentsPanel documents={documents} q={q} role={role} onChanged={refresh} />}
      {view === 'analytics' && <AuditAnalyticsView stats={stats} sites={sites} />}

      <AuditDrawer
        auditId={openAuditId}
        actor={actor}
        manage={manage}
        sites={sites}
        onClose={() => setOpenAuditId(null)}
        onChanged={refresh}
      />

      <PlanAuditDialog open={planOpen} onClose={() => setPlanOpen(false)} onCreated={() => { setPlanOpen(false); refresh() }} />
      <p className="mt-4 text-2xs text-muted">
        <ScrollText size={11} className="mr-1 inline" />
        Findings auto-create corrective actions; audits cannot close until every finding's action is verified.
      </p>
    </>
  )
}

function AuditsList({
  audits, sites, onOpen,
}: {
  audits: AuditView[] | null
  sites: { id: string; short: string }[]
  onOpen: (id: string) => void
}) {
  if (audits === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</Card>
  }
  const siteShort = (id: string) => sites.find((s) => s.id === id)?.short ?? id.toUpperCase()
  return (
    <Card>
      {audits.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">No audits in scope — plan one to get started.</p>
      ) : (
        <ul className="divide-y">
          {audits.map((a) => (
            <li key={a.id}>
              <button onClick={() => onOpen(a.id)} className={cn('flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent-soft/40', a.overdue && 'bg-critical-soft/40')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink">{a.title}</p>
                  <p className="mt-0.5 text-2xs text-muted">
                    <span className="font-mono">{a.code}</span> · {AUDIT_TYPE_LABEL[a.type]} · {siteShort(a.siteId)} · {a.department} · {a.templateName}
                  </p>
                </div>
                <span className="flex items-center gap-1" title={`Lead: ${a.leadAuditor}${a.team.length ? ` · Team: ${a.team.join(', ')}` : ''}`}>
                  <Avatar name={a.leadAuditor} size={22} />
                  {a.team.slice(0, 2).map((t) => <Avatar key={t} name={t} size={22} className="-ml-2 ring-2 ring-[var(--surface)]" />)}
                </span>
                <span className={cn('w-24 text-xs font-semibold', a.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {a.scheduledFor}
                  <span className="block text-2xs font-normal text-muted">{a.durationDays} day{a.durationDays > 1 ? 's' : ''} · {a.priority}</span>
                </span>
                {a.score !== undefined && (
                  <span className="w-12 text-right text-base font-bold" style={{ color: scoreColor(a.score), fontVariantNumeric: 'tabular-nums' }}>
                    {a.score}%
                  </span>
                )}
                {a.openFindings > 0 && <Badge tone={a.criticalFindings > 0 ? 'critical' : 'warning'}>{a.openFindings} open finding{a.openFindings > 1 ? 's' : ''}</Badge>}
                <StatusPill kind={AUDIT_STATUS_META[a.status].kind} label={a.overdue ? 'Overdue to start' : a.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
