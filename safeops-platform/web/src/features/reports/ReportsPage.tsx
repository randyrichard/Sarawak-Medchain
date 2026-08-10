import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Download, Play, Plus, Pencil, Trash2, History, Clock, Mail, MailWarning,
  AlertTriangle, Microscope, CheckCircle2, XCircle,
} from 'lucide-react'
import {
  reportsApi,
  type ReportData, type ReportRun, type ReportSchedule, type ReportType,
} from '@/api/reportsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { fmtDateTime } from '@/features/incidents/lib'
import {
  Alert, Badge, Button, Card, CardBody, PageHeader, Skeleton, Tabs, type TabItem,
} from '@/components/ui'
import { ScheduleDialog } from './components/ScheduleDialog'
import { cn } from '@/lib/cn'

/**
 * Reports.
 *
 * Two things an HSE manager wants on a Monday: what is overdue, and what is still being
 * investigated. Everything on this page is generated from current data on request - there
 * is no cached report, because a stale safety report is worse than none.
 */
type View = 'reports' | 'schedules' | 'history'

const REPORT_CARDS: { type: ReportType; title: string; blurb: string; icon: typeof FileText }[] = [
  {
    type: 'overdue_actions',
    title: 'Overdue corrective actions',
    blurb: 'Every open action past its due date, with the owner and how long it has been outstanding.',
    icon: AlertTriangle,
  },
  {
    type: 'open_investigations',
    title: 'Open investigations',
    blurb: 'Incidents still under investigation, how long they have been open, and what is missing.',
    icon: Microscope,
  },
]

export function ReportsPage() {
  const { company, role } = useOrg()
  const [view, setView] = useState<View>('reports')

  const [preview, setPreview] = useState<ReportData | null>(null)
  const [previewing, setPreviewing] = useState<ReportType | null>(null)
  const [schedules, setSchedules] = useState<ReportSchedule[] | null>(null)
  const [runs, setRuns] = useState<ReportRun[] | null>(null)
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; editing: ReportSchedule | null }>(
    { open: false, editing: null },
  )

  /*
   * Mirrors the server's report roles. Presentation only: every call below is re-checked
   * server-side, so hiding a button is a courtesy and never the control.
   */
  const manage = ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')

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

  const openPreview = async (type: ReportType) => {
    if (!company) return
    setPreviewing(type)
    setPreview(null)
    setError(null)
    try {
      setPreview(await reportsApi.preview(company.id, type))
    } catch (e) {
      setPreviewing(null)
      setError(e instanceof ApiError ? e.message : 'Could not build that report.')
    }
  }

  const download = async (fn: () => Promise<Blob>, name: string) => {
    try {
      const b = await fn()
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download that report.')
    }
  }

  const run = async (s: ReportSchedule) => {
    setBusy(s.id)
    setError(null)
    try {
      const res = await reportsApi.runNow(s.id)
      say(
        mailConfigured
          ? `${s.name} generated and sent to ${s.recipients.length} recipient(s).`
          : `${s.name} generated (${res.rowCount ?? 0} rows). Email delivery needs a mail provider — download it from History.`,
      )
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
    { value: 'reports', label: 'Reports', badge: <FileText size={13} className="text-muted" /> },
    { value: 'schedules', label: 'Scheduled', badge: <Clock size={13} className="text-muted" /> },
    { value: 'history', label: 'History', badge: <History size={13} className="text-muted" /> },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="What is overdue and what is still open, on a schedule, without logging in"
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
              emailed. Set <code className="font-mono">SMTP_URL</code> or{' '}
              <code className="font-mono">MAIL_PROVIDER_API_KEY</code> to turn delivery on.
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
                    <c.icon size={14} className="text-accent" /> {c.title}
                  </p>
                  <p className="mt-1 text-2xs text-muted">{c.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary"
                      loading={previewing === c.type && !preview}
                      onClick={() => void openPreview(c.type)}>
                      Preview
                    </Button>
                    {company && (
                      <Button size="sm" variant="ghost" icon={<Download size={11} />}
                        onClick={() => void download(
                          () => reportsApi.previewPdf(company.id, c.type),
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
                          {preview.siteName && <> · {preview.siteName}</>}
                          {' · as at '}{fmtDateTime(preview.periodEnd)}
                        </p>
                      </div>
                      <p className="text-2xs text-muted">{preview.rows.length} row(s)</p>
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
                      <div className="overflow-x-auto">
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
                            ? <>To {s.recipients.map((r) => r.name).join(', ')}</>
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
                          {r.status === 'success'
                            ? <CheckCircle2 size={12} className="text-good" />
                            : <XCircle size={12} className="text-critical" />}
                          <span className="font-medium">{r.typeLabel}</span>
                          <Badge tone={r.trigger === 'manual' ? 'accent' : 'neutral'}>
                            {r.trigger === 'manual' ? 'Run now' : 'Scheduled'}
                          </Badge>
                          {/*
                            The delivery outcome, distinct from whether the report built.
                            "Generated" is not a failure - it means nobody has configured a
                            provider yet - and saying so keeps the two apart.
                          */}
                          {r.deliveryStatus === 'sent'
                            ? <Badge tone="good"><Mail size={9} className="mr-0.5 inline" />Sent</Badge>
                            : r.deliveryStatus === 'failed'
                              ? <Badge tone="critical">Delivery failed</Badge>
                              : r.deliveryStatus === 'email_pending'
                                ? <Badge tone="warning">Sending…</Badge>
                                : <Badge tone="neutral">Generated</Badge>}
                        </p>
                        <p className="text-2xs text-muted">
                          {fmtDateTime(r.startedAt)} · by {r.triggeredBy}
                          {' · '}{r.rowCount} row(s)
                          {r.recipientCount > 0 && <> · {r.recipientCount} recipient(s)</>}
                          {r.sentAt && <> · sent {fmtDateTime(r.sentAt)}</>}
                          {r.provider && <> · via {r.provider}</>}
                        </p>
                        {/* Why it failed, in the provider's own words. Never hidden. */}
                        {r.failureReason && (
                          <p className="mt-0.5 text-2xs text-critical">{r.failureReason}</p>
                        )}
                        {/* The server's sentence, verbatim. */}
                        {r.deliveryNote && (
                          <p className="mt-0.5 text-2xs text-muted">{r.deliveryNote}</p>
                        )}
                        {r.error && <p className="mt-0.5 text-2xs text-critical">{r.error}</p>}
                      </div>
                      {r.status === 'success' && r.originalName && (
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
