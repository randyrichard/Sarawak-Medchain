import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Archive, CalendarDays, FileText, CloudSun, MapPin, ShieldAlert, UserRound, Users,
} from 'lucide-react'
import { api } from '@/api/client'
import type { Incident } from '@/api/incidents'
import { STAGE_LABEL, SEVERITY_LABEL, TYPE_LABEL } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Breadcrumbs, Button, Card, CardBody, CardHeader, Dialog, ErrorState, LinkButton,
  Skeleton, StatusPill, Tabs, type TabItem,
} from '@/components/ui'
import { ApiError } from '@/api/types'
import { usePageTitle } from '@/app/pageTitle'
import { fmtDate, fmtDateTime, severityKind, STAGE_COLOR, TYPE_ICON, useActor } from './lib'
import { StageStepper } from './components/StageStepper'
import { NextStepCard } from './components/NextStepCard'
import { RcaPanel } from './components/RcaPanel'
import { ActionsPanel } from './components/ActionsPanel'
import { CommentsPanel } from './components/CommentsPanel'
import { EvidencePanel } from './components/EvidencePanel'
import { IncidentEquipmentPanel } from './components/IncidentEquipmentPanel'
import { PeoplePanel } from './components/PeoplePanel'
import { InvestigationPanel } from './components/InvestigationPanel'
import { IncidentSummaryDialog } from './components/IncidentSummaryDialog'
import { isBackendConfigured } from '@/api/authApi'
import { useUrlState } from '@/lib/useUrlState'

/**
 * One work surface at a time, in the wide column.
 *
 * People, equipment, evidence and the investigation checklist used to live in the right
 * rail instead. That rail is a third of the width and stacks vertically, so on a case in
 * investigation it stood 2349px tall while the tabbed column beside it held 261px - the
 * page was 3.9 screens of scrolling and 89% of the wide column was empty. Every one of
 * those panels is something a person works in rather than glances at, so they belong
 * where the width is, and where only the open one is rendered.
 */
const TABS = ['overview', 'investigation', 'actions', 'people', 'evidence', 'discussion', 'activity'] as const
type Tab = (typeof TABS)[number]

