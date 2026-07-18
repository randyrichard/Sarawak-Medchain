import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { CapaAnalytics } from '@/api/capa'
import type { Site } from '@/api/types'
import { Avatar, Badge, Card, CardBody, CardHeader, Skeleton } from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars, RankedBars } from '@/components/charts/Charts'

export function CapaAnalyticsView({ companyId, sites }: { companyId: string | null; sites: Site[] }) {
  const [data, setData] = useState<CapaAnalytics | null>(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setData(null)
    api.capaAnalytics(companyId).then((d) => !cancelled && setData(d))
    return () => {
      cancelled = true
    }
  }, [companyId])

  const siteShort = (id: string) => sites.find((s) => s.id === id)?.short ?? id.toUpperCase()

  if (!data) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    )
  }

  const tiles: { label: string; value: string; tone?: string; note: string }[] = [
    { label: 'Completion rate', value: `${data.completionRate}%`, tone: data.completionRate >= 70 ? 'var(--good)' : 'var(--warning)', note: 'verified of all raised' },
    { label: 'Avg. close time', value: data.avgCloseDays !== null ? `${data.avgCloseDays}d` : '—', note: 'creation → verification' },
    { label: 'On-time completion', value: `${data.onTimeRate}%`, tone: data.onTimeRate >= 80 ? 'var(--good)' : 'var(--serious)', note: 'completed by due date' },
    {
      label: 'Most overdue site',
      value: data.mostOverdueSite ? siteShort(data.mostOverdueSite.site) : 'None',
      tone: data.mostOverdueSite ? 'var(--critical)' : 'var(--good)',
      note: data.mostOverdueSite ? `${data.mostOverdueSite.count} overdue action(s)` : 'no overdue actions',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={t.label} className="animate-rise px-4 py-3.5" >
            <p className="text-2xs font-semibold text-ink-2" style={{ animationDelay: `${i * 40}ms` }}>{t.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: t.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              {t.value}
            </p>
            <p className="text-2xs text-muted">{t.note}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Open workload by site" subtitle="Active + awaiting verification — where the load sits" />
          <CardBody>
            <RankedBars
              data={data.bySite.map((s) => ({ name: siteShort(s.name), value: s.value }))}
              color="var(--s1)"
              highlight={(d) => (data.mostOverdueSite && siteShort(data.mostOverdueSite.site) === d.name ? 'var(--critical)' : undefined)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Department on-time performance" subtitle="% of completed actions finished by their due date" />
          <CardBody>
            {data.byDepartment.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Not enough completed actions yet.</p>
            ) : (
              <RankedBars
                data={data.byDepartment}
                color="var(--s2)"
                highlight={(d) => (d.value < 60 ? 'var(--serious)' : undefined)}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Created vs completed" subtitle="Is the backlog growing or shrinking? Bars should converge." />
          <CardBody>
            <ChartBlock legend={<ChartLegend items={[{ color: 'var(--grid)', label: 'Created' }, { color: 'var(--s2)', label: 'Completed' }]} />}>
              <GroupedBars
                data={data.monthlyCompletions}
                series={[
                  { key: 'Created', name: 'Created', color: 'var(--grid)' },
                  { key: 'Completed', name: 'Completed', color: 'var(--s2)' },
                ]}
                height={220}
              />
            </ChartBlock>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Owner load" subtitle="Who is carrying the most — and who is behind" />
          <CardBody className="space-y-2">
            {data.byOwner.map((o) => (
              <div key={o.name} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
                <Avatar name={o.name} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{o.name}</span>
                <span className="text-2xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{o.completed} done</span>
                <Badge tone="accent">{o.open} open</Badge>
                {o.overdue > 0 && <Badge tone="critical">{o.overdue} overdue</Badge>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
