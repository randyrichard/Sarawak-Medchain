import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Layers } from 'lucide-react'
import { dashboardApi, type SiteComparisonRow } from '@/api/dashboardApi'
import { ApiError } from '@/api/types'
import { Card, CardBody, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Every site side by side - the "wider view".
 *
 * The tiles above add the sites together; this answers the question they hide: which site
 * is falling behind. Sites needing attention come first, and clicking one narrows the whole
 * dashboard to it.
 */
export function SiteComparison({
  companyId, projectId, from, to, refresh, onOpenSite,
}: {
  companyId: string
  projectId?: string | null
  from?: string | null
  to?: string | null
  refresh: number
  onOpenSite: (siteId: string) => void
}) {
  const [rows, setRows] = useState<SiteComparisonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setRows(null)
    setError(null)
    dashboardApi.sites({ companyId, projectId, from, to })
      .then((r) => { if (live) setRows(r.rows) })
      .catch((e) => { if (live) { setRows([]); setError(e instanceof ApiError ? e.message : 'Could not compare sites.') } })
    return () => { live = false }
  }, [companyId, projectId, from, to, refresh])

  const num = (n: number, bad = false) => (
    <span className={cn('tabular-nums', n === 0 ? 'text-muted' : bad ? 'font-semibold text-critical' : 'text-ink')}>{n}</span>
  )

  return (
    <Card className="mt-3">
      <CardBody>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Layers size={14} className="text-accent" /> Site comparison
          </h2>
          <p className="text-2xs text-muted">Every site side by side · sites needing attention first · click a site to open it</p>
        </div>

        {error && <p className="text-xs text-critical">{error}</p>}
        {rows === null ? <Skeleton className="h-40" /> : rows.length > 0 && (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Site comparison">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b text-left text-2xs uppercase tracking-wide text-muted">
                  <th className="px-2 py-1.5 font-medium">Site</th>
                  <th className="px-2 py-1.5 text-right font-medium">Open incidents</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="In the period chosen above">Incidents in period</th>
                  <th className="px-2 py-1.5 text-right font-medium">Days without LTI</th>
                  <th className="px-2 py-1.5 text-right font-medium">Overdue actions</th>
                  <th className="px-2 py-1.5 text-right font-medium">Permits active</th>
                  <th className="px-2 py-1.5 font-medium">Toolbox today</th>
                  <th className="px-2 py-1.5 text-right font-medium">Visitors on site</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.siteId}
                    onClick={() => onOpenSite(r.siteId)}
                    className="cursor-pointer border-b last:border-0 hover:bg-sunken"
                  >
                    <td className="px-2 py-2">
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        {r.attention.length > 0
                          ? <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Needs attention" />
                          : <CheckCircle2 size={13} className="shrink-0 text-good" aria-label="Nothing outstanding" />}
                        {r.siteName}
                      </p>
                      {r.attention.length > 0 && <p className="mt-0.5 text-2xs text-warning">{r.attention.join(' · ')}</p>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {num(r.openIncidents)}
                      {r.highRiskOpen > 0 && <p className="whitespace-nowrap text-2xs font-semibold text-critical">{r.highRiskOpen} high-risk</p>}
                    </td>
                    <td className="px-2 py-2 text-right" title={`${r.nearMissesInRange} near miss${r.nearMissesInRange === 1 ? '' : 'es'}, ${r.injuriesInRange} ${r.injuriesInRange === 1 ? 'injury' : 'injuries'}`}>
                      {num(r.incidentsInRange)}
                      {r.injuriesInRange > 0 && <p className="whitespace-nowrap text-2xs text-muted">{r.injuriesInRange} {r.injuriesInRange === 1 ? 'injury' : 'injuries'}</p>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.daysSinceLostTime === null
                        ? <span className="text-2xs text-muted">None on record</span>
                        : <span className={cn('font-semibold tabular-nums', r.daysSinceLostTime <= 30 ? 'text-critical' : 'text-ink')}>{r.daysSinceLostTime}</span>}
                    </td>
                    <td className="px-2 py-2 text-right">{num(r.overdueActions, true)}</td>
                    <td className="px-2 py-2 text-right">{num(r.activePermits)}</td>
                    <td className="px-2 py-2">
                      {r.toolboxToday
                        ? <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 size={12} /> {r.toolboxHeadcount} present</span>
                        : <span className={cn('inline-flex items-center gap-1', r.activePermits > 0 ? 'text-warning' : 'text-muted')}><CircleAlert size={12} /> Not held</span>}
                    </td>
                    <td className="px-2 py-2 text-right">{num(r.visitorsOnSite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
