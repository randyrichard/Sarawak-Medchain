import type { AuditStats } from '@/api/audits'
import type { Site } from '@/api/types'
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars, RankedBars } from '@/components/charts/Charts'

export function AuditAnalyticsView({ stats, sites }: { stats: AuditStats | null; sites: Site[] }) {
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
        <CardHeader title="Most common findings" subtitle="Top non-conformity categories across all audits — fix the pattern, not the instance" />
        <CardBody>
          {stats.findingsByCategory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No findings recorded yet.</p>
          ) : (
            <RankedBars data={stats.findingsByCategory} color="var(--s1)"
              highlight={(d) => (d.value >= 2 ? 'var(--s6)' : undefined)} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Audits & findings trend" subtitle="Completed audits vs findings raised, trailing 6 months" />
        <CardBody>
          <ChartBlock legend={<ChartLegend items={[{ color: 'var(--s2)', label: 'Audits completed' }, { color: 'var(--s3)', label: 'Findings raised' }]} />}>
            <GroupedBars
              data={stats.monthlyTrend}
              series={[
                { key: 'Audits', name: 'Audits', color: 'var(--s2)' },
                { key: 'Findings', name: 'Findings', color: 'var(--s3)' },
              ]}
              height={220}
            />
          </ChartBlock>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Open findings by site" subtitle="Where the audit debt sits" />
        <CardBody>
          {stats.bySiteOpenFindings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No open findings — clean slate.</p>
          ) : (
            <RankedBars
              data={stats.bySiteOpenFindings.map((s) => ({ name: siteShort(s.name), value: s.value }))}
              color="var(--s1)"
              highlight={(d) => (d.value >= 2 ? 'var(--critical)' : undefined)}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Open findings by department" subtitle="Department performance — who clears their findings" />
        <CardBody>
          {stats.byDeptOpenFindings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No open findings by department.</p>
          ) : (
            <RankedBars data={stats.byDeptOpenFindings} color="var(--s5)" />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
