import { useCallback, useEffect, useState } from 'react'
import { Download, Play, Plus, Pencil, Trash2, Mail, MailWarning, Printer } from 'lucide-react'
import {
  reportsApi,
  type ReportData, type ReportRun, type ReportSchedule, type ReportScope,
  type ReportType,
} from '@/api/reportsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { fmtDateTime } from '@/features/incidents/lib'
import {
  Alert, Badge, Button, Card, CardBody, PageHeader, Select, Skeleton, Tabs, type TabItem,
  StatusPill,
} from '@/components/ui'
import { ScheduleDialog } from './components/ScheduleDialog'
import {
  canDownloadRun, canManageReports, deliveryBadge, recipientSummary, runFlashMessage,
} from './lib'
import { ReportSectionView } from './components/ReportSectionView'
import { cn } from '@/lib/cn'
import { useUrlState } from '@/lib/useUrlState'
import { saveBlob } from '@/lib/saveBlob'

/**
 * Reports.
 *
 * Two things an HSE manager wants on a Monday - what is overdue, and what is still being
 * investigated - and one they want at month end, which is the month they have just had.
 *
 * Everything here is generated from current data on request; there is no cached report,
 * because a stale safety report is worse than none. The monthly summary is the exception
 * that proves it: it covers a closed period, so re-running it tomorrow gives the same
 * answer, which is the point of a document somebody files.
 */
const VIEWS = ['reports', 'schedules', 'history'] as const
type View = (typeof VIEWS)[number]

const REPORT_CARDS: { type: ReportType; title: string; blurb: string }[] = [
  {
    type: 'overdue_actions',
    title: 'Overdue corrective actions',
    blurb: 'Every open action past its due date, with the owner and how long it has been outstanding.',
  },
  {
    type: 'open_investigations',
    title: 'Open investigations',
    blurb: 'Incidents still under investigation, how long they have been open, and what is missing.',
  },
  {
    type: 'weekly_actions',
    title: 'Weekly corrective actions',
    blurb: 'Every open action by department, overdue first, with owners and due dates — the weekly '
      + 'list for the heads-of-department meeting. Schedule it for Friday morning.',
  },
  {
    type: 'site_activity',
    title: 'Site activity summary',
    blurb: 'What happened on site today or over the last 7 days: incidents, toolbox meetings, '
      + 'permits, inspections and actions — for a manager or a shift handover.',
  },
  {
    type: 'monthly_summary',
    title: 'Monthly safety summary',
    blurb: 'The month just finished: what was reported, what it cost, and how many actions closed. '
      + 'Always the last complete month, cut in the site timezone.',
  },
]

