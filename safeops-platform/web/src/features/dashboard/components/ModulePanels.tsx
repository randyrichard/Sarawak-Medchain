import { Link } from 'react-router-dom'
import { AlertTriangle, HardHat, ClipboardCheck, UserCheck, FileWarning, Mail } from 'lucide-react'
import type { DashboardOverview } from '@/api/dashboardApi'
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { reportStatusLabel, severityBars, visiblePermitStages } from '../lib'

/**
 * The per-module panels below the attention queue.
 *
 * Each one answers "how is this module doing" in a glance and then gets out of the way -
 * every record links into the module that owns it. Deliberately no charts beyond a single
 * severity bar: this page is read standing up, before a shift.
 */

/** A labelled number that links somewhere useful. */
function Stat({ label, value, href, tone }: {
  label: string; value: number; href: string; tone?: 'critical' | 'warning' | 'good'
}) {
  return (
    <Link
      to={href}
      className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-2)]"
    >
      <span className="text-2xs text-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${
        value === 0 ? 'text-muted'
          : tone === 'critical' ? 'text-critical'
            : tone === 'warning' ? 'text-[var(--warning)]'
              : tone === 'good' ? 'text-[var(--good)]' : 'text-ink'
      }`}
      >
        {value}
      </span>
    </Link>
  )
}

export function IncidentPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const bars = severityBars(d)
  return (
    <Card className={className}>
      <CardHeader
        title="Incidents"
        subtitle={`${d.incidents.open} open`}
        right={<Link to="/incidents/board" className="text-2xs font-semibold text-accent">Board</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-1">
          <Stat label="Investigating" value={d.incidents.investigating} href="/incidents/board?status=investigating" />
          <Stat label="Awaiting review" value={d.incidents.awaitingReview} href="/incidents/board?status=awaiting_review" />
          <Stat label="In range" value={d.incidents.inRange} href="/incidents" />
        </div>

        {bars.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="All clear — no open incidents.">
            Nothing is under investigation for this scope.
          </EmptyState>
        ) : (
          <div className="space-y-1.5">
            <p className="text-2xs font-semibold text-muted">Open by severity</p>
            {/* Ordered by rank, so the most serious band is always the top row. */}
            {bars.map((b) => (
              <div key={b.severity} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-2xs text-muted">{b.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${b.percent}%`,
                      background: b.tone === 'critical' ? 'var(--critical)'
                        : b.tone === 'serious' ? 'var(--serious)'
                          : b.tone === 'warning' ? 'var(--warning)' : 'var(--line)',
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-2xs font-semibold tabular-nums text-ink">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        )}

        {d.incidents.recent.length > 0 && (
          <div className="space-y-1">
            <p className="text-2xs font-semibold text-muted">Most recent</p>
            <ul className="divide-y divide-line">
              {d.incidents.recent.slice(0, 4).map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="flex items-center gap-2 py-1.5 hover:bg-[var(--surface-2)]">
                    <span className="font-mono text-2xs text-muted">{i.number}</span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-ink">{i.title}</span>
                    {i.highRisk && <Badge tone="critical">High risk</Badge>}
                    <span className="shrink-0 text-2xs text-muted">{i.severityLabel}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function PermitPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const stages = visiblePermitStages(d)
  const anyPermits = d.permits.byStage.some((s) => s.count > 0)
  return (
    <Card className={className}>
      <CardHeader
        title="Permits to work"
        subtitle={`${d.permits.active} active`}
        right={<Link to="/permits" className="text-2xs font-semibold text-accent">Open</Link>}
      />
      <CardBody className="space-y-3">
        {!anyPermits ? (
          <EmptyState icon={FileWarning} title="No active permits.">
            Nothing is raised for this scope yet.
          </EmptyState>
        ) : (
          <>
            {/* The approval chain in workflow order, from the server's own stage list. */}
            <ul className="space-y-0.5">
              {stages.map((s) => (
                <li key={s.stage}>
                  <Stat
                    label={s.label.replace(/^\w/, (c) => c.toUpperCase())}
                    value={s.count}
                    href={`/permits?status=${s.stage}`}
                    tone={s.stage === 'active' ? 'good' : undefined}
                  />
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-1 border-t border-line pt-2">
              <Stat label="Expiring in 7 days" value={d.permits.expiringSoon} href="/permits?expiring=1" tone="warning" />
              {/* Past their window and never signed off - a real gap, not a stage. */}
              <Stat label="Lapsed, not closed" value={d.permits.expiredOpen} href="/permits?expired=1" tone="critical" />
              <Stat label="Rejected" value={d.permits.rejected} href="/permits?status=rejected" />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

export function EquipmentPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const e = d.equipment
  const anything = e.inService + e.outOfService > 0
  return (
    <Card className={className}>
      <CardHeader
        title="Equipment"
        subtitle={`${e.inService} in service`}
        right={<Link to="/assets" className="text-2xs font-semibold text-accent">Register</Link>}
      />
      <CardBody>
        {!anything ? (
          <EmptyState icon={HardHat} title="No equipment registered.">
            Add plant and safety-critical items to track calibration and inspection.
          </EmptyState>
        ) : (
          <div className="space-y-0.5">
            <Stat label="In service" value={e.inService} href="/assets?status=in_service" tone="good" />
            <Stat label="Out of service" value={e.outOfService} href="/assets?status=out_of_service" tone="warning" />
            <Stat label="Inspection overdue" value={e.inspectionOverdue} href="/assets?bucket=overdue" tone="critical" />
            <Stat label="Calibration expired" value={e.calibrationOverdue} href="/assets?bucket=overdue" tone="critical" />
            <Stat label="No certificate on file" value={e.calibrationMissing} href="/assets?bucket=overdue" tone="critical" />
            <Stat label="Calibration due soon" value={e.calibrationDueSoon} href="/assets?bucket=due" tone="warning" />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function ActionsPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const a = d.actions
  return (
    <Card className={className}>
      <CardHeader
        title="Corrective actions"
        subtitle={a.overdue > 0 ? `${a.overdue} overdue` : 'Nothing overdue'}
        right={<Link to="/actions" className="text-2xs font-semibold text-accent">Register</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-1">
          <Stat label="Overdue" value={a.overdue} href="/actions?due=overdue" tone="critical" />
          <Stat label="Due today" value={a.dueToday} href="/actions?due=today" tone="warning" />
          <Stat label="Due this week" value={a.dueThisWeek} href="/actions?due=week" />
          <Stat label="Closed in range" value={a.completedInRange} href="/actions?status=completed" tone="good" />
        </div>

        {a.byOwner.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No overdue actions." />
        ) : (
          <div className="space-y-1">
            <p className="text-2xs font-semibold text-muted">Overdue by owner</p>
            <ul className="space-y-0.5">
              {a.byOwner.map((o) => (
                <li key={o.owner} className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="min-w-0 truncate text-2xs text-ink">{o.owner}</span>
                  <Badge tone="critical">{o.overdue}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function VisitorPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const v = d.visitors
  return (
    <Card className={className}>
      <CardHeader
        title="Site presence"
        subtitle={`${v.onSite} on site`}
        right={<Link to="/visitors" className="text-2xs font-semibold text-accent">Register</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-1">
          <Stat label="On site" value={v.onSite} href="/visitors?status=on_site" />
          <Stat label="Expected today" value={v.expectedToday} href="/visitors?status=expected" />
          <Stat label="Overdue out" value={v.overdueCheckout} href="/visitors?status=overdue" tone="critical" />
        </div>

        {v.current.length === 0 ? (
          <EmptyState icon={UserCheck} title="Nobody signed in.">
            Visitors appear here as soon as reception checks them in.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {v.current.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-2xs text-ink">
                  {p.name}
                  {p.company && <span className="text-muted"> · {p.company}</span>}
                </span>
                {p.overdueMinutes !== null && p.overdueMinutes > 0
                  ? <Badge tone="critical">{p.overdueMinutes} min over</Badge>
                  : <span className="shrink-0 text-2xs text-muted">
                    out {new Date(p.expectedDeparture).toISOString().slice(11, 16)}
                  </span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

export function ReportPanel({ d, className }: { d: DashboardOverview; className?: string }) {
  const r = d.reports
  return (
    <Card className={className}>
      <CardHeader
        title="Scheduled reports"
        subtitle={r.nextScheduled
          ? `Next: ${r.nextScheduled.name}, ${fmtDateTime(r.nextScheduled.at)}`
          : 'No schedule armed'}
        right={<Link to="/reports" className="text-2xs font-semibold text-accent">Reports</Link>}
      />
      <CardBody>
        {r.recent.length === 0 ? (
          <EmptyState icon={Mail} title="No reports generated yet.">
            Schedule a weekly report and it will be emailed without anyone logging in.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {r.recent.map((run) => {
              const s = reportStatusLabel(run.deliveryStatus)
              return (
                <li key={run.id}>
                  <Link to="/reports" className="flex items-center gap-2 py-1.5 hover:bg-[var(--surface-2)]">
                    <span className="min-w-0 flex-1 truncate text-2xs text-ink">
                      {run.type.replace(/_/g, ' ')}
                    </span>
                    <span className="shrink-0 text-2xs text-muted">{fmtDateTime(run.startedAt)}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </Link>
                  {/* A failed delivery is actionable, so the reason is on the page. */}
                  {run.failureReason && (
                    <p className="pb-1.5 text-2xs text-critical">{run.failureReason}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
