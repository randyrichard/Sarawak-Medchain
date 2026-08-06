import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes, Star, ShieldAlert, Wrench, ClipboardCheck, Gauge, CircleCheck, AlertTriangle,
  FileCheck, Archive, Clock, PackagePlus,
} from 'lucide-react'
import { equipmentApi, type EquipmentDashboard } from '@/api/equipmentApi'
import { CATEGORY_LABEL, type AssetCategory } from '@/api/assets'
import { ApiError } from '@/api/types'
import { Alert, Badge, Card, CardBody, Skeleton } from '@/components/ui'
import { fmtDate, fmtDateTime } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * The equipment board.
 *
 * Ordered by how urgently each number changes what somebody does, not by how it groups
 * conceptually: what is unusable now, then what lapses next, then the shape of the
 * register. Every figure is counted in Postgres in one transaction against one scope, so
 * two tiles cannot disagree.
 */
export function EquipmentBoard({ companyId, siteId }: { companyId: string; siteId?: string }) {
  const [data, setData] = useState<EquipmentDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    equipmentApi.dashboard(companyId, siteId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the equipment board.'))
  }, [companyId, siteId])

  if (error) return <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>

  const tiles: { label: string; value: number | undefined; icon: typeof Boxes; tone?: string; hint?: string }[] = [
    { label: 'Available', value: data?.available, icon: CircleCheck, tone: 'var(--good)',
      hint: 'In service with nothing overdue' },
    { label: 'Out of service', value: data?.outOfService, icon: ShieldAlert,
      tone: data?.outOfService ? 'var(--critical)' : undefined },
    { label: 'Under maintenance', value: data?.underMaintenance, icon: Wrench,
      tone: data?.underMaintenance ? 'var(--warning)' : undefined },
    { label: 'Inspection overdue', value: data?.inspectionOverdue, icon: ClipboardCheck,
      tone: data?.inspectionOverdue ? 'var(--critical)' : undefined },
    { label: 'Inspection due today', value: data?.inspectionDueToday, icon: ClipboardCheck,
      tone: data?.inspectionDueToday ? 'var(--warning)' : undefined },
    { label: 'Calibration expired', value: data?.calibrationExpired, icon: Gauge,
      tone: data?.calibrationExpired ? 'var(--critical)' : undefined,
      hint: 'Includes instruments with no certificate at all' },
    { label: 'Calibration due', value: data?.calibrationDue, icon: Gauge,
      tone: data?.calibrationDue ? 'var(--warning)' : undefined },
    { label: 'Maintenance overdue', value: data?.maintenanceOverdue, icon: AlertTriangle,
      tone: data?.maintenanceOverdue ? 'var(--critical)' : undefined },
    { label: 'Maintenance open', value: data?.maintenanceOpen, icon: Wrench },
    { label: 'Booked to a permit', value: data?.bookedToPermit, icon: FileCheck,
      hint: 'On a live permit right now' },
    { label: 'Critical equipment', value: data?.critical, icon: Star,
      hint: 'Failure hurts someone directly' },
    { label: 'Retired or disposed', value: data?.retired, icon: Archive },
    { label: 'Total in register', value: data?.total, icon: Boxes,
      hint: 'Excludes disposed and retired' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardBody className="py-3">
              <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted">
                <t.icon size={11} /> {t.label}
              </p>
              {t.value === undefined ? (
                <Skeleton className="mt-1 h-7 w-12" />
              ) : (
                <p className="mt-0.5 text-2xl font-bold" style={{ color: t.tone }}>{t.value}</p>
              )}
              {t.hint && <p className="text-2xs text-muted">{t.hint}</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="By category"
          rows={data?.byCategory.map((r) => ({
            ...r,
            name: CATEGORY_LABEL[r.name as AssetCategory] ?? r.name,
          }))}
        />
        <Breakdown title="By site" rows={data?.bySite} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <Clock size={11} /> Work orders coming due
            </p>
            {data === null ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : data.upcomingWorkOrders.length === 0 ? (
              <p className="text-2xs text-muted">Nothing scheduled ahead. Overdue work has its own tile.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.upcomingWorkOrders.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-2 text-2xs">
                    <div className="min-w-0">
                      <p className="text-ink">
                        <span className="font-mono">{w.code}</span> — {w.assetName}
                      </p>
                      <p className="truncate text-muted">{w.description}</p>
                    </div>
                    <span className="shrink-0 text-muted">
                      {w.dueAt ? fmtDate(w.dueAt) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <PackagePlus size={11} /> Newest equipment
            </p>
            {data === null ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : data.newest.length === 0 ? (
              <p className="text-2xs text-muted">Nothing registered yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.newest.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2 text-2xs">
                    <div className="min-w-0">
                      <p className="text-ink">{a.name}</p>
                      <Link to={`/assets?qr=${a.code}`} className="font-mono text-accent hover:underline">
                        {a.code}
                      </Link>
                    </div>
                    <span className="shrink-0 text-muted">{fmtDate(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Recent inspections</p>
            {data === null ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : data.recentInspections.length === 0 ? (
              <p className="text-2xs text-muted">None completed yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.recentInspections.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 text-2xs">
                    <div className="min-w-0">
                      <p className="text-ink">
                        <span className="font-mono">{i.code}</span> — {i.assetName}
                      </p>
                      <p className="text-muted">
                        {i.at ? fmtDateTime(i.at) : '—'} · {i.by ?? '—'}
                      </p>
                    </div>
                    <Badge tone={i.outcome === 'failed' ? 'critical' : 'good'}>
                      {i.outcome === 'failed' ? 'Failed' : 'Passed'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Recent maintenance</p>
            {data === null ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : data.recentMaintenance.length === 0 ? (
              <p className="text-2xs text-muted">No work orders raised.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.recentMaintenance.map((w) => (
                  <li key={w.id} className="flex items-start justify-between gap-2 text-2xs">
                    <div className="min-w-0">
                      <p className="text-ink">
                        <span className="font-mono">{w.code}</span> — {w.assetName}
                      </p>
                      <p className="truncate text-muted">{w.description}</p>
                      <Link to={`/assets?qr=${w.assetCode}`} className="text-accent hover:underline">
                        {w.assetCode}
                      </Link>
                    </div>
                    <Badge tone={w.status === 'completed' ? 'good' : w.kind === 'emergency' ? 'critical' : 'accent'}>
                      {w.status === 'in_progress' ? 'In progress' : w.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/** A count per group, as bars. Proportional to the largest row, not to the total. */
function Breakdown({ title, rows }: { title: string; rows?: { name: string; value: number }[] }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.value))
  return (
    <Card>
      <CardBody>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title}</p>
        {rows === undefined ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="text-2xs text-muted">Nothing registered yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, 10).map((r) => (
              <li key={r.name} className="flex items-center gap-2 text-2xs">
                <span className="w-36 shrink-0 truncate text-ink">{r.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-accent-soft">
                  <span
                    className={cn('block h-full rounded-full bg-accent')}
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-medium text-ink">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
