import { useMemo, useState } from 'react'
import type { DashboardCharts } from '@/api/dashboard'
import { Card, CardHeader, Skeleton, Tabs, type TabItem } from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars, RankedBars, TrendChart } from '@/components/charts/Charts'

type View = 'trends' | 'behaviours' | 'causes' | 'actions' | 'yoy'

const TABS: TabItem<View>[] = [
  { value: 'trends', label: 'Incidents & LTI' },
  { value: 'behaviours', label: 'Behaviours' },
  { value: 'causes', label: 'Root causes' },
  { value: 'actions', label: 'Action closure' },
  { value: 'yoy', label: 'Year vs year' },
]

const STORY: Record<View, string> = {
  trends: 'Incidents trending down while near-misses rise — hazards are being caught earlier instead of becoming injuries.',
  behaviours: 'Unsafe acts still outnumber unsafe conditions ~3:2. Behaviour, not hardware, is the bigger lever right now.',
  causes: 'Unsafe Acts and Human Factors together drive most incidents — both respond to supervision and fatigue controls, not capex.',
  actions: 'Action closure discipline is improving toward the 90% target — the escalation ladder is doing its job.',
  yoy: 'Incidents are down roughly a third against the same months last year. The program is working; Bintulu is the exception.',
}

export function PerformanceCharts({
  charts, loading, className,
}: {
  charts: DashboardCharts | undefined
  loading: boolean
  className?: string
}) {
  const [view, setView] = useState<View>('trends')

  const monthly = useMemo(() => {
    if (!charts) return []
    return charts.months.map((month, i) => ({
      month,
      Incidents: charts.incidents[i],
      'Near Misses': charts.nearMisses[i],
      LTI: charts.lti[i],
      'Unsafe Acts': charts.unsafeActs[i],
      'Unsafe Conditions': charts.unsafeConditions[i],
      'Completion %': charts.actionCompletion[i],
      'This year': charts.incidents[i],
      'Last year': charts.incidentsLastYear[i],
    }))
  }, [charts])

  return (
    <Card className={className}>
      <CardHeader title="Safety performance" subtitle={charts ? STORY[view] : 'Loading trailing 12 months…'} />
      <div className="px-5 pb-5">
        <Tabs items={TABS} value={view} onChange={setView} className="mb-4" />
        {loading || !charts ? (
          <div className="space-y-3 py-2" aria-hidden>
            <Skeleton className="h-3 w-40" />
            <div className="flex h-52 items-end gap-2">
              {[40, 60, 45, 75, 55, 85, 65, 50, 80, 62, 70, 90].map((h, i) => (
                <div key={i} className="w-full animate-pulse rounded-t-md bg-grid" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {view === 'trends' && (
              <ChartBlock
                legend={
                  <ChartLegend
                    items={[
                      { color: 'var(--s6)', label: 'Incidents' },
                      { color: 'var(--s1)', label: 'Near Misses' },
                      { color: 'var(--s3)', label: 'Lost Time Injuries' },
                    ]}
                  />
                }
              >
                <TrendChart
                  data={monthly}
                  series={[
                    { key: 'Incidents', name: 'Incidents', color: 'var(--s6)' },
                    { key: 'Near Misses', name: 'Near Misses', color: 'var(--s1)' },
                    { key: 'LTI', name: 'LTI', color: 'var(--s3)' },
                  ]}
                />
              </ChartBlock>
            )}
            {view === 'behaviours' && (
              <ChartBlock
                legend={
                  <ChartLegend
                    items={[
                      { color: 'var(--s6)', label: 'Unsafe Acts observed' },
                      { color: 'var(--s3)', label: 'Unsafe Conditions found' },
                    ]}
                  />
                }
              >
                <TrendChart
                  data={monthly}
                  series={[
                    { key: 'Unsafe Acts', name: 'Unsafe Acts', color: 'var(--s6)' },
                    { key: 'Unsafe Conditions', name: 'Unsafe Conditions', color: 'var(--s3)' },
                  ]}
                />
              </ChartBlock>
            )}
            {view === 'causes' && (
              <RankedBars
                data={charts.rootCauses}
                color="var(--s1)"
                highlight={(d) => (d.name === 'Unsafe Acts' || d.name === 'Human Factors' ? 'var(--s6)' : undefined)}
                height={230}
              />
            )}
            {view === 'actions' && (
              <ChartBlock legend={<ChartLegend items={[{ color: 'var(--s2)', label: 'On-time completion rate' }]} />}>
                <TrendChart
                  data={monthly}
                  series={[{ key: 'Completion %', name: 'Completion', color: 'var(--s2)' }]}
                  yDomain={[50, 100]}
                  refLine={{ y: 90, label: 'Target 90%' }}
                  suffix="%"
                />
              </ChartBlock>
            )}
            {view === 'yoy' && (
              <ChartBlock
                legend={
                  <ChartLegend
                    items={[
                      { color: 'var(--s1)', label: 'Incidents — this year' },
                      { color: 'var(--grid)', label: 'Incidents — last year' },
                    ]}
                  />
                }
              >
                <GroupedBars
                  data={monthly}
                  series={[
                    { key: 'Last year', name: 'Last year', color: 'var(--grid)' },
                    { key: 'This year', name: 'This year', color: 'var(--s1)' },
                  ]}
                />
              </ChartBlock>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
