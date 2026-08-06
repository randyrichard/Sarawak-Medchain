import { useEffect, useState } from 'react'
import {
  Users, Clock, AlertTriangle, LogIn, ShieldBan, Car, IdCard, CalendarClock,
} from 'lucide-react'
import { visitorsApi, type VisitorDashboard } from '@/api/visitorsApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Card, CardBody, Skeleton } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * The live board.
 *
 * Built for the moment the alarm sounds: the muster list is the largest thing on the
 * screen, and it is ordered by arrival because that is how a roll call is read. The tiles
 * above it are ordered by how urgently each number changes what somebody does.
 *
 * Every figure is counted in Postgres against one scope in one transaction, so two tiles
 * cannot disagree while somebody is deciding whether everyone is accounted for.
 */
export function VisitorBoard({
  companyId, siteId, revision, onOpen,
}: {
  companyId: string
  siteId?: string
  revision?: number
  onOpen: (id: string) => void
}) {
  const [data, setData] = useState<VisitorDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    visitorsApi.dashboard(companyId, siteId)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the visitor board.'))
  }, [companyId, siteId, revision])

  if (error) return <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>

  const tiles: { label: string; value: number | undefined; icon: typeof Users; tone?: string; hint?: string }[] = [
    { label: 'On site now', value: data?.onSite, icon: Users, tone: 'var(--accent)' },
    { label: 'Overdue', value: data?.overdue, icon: AlertTriangle,
      tone: data?.overdue ? 'var(--critical)' : undefined,
      hint: 'Still inside past their departure time' },
    { label: 'Expected today', value: data?.expectedToday, icon: CalendarClock },
    { label: 'Checked in today', value: data?.checkedInToday, icon: LogIn },
    { label: 'Vehicles on site', value: data?.vehiclesOnSite, icon: Car,
      hint: 'Distinct vehicles, not visitors' },
    { label: 'Badges out', value: data?.badgesOut, icon: IdCard },
    { label: 'Denied today', value: data?.deniedToday, icon: ShieldBan,
      tone: data?.deniedToday ? 'var(--warning)' : undefined },
    { label: 'Blacklisted attempts', value: data?.blacklistedToday, icon: ShieldBan,
      tone: data?.blacklistedToday ? 'var(--critical)' : undefined },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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

      <Card>
        <CardBody>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Users size={12} /> Muster list
            {data && <span className="text-accent">({data.onSite} inside)</span>}
          </p>

          {data === null ? (
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : data.onSiteList.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-2xs text-muted">
              Nobody is on site.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.onSiteList.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onOpen(r.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left transition hover:border-accent hover:bg-accent-soft/30',
                      r.overdueMinutes !== null && 'border-critical/60 bg-critical-soft/20',
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {r.name}
                      {r.badgeNumber && <Badge tone="neutral">Badge {r.badgeNumber}</Badge>}
                      {r.overdueMinutes !== null && (
                        <Badge tone="critical">
                          {r.overdueMinutes < 60
                            ? `${r.overdueMinutes} min overdue`
                            : `${Math.floor(r.overdueMinutes / 60)}h overdue`}
                        </Badge>
                      )}
                    </p>
                    <p className="text-2xs text-muted">
                      <span className="font-mono">{r.code}</span>
                      {r.visitorCompany && <> · {r.visitorCompany}</>}
                      {r.host && <> · host {r.host}</>}
                      {r.vehicleNumber && <> · {r.vehicleNumber}</>}
                    </p>
                    {r.checkedInAt && (
                      <p className="text-2xs text-muted">In since {fmtDateTime(r.checkedInAt)}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            On site by company
          </p>
          {data === null ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : data.byCompany.length === 0 ? (
            <p className="text-2xs text-muted">Nobody is on site.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.byCompany.map((r) => {
                const max = Math.max(1, ...data.byCompany.map((x) => x.value))
                return (
                  <li key={r.name} className="flex items-center gap-2 text-2xs">
                    <span className="w-40 shrink-0 truncate text-ink">{r.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-accent-soft">
                      <span className="block h-full rounded-full bg-accent"
                        style={{ width: `${(r.value / max) * 100}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-medium text-ink">{r.value}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

export { Clock }