export function IncidentDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { sites, role } = useOrg()
  const actor = useActor()

  const [incident, setIncident] = useState<Incident | null>(null)
  /*
   * Why the incident could not be shown. Kept apart because each means something different
   * to the person reading it: a record that is gone, one they may not see, and a request
   * that failed. All three used to read "no longer available ... may have been archived",
   * which was false for the last two. A worker on patchy site wifi was told their report was
   * gone, and could report it again.
   */
  const [failure, setFailure] = useState<null | 'missing' | 'forbidden' | { error: unknown }>(null)
  const [attempt, setAttempt] = useState(0)
  // In the URL, so a link to an incident's Actions tab opens on its Actions tab.
  const [tab, setTab] = useUrlState<Tab>('tab', 'overview', TABS)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const justCreated = (location.state as { created?: boolean } | null)?.created

  // Names the tab after the incident once it has loaded; until then the shell's route-derived
  // "Incidents" stands, which is the right thing to show while the record is still in flight.
  usePageTitle(incident?.number)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setFailure(null)
    api.getIncident(id)
      .then((i) => !cancelled && setIncident(i))
      .catch((e) => {
        if (cancelled) return
        const code = e instanceof ApiError ? e.code : ''
        setFailure(code === 'not_found' ? 'missing' : code === 'forbidden' ? 'forbidden' : { error: e })
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  /*
   * A record that is gone, not an error.
   *
   * Reachable more often than it looks: a link to an incident that has since been archived,
   * a stale bookmark, or - the case that prompted this - somebody whose session expired on
   * an incident page, signed back in, and was returned to it by the redirect. Landing a
   * fresh sign-in on one grey line reading "not found" is a poor first thing to see, and
   * the old version offered a single way out.
   *
   * Says why it might have happened, and gives both exits. Deliberately not phrased as a
   * failure: nothing went wrong, the incident is simply not there any more.
   */
  if (failure === 'forbidden') {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-ink">You don't have access to this incident.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
          Which incidents you can open depends on your role and sites. If you need this one, ask
          your safety officer or administrator.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <LinkButton to="/incidents" variant="secondary" size="sm">Back to incidents</LinkButton>
          <LinkButton to="/" variant="ghost" size="sm">Go to dashboard</LinkButton>
        </div>
      </div>
    )
  }

  if (failure && failure !== 'missing') {
    return (
      <ErrorState
        className="py-16"
        title="Couldn't load this incident"
        error={failure.error}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    )
  }

  if (failure === 'missing') {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-ink">This incident is no longer available.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
          It may have been archived, or the link may be out of date. Archived incidents stay
          in the register and can be restored by an administrator.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <LinkButton to="/incidents" variant="secondary" size="sm">Back to incidents</LinkButton>
          <LinkButton to="/" variant="ghost" size="sm">Go to dashboard</LinkButton>
        </div>
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

  /*
   * Counts sit on the tab rather than inside it. With the panels no longer all on screen
   * at once, the reason to open one is usually that something is in it - so a tab with
   * nothing behind it should say so before it is clicked, not after.
   */
  const tabs: TabItem<Tab>[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'investigation', label: 'Investigation' },
    { value: 'actions', label: 'Actions', badge: incident.actions.length > 0 ? <Badge tone="accent">{incident.actions.length}</Badge> : undefined },
    /*
     * One word, because two wrapped. "People & equipment" was the only tab tall enough to
     * break the strip onto a second line, and the two panels behind it already head
     * themselves "People involved" and "Equipment involved" - so the specificity is a
     * click away rather than lost.
     */
    { value: 'people', label: 'Involved' },
    { value: 'evidence', label: 'Evidence', badge: incident.attachments.length > 0 ? <Badge tone="neutral">{incident.attachments.length}</Badge> : undefined },
    { value: 'discussion', label: 'Discussion', badge: incident.comments.length > 0 ? <Badge tone="neutral">{incident.comments.length}</Badge> : undefined },
    { value: 'activity', label: 'History' },
  ]

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Incidents', to: '/incidents' },
          { label: incident.number },
        ]}
      />

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
            <StatusPill kind={severityKind(incident.severity)} label={SEVERITY_LABEL[incident.severity] ?? incident.severity} />
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
        <div className="flex shrink-0 items-center gap-1.5">
          {isBackendConfigured() && (
            <Button variant="secondary" size="sm" icon={<FileText size={13} />} onClick={() => setSummaryOpen(true)}>
              Summary
            </Button>
          )}
          {role === 'admin' && incident.stage !== 'closed' && (
            <>
              {/*
                Set apart from Summary by a rule and space (law of proximity): side by side
                they read as two equal, harmless options, and archiving takes the incident
                out of everyone's register.
              */}
              <span aria-hidden className="mx-1.5 h-5 w-px bg-grid" />
              <Button variant="ghost" size="sm" icon={<Archive size={13} />} onClick={() => setArchiveOpen(true)}>
                Archive
              </Button>
            </>
          )}
        </div>
        {summaryOpen && (
          <IncidentSummaryDialog incidentId={incident.id} number={incident.number} onClose={() => setSummaryOpen(false)} />
        )}
      </div>

      {/* Workflow position */}
      <Card className="mb-4 px-5 py-4">
        <StageStepper stage={incident.stage} />
      </Card>

      {/*
        `items-start` matters more than it looks. A grid stretches its children to the
        tallest of them, so the short column was a 2349px cell holding a 261px card - which
        is how a rail came to set the height of a page whose actual content was one screen.
      */}
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
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
                  {/*
                    The severity checklist was in the rail while its own findings were
                    here, so one investigation was split across two columns - and the half
                    in the rail was 1107px tall in a third of the width. It reads as one
                    thing now.
                  */}
                  <InvestigationPanel
                    incidentId={incident.id}
                    canEdit={incident.stage !== 'closed'}
                    canSignOff={['admin', 'hse_manager'].includes(role ?? '')}
                  />
                  <RcaPanel incident={incident} onUpdate={setIncident} />
                </div>
              )}
              {tab === 'actions' && <ActionsPanel incident={incident} onUpdate={setIncident} />}
              {/*
                Who was involved, then what the event touched - the order an investigator
                works in, and two registers that answer one question between them.
              */}
              {tab === 'people' && (
                <div className="space-y-4">
                  <PeoplePanel
                    incidentId={incident.id}
                    companyId={incident.companyId}
                    canEdit={incident.stage !== 'closed'}
                  />
                  <IncidentEquipmentPanel
                    incidentId={incident.id}
                    companyId={incident.companyId}
                    canEdit={incident.stage !== 'closed'}
                  />
                </div>
              )}
              {tab === 'evidence' && <EvidencePanel incident={incident} onUpdate={setIncident} />}
              {tab === 'discussion' && <CommentsPanel incident={incident} onUpdate={setIncident} />}
              {tab === 'activity' && <ActivityLog incident={incident} />}
            </CardBody>
          </Card>
        </div>

        {/*
          Right: reference only - what to do next, and the facts of the case.

          Both are read at a glance and neither is worked in, which is what earns them a
          permanent column. Being short, they can also be pinned, so the next action stays
          on screen while somebody scrolls a long tab beside it - the one thing the old
          rail could never do, because the rail was the scroll.
        */}
        <div className="space-y-4 xl:sticky xl:top-4">
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

      {/*
        What the reporter typed at the time, before anybody was matched to a register.
        Shown only when it has content, and labelled as such: the authoritative list is the
        People panel below, which links to the workforce and contractor registers and can
        carry a statement. Two sections both titled "People involved" - one of them always
        empty on new reports - is worse than one.
      */}
      {(incident.peopleInvolved.length > 0 || incident.witnesses.length > 0) && (
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted">
            <Users size={11} /> Named on the report
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
      )}

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
