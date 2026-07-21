import type { AssetStats } from '@/api/assets'
import type { Site } from '@/api/types'
import { Card, CardBody, CardHeader, Skeleton, StatusPill } from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars, RankedBars } from '@/components/charts/Charts'
import { healthColor } from '../lib'

export function AssetAnalytics({
  stats, sites, onOpenAsset,
}: {
  stats: AssetStats | null
  sites: Site[]
  onOpenAsset: (id: string) => void
}) {
  if (!stats) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    )
  }
  const siteShort = (id: string) => sites.find((s) => s.id === id)?.short ?? id.toUpperCase()

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Inspections — completed vs failed" subtitle="Trailing 6 months. Failures are good news: defects found before they hurt someone." />
        <CardBody>
          <ChartBlock legend={<ChartLegend items={[{ color: 'var(--s2)', label: 'Completed' }, { color: 'var(--s6)', label: 'Of which failed' }]} />}>
            <GroupedBars
              data={stats.monthlyTrend}
              series={[
                { key: 'Completed', name: 'Completed', color: 'var(--s2)' },
                { key: 'Failed', name: 'Failed', color: 'var(--s6)' },
              ]}
              height={220}
            />
          </ChartBlock>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Average asset health by site" subtitle="Lowest first — where inspection discipline is slipping" />
        <CardBody>
          <RankedBars
            data={stats.bySiteHealth.map((s) => ({ name: siteShort(s.name), value: s.value }))}
            color="var(--s1)"
            highlight={(d) => (d.value < 70 ? 'var(--critical)' : d.value < 85 ? 'var(--warning)' : undefined)}
          />
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="Highest-risk assets" subtitle="The five assets most likely to bite — click to open" />
        <CardBody className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {stats.highestRisk.map((a) => (
            <button
              key={a.code}
              onClick={() => onOpenAsset(a.code.toLowerCase())}
              className="rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop"
              style={{ borderColor: healthColor(a.health) }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xs text-muted">{a.code}</span>
                <span className="text-lg font-semibold" style={{ color: healthColor(a.health), fontVariantNumeric: 'tabular-nums' }}>{a.health}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-ink">{a.name}</p>
              <p className="mt-1 text-2xs text-muted">{siteShort(a.siteId)}</p>
            </button>
          ))}
          {stats.highestRisk.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted">
              <StatusPill kind="good" label="All assets healthy" />
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
