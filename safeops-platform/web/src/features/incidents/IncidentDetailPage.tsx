import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArrowLeft, CalendarDays, CloudSun, MapPin, ShieldAlert, UserRound, Users,
} from 'lucide-react'
import { api } from '@/api/client'
import type { Incident } from '@/api/incidents'
import { STAGE_LABEL, TYPE_LABEL } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, Skeleton, StatusPill,
  Tabs, type TabItem,
} from '@/components/ui'
import { fmtDate, fmtDateTime, severityKind, STAGE_COLOR, TYPE_ICON, useActor } from './lib'
import { StageStepper } from './components/StageStepper'
import { NextStepCard } from './components/NextStepCard'
import { CaseTimeline } from './components/CaseTimeline'
import { RcaPanel } from './components/RcaPanel'
import { ActionsPanel } from './components/ActionsPanel'
import { CommentsPanel } from './components/CommentsPanel'
import { EvidencePanel } from './components/EvidencePanel'

type Tab = 'overview' | 'investigation' | 'actions' | 'discussion' | 'activity'

export function IncidentDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { sites, role } = useOrg()
  const actor = useActor()

  const [incident, setIncident] = useState<Incident | null>(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const justCreated = (location.state as { created?: boolean } | null)?.created

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.getIncident(id)
      .then((i) => !cancelled && setIncident(i))
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [id])

  if (missing) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">Incident not found or archived.</p>
        <Link to="/incidents" className="mt-2 inline-block text-sm font-semibold text-accent">Back to incidents</Link>
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-14 w-full" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-96 xl:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  const TypeIcon = TYPE_ICON[incident.type]
  const siteName = sites.find((s) => s.id === incident.siteId)?.name ?? incident.siteId

  const tabs: TabItem<Tab>[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'investigation', label: 'Investigation & RCA' },
    { value: 'actions', label: 'Actions', badge: incident.actions.length > 0 ? <Badge tone="accent">{incident.actions.length}</Badge> : undefined },
    { value: 'discussion', label: 'Discussion', badge: incident.comments.length > 0 ? <Badge tone="neutral">{incident.comments.length}</Badge> : undefined },
    { value: 'activity', label: 'Activity log' },
  ]

  return (
    <>
      <Link to="/incidents" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
        <ArrowLeft size={13} /> All incidents
      </Link>

      {justCreated && (
        <Alert tone="success" title={`${incident.number} submitted`} className="mb-4">
          The site manager has been notified for initial assessment. You'll get updates as the case progresses.
        </Alert>
      )}

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft">
              <TypeIcon size={17} className="text-accent" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{incident.title}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">{incident.number}</span>
            <StatusPill kind={severityKind(incident.severity)} label={incident.severity} />
            <Badge tone="neutral">{TYPE_LABEL[incident.type]}</Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[incident.stage] }} />
              {STAGE_LABEL[incident.stage]}
            </span>
            {incident.highRisk && incident.stage !== 'closed' && (
              <Badge tone="critical" className="gap-1"><ShieldAlert size={10} /> High risk</Badge>
            )}
            <span title="Every change bumps the version — full history in the Activity log">
              <Badge tone="neutral">v{incident.version}</Badge>
            </span>
          </div>
        </div>
        {role === 'admin' && incident.stage !== 'closed' && (
          <Button variant="ghost" size="sm" icon={<Archive size={13} />} onClick={() => setArchiveOpen(true)}>
            Archive
          </Button>
        )}
      </div>

      {/* Workflow position */}
      <Card className="mb-4 px-5 py-4">
        <StageStepper stage={incident.stage} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Left: work area */}
        <div className="xl:col-span-2">
          <Card>
            <div className="px-5 pt-3">
              <Tabs items={tabs} value={tab} onChange={setTab} />
            </div>
            <CardBody className="px-5 py-4">
              {tab === 'overview' && <Overview incident={incident} siteName={siteName} />}
              {tab === 'investigation' && (
                <div className="space-y-5">
                  {incident.findings ? (
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Investigation findings</p>
                      <p className="rounded-lg bg-sunken px-3.5 py-3 text-sm leading-relaxed text-ink-2">{incident.findings}</p>
                      {incident.investigator && (
                        <p className="mt-1.5 text-2xs text-muted">Lead investigator: {incident.investigator}</p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted">
                      Findings appear here once the investigation records them.
                    </p>
                  )}
                  <RcaPanel incident={incident} onUpdate={setIncident} />
                </div>
              )}
              {tab === 'actions' && <ActionsPanel incident={incident} onUpdate={setIncident} />}
              {tab === 'discussion' && <CommentsPanel incident={incident} onUpdate={setIncident} />}
              {tab === 'activity' && <ActivityLog incident={incident} />}
            </CardBody>
          </Card>
        </div>

        {/* Right: status + timeline */}
        <div className="space-y-4">
          <NextStepCard incident={incident} onUpdate={setIncident} />

          <Card>
            <CardHeader title="Case" />
            <CardBody className="space-y-2.5 text-sm">
              <CaseRow label="Assigned manager" value={incident.assignedManager ?? '—'} avatar />
              <CaseRow label="Investigator" value={incident.investigator ?? 'Not yet assigned'} avatar={!!incident.investigator} />
              <CaseRow label="Reporter" value={incident.reporter} avatar />
              <CaseRow label="Occurred" value={fmtDateTime(incident.occurredAt)} />
              <CaseRow label="Reported" value={fmtDateTime(incident.reportedAt)} />
              {incident.closedAt && <CaseRow label="Closed" value={fmtDateTime(incident.closedAt)} />}
              {incident.assessment && (
                <div className="rounded-lg border px-3 py-2 text-2xs text-ink-2">
                  Assessed <span className="font-semibold text-ink">{incident.assessment.riskRating}</span> risk ·
                  potential <span className="font-semibold text-ink">{incident.assessment.potentialSeverity}</span>
                  <span className="text-muted"> — {incident.assessment.assessedBy}</span>
                </div>
              )}
            </CardBody>
          </Card>

          <EvidencePanel incident={incident} onUpdate={setIncident} />
          <CaseTimeline incident={incident} />
        </div>
      </div>

      {/* Archive (soft delete) */}
      <Dialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`Archive ${incident.number}?`}
        description="Soft delete — removed from lists and dashboards, recoverable by support. The audit trail is preserved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                void api.archiveIncident(incident.id, actor).then(() => navigate('/incidents'))
              }}
            >
              Archive incident
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Archiving is for duplicates and test entries — not for making numbers look better. The action is logged
          against your name.
        </p>
      </Dialog>
    </>
  )
}

