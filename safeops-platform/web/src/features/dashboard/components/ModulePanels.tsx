import { Link } from 'react-router-dom'
import { AlertTriangle, HardHat, ClipboardCheck, UserCheck, FileWarning, Mail } from 'lucide-react'
import type { DashboardOverview } from '@/api/dashboardApi'
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { linkTo, type PermitStatusFilter } from '@/lib/links'
import { permitStageLabel, reportStatusLabel, severityBars, visiblePermitStages } from '../lib'

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
        right={<Link to="/incidents/board" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Board</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-1">
          <Stat label="Investigating" value={d.incidents.investigating} href={linkTo.incidents('investigating')} />
          <Stat label="Awaiting Review" value={d.incidents.awaitingReview} href={linkTo.incidents('awaiting_review')} />
          <Stat label="In Range" value={d.incidents.inRange} href="/incidents" />
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
                  <Link to={`/incidents/${i.id}`} className="flex items-center gap-2 py-1.5 hover:bg-[var(--surface-2)] coarse:min-h-11">
                    <span className="font-mono text-2xs text-muted">{i.number}</span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-ink">{i.title}</span>
                    {i.highRisk && <Badge tone="critical">High Risk</Badge>}
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
        title="Permits to Work"
        subtitle={`${d.permits.active} active`}
        right={<Link to="/permits" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Open</Link>}
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
                    label={permitStageLabel(s.stage, s.label)}
                    value={s.count}
                    href={linkTo.permits(s.stage as PermitStatusFilter)}
                    tone={s.stage === 'active' ? 'good' : undefined}
                  />
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-1 border-t border-line pt-2">
              <Stat label="Expiring in 7 Days" value={d.permits.expiringSoon} href={linkTo.permits('expiring')} tone="warning" />
              {/* Past their window and never signed off - a real gap, not a stage. */}
              <Stat label="Lapsed, Not Closed" value={d.permits.expiredOpen} href={linkTo.permits('expired')} tone="critical" />
              <Stat label="Rejected" value={d.permits.rejected} href={linkTo.permits('rejected')} />
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
        right={<Link to="/assets" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Register</Link>}
      />
      <CardBody>
        {!anything ? (
          <EmptyState icon={HardHat} title="No equipment registered.">
            Add plant and safety-critical items to track calibration and inspection.
          </EmptyState>
        ) : (
          <div className="space-y-0.5">
            <Stat label="In Service" value={e.inService} href={linkTo.assets({ status: 'In Service' })} tone="good" />
            {/* Includes equipment under maintenance; the board shows the two side by side. */}
            <Stat label="Out of Service" value={e.outOfService} href={linkTo.equipmentBoard()} tone="warning" />
            <Stat label="Inspection Overdue" value={e.inspectionOverdue} href={linkTo.assets({ bucket: 'overdue' })} tone="critical" />
            {/* Calibration is counted on the equipment board; the register cannot filter by it. */}
            <Stat label="Calibration Expired" value={e.calibrationOverdue} href={linkTo.equipmentBoard()} tone="critical" />
            <Stat label="No Certificate on File" value={e.calibrationMissing} href={linkTo.equipmentBoard()} tone="critical" />
            <Stat label="Calibration Due Soon" value={e.calibrationDueSoon} href={linkTo.equipmentBoard()} tone="warning" />
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
        title="Corrective Actions"
        subtitle={a.overdue > 0 ? `${a.overdue} overdue` : 'Nothing overdue'}
        right={<Link to="/actions" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Register</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-1">
          <Stat label="Overdue" value={a.overdue} href={linkTo.actions('overdue')} tone="critical" />
          <Stat label="Due Today" value={a.dueToday} href={linkTo.actions('due_today')} tone="warning" />
          <Stat label="Due This Week" value={a.dueThisWeek} href={linkTo.actions('due_week')} />
          <Stat label="Closed in Range" value={a.completedInRange} href={linkTo.actions('completed')} tone="good" />
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
        title="Site Presence"
        subtitle={`${v.onSite} on site`}
        right={<Link to="/visitors" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Register</Link>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-1">
          <Stat label="On Site" value={v.onSite} href={linkTo.visitors('on_site')} />
          <Stat label="Expected Today" value={v.expectedToday} href={linkTo.visitors('today')} />
          <Stat label="Overdue Out" value={v.overdueCheckout} href={linkTo.visitors('overdue')} tone="critical" />
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
        title="Scheduled Reports"
        subtitle={r.nextScheduled
          ? `Next: ${r.nextScheduled.name}, ${fmtDateTime(r.nextScheduled.at)}`
          : 'No schedule armed'}
        right={<Link to="/reports" className="text-2xs font-semibold text-accent coarse:inline-flex coarse:min-h-11 coarse:items-center">Reports</Link>}
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
                  <Link to="/reports" className="flex items-center gap-2 py-1.5 hover:bg-[var(--surface-2)] coarse:min-h-11">
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
