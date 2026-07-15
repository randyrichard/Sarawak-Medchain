import { Card, CardHeader, PageHeader, Legend, StatTile } from '../components/ui'
import { TrendLines, MonthBars, ChartBlock } from '../components/charts'
import { useSeries } from '../theme'
import { MONTHLY_KPI, COMPANY } from '../data/mock'

export default function Analytics() {
  const series = useSeries()

  const leadLag = MONTHLY_KPI.map((m) => ({
    month: m.month,
    'Near-miss reports': m.nearMisses,
    Inspections: m.inspections,
  }))

  const ratio = MONTHLY_KPI.map((m) => ({
    month: m.month,
    Ratio: Number((m.nearMisses / Math.max(m.incidents, 1)).toFixed(1)),
  }))

  return (
    <>
      <PageHeader
        title="Executive Analytics"
        subtitle="The board view: is the safety system getting stronger, and is the spend working?"
        right={<span className="rounded-lg border bg-surface px-3 py-1.5 text-xs text-ink-2">FY2026 · Aug 2025 – Jul 2026</span>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="TRIFR vs target" value={`${COMPANY.trifr} / ${COMPANY.trifrTarget}`} footnote="On current slope, target is reached in Nov 2026" />
        <StatTile label="Near-miss : incident ratio" value="7.1×" delta={2.3} goodWhen="up" footnote="Industry benchmark: 10× — reporting culture still maturing" />
        <StatTile label="Est. incident cost avoided" value="RM 2.4M" footnote="Modeled from severity-weighted incident reduction YoY" />
        <StatTile label="Sites trending down" value="1" unit="of 6" footnote="Bintulu — executive review scheduled" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="TRIFR trajectory"
            subtitle="Recordable injury frequency per million hours, against the FY target"
          />
          <ChartBlock legend={<Legend items={[{ color: series[0], label: 'TRIFR (rolling)' }]} />}>
            <TrendLines
              data={MONTHLY_KPI.map((m) => ({ month: m.month, TRIFR: m.trifr }))}
              series={[{ key: 'TRIFR', name: 'TRIFR', color: series[0] }]}
              height={240}
              yDomain={[1, 3]}
              refLine={{ y: 1.5, label: 'FY target 1.5' }}
            />
          </ChartBlock>
        </Card>

        <Card>
          <CardHeader
            title="Near-miss : incident ratio"
            subtitle="The single best leading indicator — higher means hazards get caught before they hurt someone"
          />
          <ChartBlock legend={<Legend items={[{ color: series[1], label: 'Near misses per incident' }]} />}>
            <TrendLines
              data={ratio}
              series={[{ key: 'Ratio', name: 'Ratio', color: series[1] }]}
              height={240}
              yDomain={[3, 9]}
            />
          </ChartBlock>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Leading indicators" subtitle="Proactive activity: inspections and near-miss reporting volume" />
          <ChartBlock legend={<Legend items={[{ color: series[1], label: 'Inspections' }, { color: series[0], label: 'Near-miss reports' }]} />}>
            <TrendLines data={leadLag} series={[
              { key: 'Inspections', name: 'Inspections', color: series[1] },
              { key: 'Near-miss reports', name: 'Near-miss reports', color: series[0] },
            ]} height={230} />
          </ChartBlock>
        </Card>

        <Card>
          <CardHeader title="Lagging indicators" subtitle="Recordable incidents per month, all sites" />
          <ChartBlock legend={<Legend items={[{ color: series[5], label: 'Incidents' }]} />}>
            <MonthBars
              data={MONTHLY_KPI.map((m) => ({ month: m.month, Incidents: m.incidents }))}
              series={[{ key: 'Incidents', name: 'Incidents', color: series[5] }]}
              height={230}
            />
          </ChartBlock>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="The quarter in three sentences" subtitle="What to tell the board" />
        <div className="grid gap-3 px-5 pb-5 pt-1 md:grid-cols-3">
          {[
            ['Performance', 'Group safety score rose from 82 to 84 and TRIFR fell 25% year-on-year. Five of six sites improved; the behavioural-safety program is measurably reducing Unsafe Acts.'],
            ['Risk', 'Bintulu LNG Terminal is the outlier: two critical incidents in 30 days, a 13-point score decline, and CIMAH readiness at 74% with the audit 38 days out. It is the group\'s concentrated risk.'],
            ['Ask', 'Approve the predictive-maintenance investment for Bintulu rotating equipment and a fatigue-risk review for night-shift maintenance — the two interventions the data says will move the number.'],
          ].map(([head, body]) => (
            <div key={head} className="rounded-lg border px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{head}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