export function ReportsPage() {
  const { company, role, project, projects, site, sites } = useOrg()
  const [view, setView] = useUrlState<View>('tab', 'reports', VIEWS)

  const [preview, setPreview] = useState<ReportData | null>(null)
  const [previewing, setPreviewing] = useState<ReportType | null>(null)
  /*
   * The monthly report's own scope, kept separate from the header's project/site pickers.
   *
   * It starts from those - an HSE manager who has already narrowed to a job expects the
   * report to follow - but it is then editable here, because assembling last quarter means
   * changing the month three times without touching what the rest of the app is showing.
   */
  const [scope, setScope] = useState<ReportScope>({})
  const [activityPeriod, setActivityPeriod] = useState<'day' | 'week'>('day')

  /*
   * Seeded from the header pickers, once.
   *
   * An HSE manager who has already narrowed to a project expects the report to follow -
   * having to choose the same job twice on the same screen reads as the filter not working.
   * It is a starting point rather than a binding: the controls below stay editable, because
   * assembling a quarter means changing the month three times without dragging every other
   * screen along.
   *
   * Keyed on the ids so switching project in the header re-seeds, but typing in the report's
   * own controls does not get overwritten on the next render.
   */
  useEffect(() => {
    setScope((cur) => ({ ...cur, projectId: project?.id, siteId: site?.id }))
  }, [project?.id, site?.id])
  const [schedules, setSchedules] = useState<ReportSchedule[] | null>(null)
  const [runs, setRuns] = useState<ReportRun[] | null>(null)
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; editing: ReportSchedule | null }>(
    { open: false, editing: null },
  )

  const manage = canManageReports(role)

  const loadSchedules = useCallback(() => {
    if (!company) return
    reportsApi.listSchedules(company.id)
      .then(setSchedules)
      .catch((e) => {
        setSchedules([])
        setError(e instanceof ApiError ? e.message : 'Could not load the schedules.')
      })
  }, [company])

  const loadRuns = useCallback(() => {
    if (!company) return
    reportsApi.history(company.id)
      .then(setRuns)
      .catch(() => setRuns([]))
  }, [company])

  useEffect(() => {
    if (!company) return
    reportsApi.catalog().then((c) => setMailConfigured(c.mailConfigured)).catch(() => setMailConfigured(null))
    loadSchedules()
    loadRuns()
  }, [company, loadSchedules, loadRuns])

  const say = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 6000) }

  /**
   * The monthly report takes the whole scope. The two summaries follow the site or project
   * chosen - a head of department wants their site's list - but not a month; the two
   * original reports answer "right now" for everyone.
   */
  const scopeFor = (type: ReportType): ReportScope =>
    type === 'monthly_summary' ? scope
      : type === 'weekly_actions' ? { siteId: scope.siteId, projectId: scope.projectId }
        : type === 'site_activity' ? { siteId: scope.siteId, projectId: scope.projectId, period: activityPeriod }
          : {}

  const openPreview = async (type: ReportType) => {
    if (!company) return
    setPreviewing(type)
    setPreview(null)
    setError(null)
    try {
      setPreview(await reportsApi.preview(company.id, type, scopeFor(type)))
    } catch (e) {
      setPreviewing(null)
      setError(e instanceof ApiError ? e.message : 'Could not build that report.')
    }
  }

  const download = async (fn: () => Promise<Blob>, name: string) => {
    try {
      const b = await fn()
      saveBlob(b, name)
    } catch {
      setError('Could not download that report.')
    }
  }

  const run = async (s: ReportSchedule) => {
    setBusy(s.id)
    setError(null)
    try {
      const res = await reportsApi.runNow(s.id)
      say(runFlashMessage({
        name: s.name,
        recipientCount: s.recipients.length,
        mailConfigured,
        rowCount: res.rowCount,
      }))
      loadSchedules()
      loadRuns()
      setView('history')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That report could not be run.')
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (s: ReportSchedule) => {
    setBusy(s.id)
    try {
      await reportsApi.updateSchedule(s.id, { enabled: !s.enabled })
      loadSchedules()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that schedule.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (s: ReportSchedule) => {
    setBusy(s.id)
    try {
      await reportsApi.deleteSchedule(s.id)
      loadSchedules()
      say(`${s.name} deleted. Its run history is kept.`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that schedule.')
    } finally {
      setBusy(null)
    }
  }

  const tabs: TabItem<View>[] = [
    { value: 'reports', label: 'Reports' },
    { value: 'schedules', label: 'Scheduled' },
    { value: 'history', label: 'History' },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        /*
         * "…without logging in" was stated unconditionally, and it is only true once a mail
         * provider is configured. On a deployment without one it is the product promising
         * something it cannot do, on the very screen a customer would be shown in a demo -
         * and the banner further down this same page already says the opposite. Now the two
         * agree.
         */
        subtitle={mailConfigured === false
          ? 'Summaries of what is open and overdue. Make one now; once email is set up, you can also have them sent on a schedule.'
          : 'Summaries of what is open and overdue. Make one now, or have them emailed on a schedule.'}
        right={manage && view === 'schedules'
          ? <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true, editing: null })}>
              New schedule
            </Button>
          : undefined}
      />

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}
      {flash && <Alert tone="success" className="mb-3" onDismiss={() => setFlash(null)}>{flash}</Alert>}

      {/*
        Said once, at the top, rather than discovered after somebody schedules a weekly
        report and waits a week for an email that was never going to arrive.
      */}
      {mailConfigured === false && (
        <Alert tone="warning" className="mb-3">
          <span className="flex items-start gap-1.5">
            <MailWarning size={13} className="mt-0.5 shrink-0" />
            <span>
              No mail provider is configured, so reports are generated and stored but not
              emailed. Set <code className="font-mono">RESEND_API_KEY</code> (or{' '}
              <code className="font-mono">SMTP_URL</code>) together with{' '}
              <code className="font-mono">REPORT_EMAIL_FROM</code> to turn delivery on.
              Until then, download reports from the History tab.
            </span>
          </span>
        </Alert>
      )}

      <Tabs items={tabs} value={view} onChange={setView} className="mb-4" />

      {view === 'reports' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {REPORT_CARDS.map((c) => (
              <Card key={c.type}>
                <CardBody>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {c.title}
                  </p>
                  <p className="mt-1 text-2xs text-muted">{c.blurb}</p>
                  {c.type === 'site_activity' && (
                    <div className="mt-3 inline-flex rounded-lg border p-0.5" role="group" aria-label="Period">
                      {(['day', 'week'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={activityPeriod === p}
                          onClick={() => setActivityPeriod(p)}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-2xs font-medium coarse:min-h-11 coarse:px-3.5',
                            activityPeriod === p ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink',
                          )}
                        >
                          {p === 'day' ? 'Today' : 'Last 7 days'}
                        </button>
                      ))}
                    </div>
                  )}
                  {c.type === 'monthly_summary' && (
                    <MonthlyScopeBar
                      scope={scope}
                      onChange={setScope}
                      projects={projects}
                      sites={sites}
                    />
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary"
                      loading={previewing === c.type && !preview}
                      onClick={() => void openPreview(c.type)}>
                      {c.type === 'monthly_summary' ? 'Generate' : 'Preview'}
                    </Button>
                    {company && (
                      <Button size="sm" variant="ghost" icon={<Download size={11} />}
                        onClick={() => void download(
                          () => reportsApi.previewPdf(company.id, c.type, scopeFor(c.type)),
                          `${c.type}.pdf`,
                        )}>
                        Download PDF
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {previewing && (
            <Card>
              <CardBody>
                {!preview ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">{preview.title}</p>
                        <p className="text-2xs text-muted">
                          {preview.companyName}
                          {preview.projectName && <> · {preview.projectName}</>}
                          {preview.siteName && <> · {preview.siteName}</>}
                          {/*
                            A report covering a period says which one. "As at" is right for
                            the two that answer "what is owed now" and wrong for a month.
                          */}
                          {preview.periodLabel
                            ? <> · {preview.periodLabel}</>
                            : <>{' · as at '}{fmtDateTime(preview.periodEnd)}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 print:hidden">
                        <p className="text-2xs text-muted">{preview.rows.length} row(s)</p>
                        {/*
                          Prints the browser's own view. The page carries print rules that
                          drop the shell, so what comes out is the report - and an HSE
                          manager who wants a signed paper copy does not have to open the
                          PDF first.
                        */}
                        <Button size="sm" variant="ghost" icon={<Printer size={11} />}
                          onClick={() => window.print()}>
                          Print
                        </Button>
                      </div>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {preview.summary.map((s) => (
                        <div key={s.label}>
                          <p className="text-2xs uppercase tracking-wide text-muted">{s.label}</p>
                          <p className={cn(
                            'text-xl font-bold',
                            /overdue|no investigator|awaiting/i.test(s.label) && s.value !== '0' && s.value !== '—'
                              ? 'text-critical' : 'text-ink',
                          )}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {preview.rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-8 text-center text-2xs text-muted">
                        {preview.emptyMessage}
                      </p>
                    ) : (
                      // Wide tables scroll inside their own container; the page never does.
                      <div className="relative overflow-x-auto">
                        <table className="w-full min-w-[760px] text-2xs">
                          <thead>
                            <tr className="border-b text-left text-muted">
                              {preview.columns.map((c) => (
                                <th key={c.key} className="px-2 py-1.5 font-medium uppercase tracking-wide">
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.map((r, i) => (
                              <tr key={i} className="border-b last:border-0">
                                {preview.columns.map((c) => (
                                  <td key={c.key} className={cn(
                                    'px-2 py-1.5 text-ink',
                                    (c.key === 'overdue' && Number(r[c.key]) > 0) && 'font-semibold text-critical',
                                    (c.key === 'days' && Number(r[c.key]) > 30) && 'font-semibold text-critical',
                                  )}>
                                    {r[c.key]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* A multi-section report continues below its table. */}
                    {preview.sections?.map((section) => (
                      <ReportSectionView key={section.title} section={section} />
                    ))}
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {view === 'schedules' && (
        schedules === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : schedules.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center">
              <p className="text-sm text-ink">No scheduled reports yet.</p>
              <p className="mt-1 text-2xs text-muted">
                A Monday 08:00 overdue-actions report is the usual place to start.
              </p>
              {manage && (
                <Button className="mt-3" icon={<Plus size={13} />}
                  onClick={() => setDialog({ open: true, editing: null })}>
                  Create the first schedule
                </Button>
              )}
            </CardBody>
          </Card>
        ) : (
          <ul className="space-y-2">
            {schedules.map((s) => (
              <li key={s.id}>
                <Card>
                  <CardBody>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                          {s.name}
                          <Badge tone={s.enabled ? 'good' : 'neutral'}>
                            {s.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                          {s.lastRunStatus === 'failed' && <Badge tone="critical">Last run failed</Badge>}
                        </p>
                        <p className="text-2xs text-muted">
                          {s.typeLabel} · {s.scheduleLabel}
                        </p>
                        <p className="mt-0.5 text-2xs text-muted">
                          {s.recipients.length > 0
                            ? <>{recipientSummary({ ...s, unreachableRecipients: 0 })}</>
                            : <span className="text-critical">No reachable recipients</span>}
                          {s.unreachableRecipients > 0 && (
                            <span className="text-critical">
                              {' '}({s.unreachableRecipients} no longer in this workspace)
                            </span>
                          )}
                        </p>
                        <p className="text-2xs text-muted">
                          {s.enabled && s.nextRunAt
                            ? <>Next {fmtDateTime(s.nextRunAt)}</>
                            : 'Not scheduled'}
                          {s.lastRunAt && <> · last {fmtDateTime(s.lastRunAt)} ({s.lastRunStatus})</>}
                        </p>
                        {s.lastRunError && (
                          <p className="mt-1 text-2xs text-critical">{s.lastRunError}</p>
                        )}
                      </div>

                      {manage && (
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" icon={<Play size={11} />} loading={busy === s.id}
                            onClick={() => void run(s)}>
                            Run now
                          </Button>
                          <Button size="sm" variant="secondary" icon={<Pencil size={11} />}
                            onClick={() => setDialog({ open: true, editing: s })}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" loading={busy === s.id}
                            onClick={() => void toggle(s)}>
                            {s.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <button
                            aria-label={`Delete ${s.name}`}
                            disabled={busy === s.id}
                            onClick={() => void remove(s)}
                            className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )
      )}

      {view === 'history' && (
        runs === null ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : runs.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-2xs text-muted">
              Nothing has been run yet.
            </CardBody>
          </Card>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardBody className="py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-2xs text-ink">
                          <StatusPill kind={r.status === 'success' ? 'good' : 'critical'} label={r.status === 'success' ? 'Done' : 'Failed'} />
                          <span className="font-medium">{r.typeLabel}</span>
                          <Badge tone={r.trigger === 'manual' ? 'accent' : 'neutral'}>
                            {r.trigger === 'manual' ? 'Run now' : 'Scheduled'}
                          </Badge>
                          {/*
                            The delivery outcome, distinct from whether the report built.
                            "Generated" is not a failure - it means nobody has configured a
                            provider yet - and saying so keeps the two apart.
                          */}
{(() => {
                            /*
                              The delivery outcome, distinct from whether the report built.
                              "Generated" is not a failure - it means nobody has configured
                              a provider yet - and saying so keeps the two apart.
                            */
                            const b = deliveryBadge(r)
                            return (
                              <Badge tone={b.tone}>
                                {b.tone === 'good' && <Mail size={9} className="mr-0.5 inline" />}
                                {b.label}
                              </Badge>
                            )
                          })()}
                        </p>
                        <p className="text-2xs text-muted">
                          {fmtDateTime(r.startedAt)} · by {r.triggeredBy}
                          {' · '}{r.rowCount} row(s)
                          {r.recipientCount > 0 && <> · {r.recipientCount} recipient(s)</>}
                          {r.sentAt && <> · sent {fmtDateTime(r.sentAt)}</>}
                          {r.provider && <> · via {r.provider}</>}
                          {r.deliveryStatus === 'email_pending' && r.nextAttemptAt && (
                            <> · next attempt {fmtDateTime(r.nextAttemptAt)}</>
                          )}
                          {r.deliveryStatus === 'failed' && r.attempts > 1 && (
                            <> · {r.attempts} attempts</>
                          )}
                        </p>
                        {/* Why it failed, in the provider's own words. Never hidden. */}
                        {r.failureReason && (
                          <p className="mt-0.5 text-2xs text-critical">{r.failureReason}</p>
                        )}
                        {/*
                          The server's sentence, verbatim - unless it is already the failure
                          reason above it, in which case printing it again is just noise.
                        */}
                        {r.deliveryNote && r.deliveryNote !== r.failureReason && (
                          <p className="mt-0.5 text-2xs text-muted">{r.deliveryNote}</p>
                        )}
                        {r.error && <p className="mt-0.5 text-2xs text-critical">{r.error}</p>}
                      </div>
                      {canDownloadRun(r) && (
                        <Button size="sm" variant="secondary" icon={<Download size={11} />}
                          onClick={() => void download(() => reportsApi.runFile(r.id), r.originalName!)}>
                          PDF
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )
      )}

      <ScheduleDialog
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => { setDialog({ open: false, editing: null }); loadSchedules(); setView('schedules') }}
      />
    </>
  )
}

/**
 * What the monthly report covers: which job, which site, which month.
 *
 * Seeded from the header pickers so an HSE manager who has already narrowed to a project
 * does not choose it twice, but editable here - assembling a quarter means changing the
 * month three times, and doing that through the app-wide picker would drag every other
 * screen along with it.
 */
function MonthlyScopeBar({
  scope, onChange, projects, sites,
}: {
  scope: ReportScope
  onChange: (s: ReportScope) => void
  projects: { id: string; name: string }[]
  sites: { id: string; name: string }[]
}) {
  const now = new Date()
  /*
   * Defaults to the month just finished, which is what the server does when asked for no
   * month in particular. Shown rather than left blank so the control says what will happen.
   */
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = scope.month ?? defaultMonth
  const year = scope.year ?? defaultYear

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  // A short, fixed window. A safety record older than this is a data migration question,
  // not a reporting one.
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  /** The sites offered narrow with the project, the same way the header pickers do. */
  const project = projects.find((p) => p.id === scope.projectId)

  return (
    // gap-y-5, not gap-2: at 8px between rows a label sat almost exactly halfway between its
    // own select and the one above it (6px vs 8px), so "Year" read as the caption of Month.
    // The space between fields has to clearly exceed the space inside one (law of proximity).
    <div className="mt-3 grid gap-x-3 gap-y-5 rounded-lg border bg-sunken p-3 sm:grid-cols-2">
      {projects.length > 0 && (
        <Select
          label="Project"
          value={scope.projectId ?? ''}
          onChange={(e) => onChange({
            ...scope,
            projectId: e.target.value || undefined,
            // The site is cleared with the project: keeping it would name a site the new
            // project does not contain, and the report would disagree with its own heading.
            siteId: undefined,
          })}
        >
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      <Select
        label="Site"
        value={scope.siteId ?? ''}
        onChange={(e) => onChange({ ...scope, siteId: e.target.value || undefined })}
        hint={project ? `Within ${project.name}` : undefined}
      >
        <option value="">{project ? 'All sites in this project' : 'All sites'}</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Select
        label="Month"
        value={String(month)}
        onChange={(e) => onChange({ ...scope, month: Number(e.target.value), year })}
      >
        {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
      </Select>
      <Select
        label="Year"
        value={String(year)}
        onChange={(e) => onChange({ ...scope, year: Number(e.target.value), month })}
      >
        {years.map((v) => <option key={v} value={v}>{v}</option>)}
      </Select>
    </div>
  )
}