function CaseRow({ label, value, avatar }: { label: string; value: string; avatar?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink">
        {avatar && value !== '—' && !value.startsWith('Not') && <Avatar name={value} size={16} />}
        <span className="truncate">{value}</span>
      </span>
    </div>
  )
}

function Overview({ incident, siteName }: { incident: Incident; siteName: string }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">What happened</p>
        <p className="text-sm leading-relaxed text-ink-2">{incident.description}</p>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Immediate actions taken</p>
        <p className="text-sm leading-relaxed text-ink-2">{incident.immediateActions}</p>
      </div>

      <div className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        <MetaRow icon={MapPin} label="Site" value={siteName} />
        <MetaRow icon={MapPin} label="Location" value={incident.location} />
        <MetaRow icon={UserRound} label="Department" value={incident.department} />
        <MetaRow icon={CalendarDays} label="Occurred" value={fmtDate(incident.occurredAt)} />
        {incident.gps && <MetaRow icon={MapPin} label="GPS" value={incident.gps} />}
        {incident.weather && <MetaRow icon={CloudSun} label="Weather" value={incident.weather} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted">
            <Users size={11} /> People involved
          </p>
          {incident.peopleInvolved.length === 0 ? (
            <p className="text-xs text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {incident.peopleInvolved.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-ink-2">
                  <Avatar name={p.name} size={18} /> {p.name}
                  <Badge tone={p.role === 'Contractor' ? 'warning' : 'neutral'}>{p.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Witnesses</p>
          {incident.witnesses.length === 0 ? (
            <p className="text-xs text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink-2">
              {incident.witnesses.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      </div>

      {incident.signature && (
        <p className="text-2xs text-muted">
          Signed by <span className="font-mono italic text-ink-2">{incident.signature}</span> at reporting.
        </p>
      )}
    </div>
  )
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="shrink-0 text-muted" />
      <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 truncate text-sm text-ink" title={value}>{value}</span>
    </div>
  )
}

function ActivityLog({ incident }: { incident: Incident }) {
  const entries = [...incident.timeline].reverse()
  return (
    <div className="space-y-1">
      <p className="mb-2 text-xs text-muted">
        Complete audit trail, newest first · current version <span className="font-semibold text-ink">v{incident.version}</span>
        {incident.reviewNote && <> · review note: <span className="italic">"{incident.reviewNote}"</span></>}
      </p>
      <ul className="divide-y">
        {entries.map((t) => (
          <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
            <span className="w-32 shrink-0 font-mono text-2xs text-muted">{fmtDateTime(t.at)}</span>
            <span className="w-32 shrink-0 truncate text-xs font-medium text-ink-2">{t.actor}</span>
            <span className="min-w-0 flex-1 text-sm text-ink">
              {t.action}
              {t.detail && <span className="text-muted"> — {t.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
