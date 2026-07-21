import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarClock, Link2, Lock, PlayCircle, Printer, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AuditFindingView, AuditTemplate, AuditView } from '@/api/audits'
import { AUDIT_TYPE_LABEL } from '@/api/audits'
import type { Actor } from '@/api/incidents'
import type { Site } from '@/api/types'
import { Alert, Avatar, Badge, Button, Skeleton, StatusPill } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { AUDIT_STATUS_META, FINDING_STATUS_META, printAuditReport, scoreColor, SEVERITY_META } from '../lib'
import { AuditRunner } from './AuditRunner'

interface Detail {
  audit: AuditView
  findings: AuditFindingView[]
  template: AuditTemplate
}

export function AuditDrawer({
  auditId, actor, manage, sites, onClose, onChanged,
}: {
  auditId: string | null
  actor: Actor
  manage: boolean
  sites: Site[]
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [runnerOpen, setRunnerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = (id: string) => api.getAuditDetail(id).then(setDetail)

  useEffect(() => {
    if (!auditId) return
    setDetail(null)
    setError(null)
    setRunnerOpen(false)
    void load(auditId)
  }, [auditId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !runnerOpen && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, runnerOpen])

  if (!auditId) return null
  const audit = detail?.audit
  const canRun = audit ? manage || audit.leadAuditor === actor.name || audit.team.includes(actor.name) : false
  const siteName = audit ? sites.find((s) => s.id === audit.siteId)?.name ?? audit.siteId : ''
  const unresolved = detail?.findings.filter((f) => f.status !== 'Closed').length ?? 0

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (auditId) await load(auditId)
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label="Audit detail" className="absolute inset-y-0 right-0 flex w-full max-w-[560px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        {!audit ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-2xs text-muted">{audit.code}</p>
                <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">{audit.title}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{AUDIT_TYPE_LABEL[audit.type]}</Badge>
                  <StatusPill kind={AUDIT_STATUS_META[audit.status].kind} label={audit.status} />
                  {audit.score !== undefined && (
                    <span className="text-sm font-bold" style={{ color: scoreColor(audit.score), fontVariantNumeric: 'tabular-nums' }}>
                      {audit.score}%
                    </span>
                  )}
                  {audit.overdue && <Badge tone="critical">Overdue to start</Badge>}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

              {/* Primary actions */}
              <div className="flex flex-wrap gap-2">
                {audit.status === 'Planned' && canRun && (
                  <Button size="sm" icon={<PlayCircle size={13} />} loading={busy} onClick={() => void run(() => api.startAudit(audit.id, actor))}>
                    Start audit
                  </Button>
                )}
                {audit.status === 'In Progress' && canRun && (
                  <Button size="sm" icon={<PlayCircle size={13} />} onClick={() => setRunnerOpen(true)}>
                    Run checklist
                  </Button>
                )}
                {audit.status === 'Completed' && manage && (
                  <span title={unresolved > 0 ? `${unresolved} finding(s) not yet verified` : undefined}>
                    <Button size="sm" icon={unresolved > 0 ? <Lock size={12} /> : undefined} disabled={unresolved > 0} loading={busy}
                      onClick={() => void run(() => api.closeAudit(audit.id, actor))}>
                      {unresolved > 0 ? `Close audit (${unresolved} unverified)` : 'Close audit'}
                    </Button>
                  </span>
                )}
                {(audit.status === 'Completed' || audit.status === 'Closed') && (
                  <Button size="sm" variant="secondary" icon={<Printer size={13} />}
                    onClick={() => printAuditReport(audit, detail!.findings, siteName)}>
                    Print report
                  </Button>
                )}
                {audit.status === 'Planned' && !canRun && (
                  <p className="text-2xs text-muted">Assigned to {audit.leadAuditor}{audit.team.length ? ` + ${audit.team.length} team member(s)` : ''}.</p>
                )}
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Meta label="Site · Dept" value={`${siteName} · ${audit.department}`} />
                <Meta label="Checklist" value={audit.templateName} />
                <Meta label="Lead auditor"><span className="flex items-center gap-1.5"><Avatar name={audit.leadAuditor} size={16} />{audit.leadAuditor}</span></Meta>
                <Meta label="Team" value={audit.team.join(', ') || '—'} />
                <Meta label="Scheduled" value={`${audit.scheduledFor} · ${audit.durationDays} day(s)`} />
                <Meta label="Priority" value={audit.priority} />
              </div>

              {/* Findings */}
              <div>
                <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">
                  Findings ({detail!.findings.length})
                </p>
                {detail!.findings.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3.5 py-4 text-center text-xs text-muted">
                    {audit.status === 'Planned' || audit.status === 'In Progress'
                      ? 'Findings raised during the audit appear here with their corrective actions.'
                      : 'No findings — clean audit.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail!.findings.map((f) => (
                      <li key={f.id} className="rounded-xl border px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-2xs text-muted">{f.code}</span>
                          <StatusPill kind={SEVERITY_META[f.severity].kind} label={f.severity} />
                          <span className="text-2xs text-muted">{f.category}</span>
                          <span className="ml-auto"><StatusPill kind={FINDING_STATUS_META[f.status].kind} label={f.status} /></span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink">{f.description}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-muted">
                          <Link to={`/actions?open=${f.actionId}`} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                            <Link2 size={10} /> {f.actionCode}
                          </Link>
                          <span>{f.actionOwner} · due {f.actionDue}{f.actionOverdue ? ' · overdue' : ''}</span>
                          {f.linkedAssetId && (
                            <Link to={`/assets?qr=${f.linkedAssetId}`} className="font-semibold text-accent hover:underline">linked asset</Link>
                          )}
                          {f.photoCount > 0 && <span>{f.photoCount} photo(s)</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Timeline */}
              <div>
                <p className="mb-2 flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-muted">
                  <CalendarClock size={11} /> Timeline
                </p>
                <ol className="relative space-y-3 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-grid">
                  {audit.timeline.map((t) => (
                    <li key={t.id} className="relative flex gap-3">
                      <span className="z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--baseline)] bg-surface" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-ink">{t.action}</p>
                        {t.detail && <p className="text-2xs leading-relaxed text-ink-2">{t.detail}</p>}
                        <p className="mt-0.5 text-2xs text-muted">{fmtDateTime(t.at)} · {t.actor}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </aside>

      {detail && runnerOpen && (
        <AuditRunner
          audit={detail.audit}
          template={detail.template}
          onClose={() => setRunnerOpen(false)}
          onCompleted={() => {
            setRunnerOpen(false)
            if (auditId) void load(auditId)
            onChanged()
          }}
        />
      )}
    </div>,
    document.body,
  )
}

function Meta({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs text-muted">{label}</p>
      <div className="text-sm font-medium text-ink">{children ?? value}</div>
    </div>
  )
}
