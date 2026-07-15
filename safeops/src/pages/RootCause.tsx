import { Card, CardHeader, PageHeader, Legend, StatusPill } from '../components/ui'
import { TrendLines, MonthBars, Heatmap, ChartBlock, RankedBars } from '../components/charts'
import { useSeries } from '../theme'
import { MONTHS, ROOT_CAUSES, ROOT_CAUSE_MONTHLY, ROOT_CAUSE_BY_SITE, SITES, DEPARTMENTS } from '../data/mock'

export default function RootCause() {
  const series = useSeries()

  const monthly = MONTHS.map((m, i) => {
    const row: Record<string, string | number> = { month: m }
    ROOT_CAUSES.forEach((rc) => (row[rc] = ROOT_CAUSE_MONTHLY[rc][i]))
    return row
  })

  const causeSeries = ROOT_CAUSES.map((rc, i) => ({ key: rc, name: rc, color: series[i] }))
  const legendItems = ROOT_CAUSES.map((rc, i) => ({ color: series[i], label: rc }))

  const heatValues = ROOT_CAUSES.map((rc) => ROOT_CAUSE_BY_SITE[rc])

  const deptIncidents = [...DEPARTMENTS].sort((a, b) => b.incidents - a.incidents).map((d) => ({ name: d.name, value: d.incidents }))

  return (
    <>
      <PageHeader
        title="Root Cause Analytics"
        subtitle="Where incidents actually come from — so prevention budgets go to the right category"
        right={<StatusPill kind="serious" label="Human Factors trending up 3×" />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Root cause trend by month"
            subtitle="Human Factors overtook Unsafe Acts in March and is still climbing"
          />
          <ChartBlock legend={<Legend items={legendItems} />}>
            <TrendLines data={monthly} series={causeSeries} height={250} />
          </ChartBlock>
        </Card>

        <Card>
          <CardHeader title="Monthly composition" subtitle="Total incidents stacked by root cause" />
          <ChartBlock legend={<Legend items={legendItems} />}>
            <MonthBars data={monthly} series={causeSeries} height={250} stacked />
          </ChartBlock>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Root cause × site heatmap"
          subtitle="Trailing 12 months — darker means more incidents. Bintulu dominates Equipment Failure and Human Factors."
        />
        <div className="px-5 pb-5 pt-2">
          <Heatmap rows={[...ROOT_CAUSES]} cols={SITES.map((s) => s.short)} values={heatValues} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Incidents by department" subtitle="Contractors and Maintenance account for 48% of all incidents" />
          <ChartBlock>
            <RankedBars data={deptIncidents} color={series[0]} highlight={(d) => (d.value >= 28 ? 'var(--critical)' : undefined)} />
          </ChartBlock>
        </Card>

        <Card>
          <CardHeader title="What the data is saying" subtitle="Auto-generated insights from the trailing 12 months" />
          <ul className="space-y-3 px-5 pb-5 pt-1">
            {[
              ['Human Factors incidents tripled since January (2 → 6/month).', 'Concentrated in Maintenance night shifts at Bintulu and Miri contractor crews. A fatigue-risk and shift-handover review is the highest-leverage intervention available.'],
              ['Unsafe Acts are falling steadily (5 → 3/month).', 'Coincides with the behavioural-safety rollout completed in February — evidence the program is working. Sustain, don\'t expand, that budget.'],
              ['Equipment Failure is flat but severe.', 'Only ~2/month, but they produced both critical incidents this quarter. Failure severity, not frequency, justifies the predictive-maintenance investment at Bintulu.'],
              ['Environmental Factors are seasonal.', 'Cluster in monsoon months (Oct–Dec) and heat peaks (Jun–Jul). Pre-position controls a month before each season instead of reacting.'],
            ].map(([head, body]) => (
              <li key={head} className="rounded-lg border px-4 py-3">
                <p className="text-[13px] font-semibold text-ink">{head}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{body}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
