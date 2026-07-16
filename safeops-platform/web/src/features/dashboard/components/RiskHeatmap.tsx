import { useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { RiskBand, SiteRisk } from '@/api/dashboard'
import { Card, CardHeader, Dialog, Skeleton, StatusPill, Button } from '@/components/ui'
import { Sparkline } from '@/components/charts/Sparkline'
import { TrendChart } from '@/components/charts/Charts'
import { MONTHS } from '@/api/mock/dashboard'
import { useOrg } from '@/features/org/OrgContext'
import { cn } from '@/lib/cn'

const BAND: Record<RiskBand, { color: string; soft: string; label: string; pill: 'good' | 'warning' | 'serious' | 'critical' }> = {
  green: { color: 'var(--good)', soft: 'var(--good-soft)', label: 'Healthy', pill: 'good' },
  yellow: { color: 'var(--warning)', soft: 'var(--warning-soft)', label: 'Watch', pill: 'warning' },
  orange: { color: 'var(--serious)', soft: 'var(--serious-soft)', label: 'At risk', pill: 'serious' },
  red: { color: 'var(--critical)', soft: 'var(--critical-soft)', label: 'Intervene', pill: 'critical' },
}

export function RiskHeatmap({ sites, loading }: { sites: SiteRisk[] | undefined; loading: boolean }) {
  const [open, setOpen] = useState<SiteRisk | null>(null)
  const { switchSite } = useOrg()

  return (
    <Card>
      <CardHeader
        title="Site risk map"
        subtitle="Every site, one glance — colored by safety-score band. Click a site to inspect it."
        right={
          <span className="hidden items-center gap-3 text-2xs text-muted md:flex">
            {(['green', 'yellow', 'orange', 'red'] as RiskBand[]).map((b) => (
              <span key={b} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: BAND[b].color }} />
                {BAND[b].label}
              </span>
            ))}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2 md:grid-cols-3 xl:grid-cols-6">
        {loading || !sites
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
          : sites.map((site, i) => {
              const band = BAND[site.band]
              return (
                <button
                  key={site.id}
                  onClick={() => setOpen(site)}
                  className="animate-rise rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop"
                  style={{ animationDelay: `${i * 45}ms`, background: band.soft, borderColor: band.color }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-ink">{site.short}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: band.color }} aria-label={band.label} />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {site.score}
                    </span>
                    <span
                      className="inline-flex items-center gap-0.5 text-2xs font-semibold"
                      style={{ color: site.delta12mo >= 0 ? 'var(--delta-good)' : 'var(--critical)' }}
                    >
                      {site.delta12mo >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {site.delta12mo > 0 ? '+' : ''}{site.delta12mo}
                    </span>
                  </div>
                  <p className={cn('mt-1 text-2xs', site.overdueActions > 0 ? 'font-medium text-ink-2' : 'text-muted')}>
                    {site.openIncidents} open · {site.overdueActions} overdue
                  </p>
                </button>
              )
            })}
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name ?? ''}
        description={open ? `${open.headcount.toLocaleString()} workers · TRIFR ${open.trifr}` : undefined}
        width="max-w-lg"
        footer={
          open && (
            <>
              <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
              <Button
                onClick={() => {
                  switchSite(open.id)
                  setOpen(null)
                }}
              >
                Focus dashboard on this site
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-ink">{open.score}</span>
                <span className="text-xs text-muted">/ 100 safety score</span>
              </div>
              <StatusPill kind={BAND[open.band].pill} label={BAND[open.band].label} />
            </div>
            <TrendChart
              data={open.trend.map((v, i) => ({ month: MONTHS[i], Score: v }))}
              series={[{ key: 'Score', name: 'Safety score', color: BAND[open.band].color }]}
              height={150}
              yDomain={[50, 100]}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Open incidents', String(open.openIncidents)],
                ['High-risk open', String(open.highRisk)],
                ['Overdue actions', String(open.overdueActions)],
                ['Compliance', `${open.compliance}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border px-3 py-2">
                  <p className="text-2xs text-muted">{label}</p>
                  <p className="text-base font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-2xs text-muted">
              <span>12-month trajectory</span>
              <Sparkline data={open.trend} width={90} height={20} stroke={BAND[open.band].color} />
              <span style={{ color: open.delta12mo >= 0 ? 'var(--delta-good)' : 'var(--critical)' }} className="font-semibold">
                {open.delta12mo > 0 ? '+' : ''}{open.delta12mo} pts
              </span>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
