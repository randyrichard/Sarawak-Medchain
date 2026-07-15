import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, CardHeader, StatTile, ScoreRing, StatusPill, PageHeader, Legend, ProgressBar } from '../components/ui'
import { TrendLines, MonthBars, RankedBars, ChartBlock } from '../components/charts'
import { useSeries } from '../theme'
import {
  MONTHLY_KPI, COMPANY, SITES, DEPARTMENTS, ROOT_CAUSES, ROOT_CAUSE_MONTHLY,
  ACTIONS, ATTENTION_ITEMS,
} from '../data/mock'

export default function Dashboard() {
  const series = useSeries()

  const trendData = MONTHLY_KPI.map((m) => ({ month: m.month, Incidents: m.incidents, 'Near Misses': m.nearMisses }))

  const rootCauseTotals = ROOT_CAUSES.map((rc) => ({
    name: rc,
    value: ROOT_CAUSE_MONTHLY[rc].reduce((a, b) => a + b, 0),
  })).sort((a, b) => b.value - a.value)

  const actionCounts = ['On Track', 'At Risk', 'Overdue', 'Awaiting Verification', 'Completed'].map((s) => ({
    name: s,
    value: ACTIONS.filter((a) => a.status === s).length,
  }))
  const actionTone: Record<string, string> = {
    'On Track': 'var(--good)', 'At Risk': 'var(--serious)', Overdue: 'var(--critical)',
    'Awaiting Verification': 'var(--warning)', Completed: 'var(--baseline)',
  }

  const sitePerf = [...SITES].sort((a, b) => b.safetyScore - a.safetyScore).map((s) => ({ name: s.name, value: s.safetyScore, id: s.id }))

  return (
    <>
      <PageHeader
        title="Good morning, Randy"
        subtitle="Company safety posture for July 2026 · 6 sites · 4,440 workers"
        right={<span className="rounded-lg border bg-surface px-3 py-1.5 text-xs text-ink-2">Last 12 months · updated 8 min ago</span>}
      />

      {/* Row 1: headline scores + attention feed */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="flex items-center justify-around px-6 py-6">
          <ScoreRing value={COMPANY.safetyScore} label="Safety Score" sublabel={`+${COMPANY.safetyScoreDelta} vs last year`} />
          <ScoreRing value={COMPANY.complianceScore} label="Compliance Score" sublabel={`+${COMPANY.complianceDelta} vs June`} />
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Needs your attention"
            subtitle="Ranked by risk — what to act on today"
          />
          <div className="space-y-1 px-3 pb-3">
            {ATTENTION_ITEMS.map((item) => (
              <Link
                key={item.title}
                to={item.link}
                className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent-soft/60"
              >
                <div className="pt-0.5">
                  <StatusPill kind={item.kind} label={item.kind === 'critical' ? 'Critical' : item.kind === 'serious' ? 'High' : 'Watch'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{item.detail}</p>
                </div>
                <ArrowRight size={15} className="mt-1 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 2: KPI tiles */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="TRIFR (per 1M hrs)" value={COMPANY.trifr} delta={-0.1} goodWhen="down"
          spark={MONTHLY_KPI.map((m) => m.trifr)} footnote={`Target ${COMPANY.trifrTarget} — 0.3 above target`}
        />
        <StatTile
          label="Days since last LTI" value={COMPANY.daysSinceLastLTI} delta={23} goodWhen="up"
          footnote="Best this year: 47 days (Mar)"
        />
        <StatTile
          label="Open incidents" value={COMPANY.openIncidents} delta={1} goodWhen="down"
          footnote="2 critical — both at Bintulu"
        />
        <StatTile
          label="Training compliance" value="92" unit="%" delta={1} goodWhen="up"
          spark={MONTHLY_KPI.map((m) => m.trainingCompliance)} footnote="Contractors lowest at 78%"
        />
      </div>

      {/* Row 3: trends */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Incident & near-miss trend"
            subtitle="Near-miss reporting rising while incidents fall — a healthy reporting culture signal"
          />
          <ChartBlock legend={<Legend items={[{ color: series[5], label: 'Incidents' }, { color: series[0], label: 'Near Misses' }]} />}>
            <TrendLines
              data={trendData}
              series={[
                { key: 'Incidents', name: 'Incidents', color: series[5] },
                { key: 'Near Misses', name: 'Near Misses', color: series[0] },
              ]}
            />
          </ChartBlock>
        </Card>

        <Card>
          <CardHeader
            title="Root cause distribution"
            subtitle="Human Factors is now the leading cause — up 3× since January"
          />
          <ChartBlock>
            <RankedBars data={rootCauseTotals} color={series[0]} highlight={(d) => (d.name === 'Human Factors' ? series[5] : undefined)} />
          </ChartBlock>
          <p className="px-5 pb-4 text-[11px] text-muted">Incidents by root cause, trailing 12 months. Red = fastest-growing category.</p>
        </Card>
      </div>

      {/* Row 4: sites + actions + departments */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Site performance" subtitle="Safety score, ranked" />
          <ChartBlock>
            <RankedBars
              data={sitePerf} color={series[0]} valueSuffix=""
              highlight={(d) => (d.value < 75 ? 'var(--critical)' : d.value < 85 ? 'var(--warning)' : 'var(--good)')}
            />
          </ChartBlock>
          <p className="px-5 pb-4 text-[11px] text-muted">
            Colored by band: ≥85 healthy · 70–84 watch · &lt;70 intervene. <Link className="font-semibold text-accent" to="/sites">Compare sites →</Link>
          </p>
        </Card>

        <Card>
          <CardHeader title="Corrective action status" subtitle={`${COMPANY.openActions} open · ${COMPANY.overdueActions} overdue`} />
          <div className="space-y-3 px-5 pb-4 pt-2">
            {actionCounts.map((a) => (
              <div key={a.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-2">{a.name}</span>
                  <span className="font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{a.value}</span>
                </div>
                <ProgressBar value={(a.value / ACTIONS.length) * 100} tone={actionTone[a.name]} />
              </div>
            ))}
            <Link to="/actions" className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-accent">
              Open the tracker <ArrowRight size={12} />
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Department performance" subtitle="Safety score by department, all sites" />
          <div className="space-y-2.5 px-5 pb-4 pt-2">
            {[...DEPARTMENTS].sort((a, b) => b.score - a.score).map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-40 truncate text-xs text-ink-2">{d.name}</span>
                <div className="flex-1">
                  <ProgressBar value={d.score} tone={d.score < 70 ? 'var(--critical)' : d.score < 85 ? 'var(--warning)' : 'var(--good)'} />
                </div>
                <span className="w-8 text-right text-xs font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{d.score}</span>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted">Contractors (68) and Maintenance (74) are dragging the group score.</p>
          </div>
        </Card>
      </div>

      {/* Row 5: monthly safety KPI strip */}
      <Card className="mt-4">
        <CardHeader title="Monthly safety KPIs" subtitle="Inspections completed and hours worked, trailing 12 months" />
        <div className="grid gap-4 px-0 md:grid-cols-2">
          <ChartBlock legend={<Legend items={[{ color: series[1], label: 'Inspections completed' }]} />}>
            <MonthBars
              data={MONTHLY_KPI.map((m) => ({ month: m.month, Inspections: m.inspections }))}
              series={[{ key: 'Inspections', name: 'Inspections', color: series[1] }]}
              height={180}
            />
          </ChartBlock>
          <ChartBlock legend={<Legend items={[{ color: series[0], label: 'Hours worked (thousands)' }]} />}>
            <TrendLines
              data={MONTHLY_KPI.map((m) => ({ month: m.month, Hours: m.hoursWorked }))}
              series={[{ key: 'Hours', name: 'Hours (k)', color: series[0] }]}
              height={180}
              yDomain={[650, 760]}
            />
          </ChartBlock>
        </div>
      </Card>
    </>
  )
}
