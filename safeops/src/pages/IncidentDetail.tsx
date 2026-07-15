import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Check, Camera, FileText, MessageSquareQuote, Upload,
  UserRound, CalendarDays, MapPin, GitBranch, ArrowRight,
} from 'lucide-react'
import { Card, CardHeader, PageHeader, StatusPill, severityKind, actionStatusKind, ProgressBar } from '../components/ui'
import { INCIDENTS, ACTIONS, WORKFLOW_STAGES, siteById } from '../data/mock'

const EVIDENCE_ICON = { photo: Camera, document: FileText, statement: MessageSquareQuote }

export default function IncidentDetail() {
  const { id } = useParams()
  const inc = INCIDENTS.find((i) => i.id === id)
  if (!inc) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">Incident not found.</p>
        <Link to="/incidents" className="mt-2 inline-block text-sm font-semibold text-accent">Back to incidents</Link>
      </div>
    )
  }

  const stageIdx = WORKFLOW_STAGES.indexOf(inc.stage)
  const linkedActions = ACTIONS.filter((a) => a.incident === inc.id)
  const site = siteById(inc.site)

  return (
    <>
      <Link to="/incidents" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
        <ArrowLeft size={13} /> All incidents
      </Link>
      <PageHeader
        title={inc.title}
        subtitle={`${inc.id} · ${inc.type}`}
        right={<StatusPill kind={severityKind(inc.severity)} label={`${inc.severity} severity`} />}
      />

      {/* Workflow stepper */}
      <Card className="mb-4 px-6 py-5">
        <ol className="flex items-center">
          {WORKFLOW_STAGES.map((stage, i) => {
            const done = i < stageIdx || inc.stage === 'Closed'
            const current = i === stageIdx && inc.stage !== 'Closed'
            return (
              <li key={stage} className={`flex items-center ${i < WORKFLOW_STAGES.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold"
                    style={{
                      borderColor: done || current ? 'var(--accent)' : 'var(--grid)',
                      background: done ? 'var(--accent)' : current ? 'var(--accent-soft)' : 'transparent',
                      color: done ? '#fff' : current ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </div>
                  <span className={`mt-1.5 whitespace-nowrap text-[10px] font-medium ${current ? 'text-ink' : 'text-muted'}`}>
                    {stage}
                  </span>
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <div className="mx-2 mb-5 h-0.5 flex-1 rounded" style={{ background: i < stageIdx ? 'var(--accent)' : 'var(--grid)' }} />
                )}
              </li>
            )
          })}
        </ol>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Left: narrative + evidence */}
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="What happened" />
            <p className="px-5 pb-4 text-[13px] leading-relaxed text-ink-2">{inc.description}</p>
            <div className="grid grid-cols-2 gap-3 border-t px-5 py-3 text-xs md:grid-cols-4">
              <span className="inline-flex items-center gap-1.5 text-ink-2"><MapPin size={13} className="text-muted" /> {site.name}</span>
              <span className="inline-flex items-center gap-1.5 text-ink-2"><GitBranch size={13} className="text-muted" /> {inc.department}</span>
              <span className="inline-flex items-center gap-1.5 text-ink-2"><CalendarDays size={13} className="text-muted" /> {inc.date}</span>
              <span className="inline-flex items-center gap-1.5 text-ink-2"><UserRound size={13} className="text-muted" /> {inc.owner}</span>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Evidence"
              subtitle={`${inc.evidence.length} items attached`}
              right={
                <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-accent-soft">
                  <Upload size={13} /> Upload
                </button>
              }
            />
            <div className="grid gap-2 px-5 pb-4 pt-1 sm:grid-cols-2">
              {inc.evidence.map((e) => {
                const Icon = EVIDENCE_ICON[e.kind]
                return (
                  <div key={e.name} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                      <Icon size={15} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{e.name}</p>
                      <p className="text-[11px] capitalize text-muted">{e.kind}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Corrective actions" subtitle={linkedActions.length ? `${linkedActions.length} linked` : 'None raised yet'} />
            <div className="space-y-2 px-5 pb-4 pt-1">
              {linkedActions.map((a) => (
                <div key={a.id} className="rounded-lg border px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink">{a.title}</p>
                    <StatusPill kind={actionStatusKind(a.status)} label={a.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1"><ProgressBar value={a.progress} tone={a.status === 'Overdue' ? 'var(--critical)' : 'var(--s1)'} /></div>
                    <span className="text-[11px] text-muted">{a.progress}% · due {a.due} · {a.owner}</span>
                  </div>
                </div>
              ))}
              <Link to="/actions" className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-accent">
                Open tracker <ArrowRight size={12} />
              </Link>
            </div>
          </Card>
        </div>

        {/* Right: decision panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Root cause" />
            <div className="px-5 pb-4">
              {inc.rootCause ? (
                <>
                  <span className="inline-flex rounded-lg bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-ink">{inc.rootCause}</span>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Classified during investigation. Feeds the company root-cause trend on the dashboard.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">Not yet classified — pending investigation findings.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Next step" subtitle="What this investigation needs now" />
            <div className="px-5 pb-4">
              <p className="text-[13px] leading-relaxed text-ink-2">
                {inc.stage === 'Reported' && 'Assign an investigation lead and secure the scene evidence within 24 hours.'}
                {inc.stage === 'Investigation' && 'Complete witness interviews and timeline reconstruction, then classify the root cause.'}
                {inc.stage === 'Root Cause' && 'Root-cause workshop scheduled. Confirm the 5-Why analysis and raise corrective actions.'}
                {inc.stage === 'Corrective Action' && 'Actions in progress — verify completion evidence before submitting for approval.'}
                {inc.stage === 'Approval' && 'Awaiting HSE Manager sign-off. All actions complete and verified.'}
                {inc.stage === 'Closed' && 'Investigation closed. Learnings shared in the monthly safety bulletin.'}
              </p>
              {inc.stage !== 'Closed' && (
                <button className="mt-3 w-full rounded-lg py-2 text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
                  {inc.stage === 'Approval' ? 'Approve & Close' : `Advance to ${WORKFLOW_STAGES[stageIdx + 1]}`}
                </button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Site context" />
            <div className="space-y-2 px-5 pb-4 text-xs text-ink-2">
              <div className="flex justify-between"><span>Site safety score</span><span className="font-semibold text-ink">{site.safetyScore}</span></div>
              <div className="flex justify-between"><span>Open actions at site</span><span className="font-semibold text-ink">{site.openActions}</span></div>
              <div className="flex justify-between"><span>Overdue at site</span><span className="font-semibold" style={{ color: site.overdueActions > 0 ? 'var(--critical)' : 'var(--ink)' }}>{site.overdueActions}</span></div>
              <div className="flex justify-between"><span>TRIFR</span><span className="font-semibold text-ink">{site.trifr}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
