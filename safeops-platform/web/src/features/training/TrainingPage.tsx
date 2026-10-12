import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api } from '@/api/client'
import type { CertificateView, CourseView, SessionView, TrainingMatrix, TrainingStats } from '@/api/training'
import { useOrg } from '@/features/org/OrgContext'
import { useActor } from '@/features/incidents/lib'
import { Button, Card, PageHeader, Skeleton, Tabs, type TabItem, AttentionIcon, attentionOf, attentionStripe } from '@/components/ui'
import { cn } from '@/lib/cn'
import { canManageTraining, canRunSessions } from './lib'
import { TrainingOverview } from './components/TrainingOverview'
import { CompetencyMatrix } from './components/CompetencyMatrix'
import { CatalogPanel } from './components/CatalogPanel'
import { SessionsPanel } from './components/SessionsPanel'
import { CertificatesPanel } from './components/CertificatesPanel'
import { EmployeeTrainingDrawer } from './components/EmployeeTrainingDrawer'
import { NewSessionDialog } from './components/NewSessionDialog'

type View = 'overview' | 'matrix' | 'catalog' | 'sessions' | 'certificates'

export function TrainingPage() {
  const { company, role, site } = useOrg()
  const actor = useActor()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<View>((params.get('view') as View) || 'overview')
  const [stats, setStats] = useState<TrainingStats | null>(null)
  const [matrix, setMatrix] = useState<TrainingMatrix | null>(null)
  const [courses, setCourses] = useState<CourseView[] | null>(null)
  const [sessions, setSessions] = useState<SessionView[] | null>(null)
  const [certs, setCerts] = useState<CertificateView[] | null>(null)
  const [openEmployee, setOpenEmployee] = useState<string | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)

  const manage = canManageTraining(role)
  const runner = canRunSessions(role)

  const refresh = useCallback(() => {
    if (!company) return
    api.trainingStats(company.id).then(setStats)
    api.trainingMatrix(company.id, actor).then(setMatrix)
    api.listCourses(company.id).then(setCourses)
    api.listSessions(company.id, { siteId: site?.id, status: 'all' }).then(setSessions)
    api.listCertificates(company.id, { siteId: site?.id, status: 'all' }, actor).then(setCerts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, site?.id, actor.name, actor.role])

  useEffect(() => { refresh() }, [refresh])

  // QR verification deep link: /training?verify=CERT-... → jump to certificates
  useEffect(() => {
    if (params.get('verify')) switchView('certificates')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * One certificate: /training?cert=<id>, from search and from the expiry reminders. It
   * opened the overview and left the certificate to be found by hand. It now opens the
   * holder's training record, where the certificate can be renewed.
   */
  const certParam = params.get('cert')
  useEffect(() => {
    if (!certParam || certs === null) return
    const cert = certs.find((c) => c.id === certParam)
    params.delete('cert')
    switchView('certificates')
    if (cert) setOpenEmployee(cert.employeeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certParam, certs])

  const switchView = (v: View) => {
    setView(v)
    params.set('view', v)
    setParams(params, { replace: true })
  }

  const KPIS: { label: string; value: string | number | undefined; tone?: string }[] = [
    { label: 'Training Compliance', value: stats !== null ? `${stats.compliancePct}%` : undefined, tone: stats ? (stats.compliancePct >= 90 ? 'var(--good)' : stats.compliancePct >= 80 ? 'var(--warning)' : 'var(--critical)') : undefined },
    { label: 'Fully Trained', value: stats ? `${stats.employeesTrained}/${stats.totalEmployees}` : undefined },
    { label: 'Overdue (Mandatory)', value: stats?.employeesOverdue, tone: stats && stats.employeesOverdue > 0 ? 'var(--critical)' : 'var(--good)' },
    { label: 'Expiring ≤90 Days', value: stats?.expiring90, tone: stats && stats.expiring90 > 0 ? 'var(--warning)' : 'var(--good)' },
    { label: 'Upcoming Sessions', value: stats?.upcomingSessions },
    { label: 'Training Hours (Month)', value: stats?.trainingHoursMonth },
  ]

  const viewTabs: TabItem<View>[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'matrix', label: 'Competency Matrix' },
    { value: 'catalog', label: 'Catalog' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'certificates', label: 'Certificates' },
  ]

  const scopeNote =
    role === 'employee' ? 'Showing your own training record'
    : role === 'supervisor' ? 'Showing your site'
    : role === 'ceo' ? 'Read-only executive view'
    : 'Full workforce view'

  return (
    <>
      <PageHeader
        title="Training & Competency"
        subtitle={`Courses, sessions and certificates: who is qualified for which work, and what is about to expire. ${scopeNote}.`}
        right={runner ? <Button icon={<Plus size={15} />} onClick={() => setNewSessionOpen(true)}>New Session</Button> : undefined}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k, i) => (
          <Card key={k.label} className="animate-rise px-4 py-3" style={attentionStripe(attentionOf(k.tone))}>
            <p className="text-2xs font-semibold text-ink-2" style={{ animationDelay: `${i * 35}ms` }}>{k.label}</p>
            {k.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-12" />
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight" style={{ color: k.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {k.value}
              <AttentionIcon level={attentionOf(k.tone)} /></p>
            )}
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="ml-auto min-w-0">
          <Tabs items={viewTabs} value={view} onChange={switchView} className={cn('border-b-0')} />
        </div>
      </div>

      {view === 'overview' && <TrainingOverview stats={stats} />}
      {view === 'matrix' && <CompetencyMatrix matrix={matrix} onOpenEmployee={setOpenEmployee} />}
      {view === 'catalog' && <CatalogPanel courses={courses} manage={manage} onChanged={refresh} />}
      {view === 'sessions' && (
        <SessionsPanel sessions={sessions} actor={actor} runner={runner} onOpenNew={() => setNewSessionOpen(true)} onChanged={refresh} />
      )}
      {view === 'certificates' && (
        <CertificatesPanel
          certs={certs}
          initialVerify={params.get('verify') ?? undefined}
          onOpenEmployee={setOpenEmployee}
        />
      )}

      <EmployeeTrainingDrawer
        employeeId={openEmployee}
        actor={actor}
        manage={manage}
        onClose={() => setOpenEmployee(null)}
        onChanged={refresh}
      />

      <NewSessionDialog open={newSessionOpen} onClose={() => setNewSessionOpen(false)} onCreated={() => { setNewSessionOpen(false); refresh() }} />

      <p className="mt-4 text-2xs text-muted">
        Passing a session issues a certificate automatically; expiring certificates trigger 90/60/30/7-day reminders,
        and lapsed mandatory training escalates to line managers.
      </p>
    </>
  )
}
