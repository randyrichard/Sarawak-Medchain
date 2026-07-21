import type { TrainingStats } from '@/api/training'
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui'
import { ChartBlock, ChartLegend, RankedBars, TrendChart } from '@/components/charts/Charts'

export function TrainingOverview({ stats }: { stats: TrainingStats | null }) {
  if (!stats) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    )
  }

  const gaugeColor = (v: number) => (v >= 90 ? 'var(--good)' : v >= 80 ? 'var(--warning)' : 'var(--critical)')

  return (
    <div className="space-y-4">
      {/* Two headline gauges */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GaugeCard label="Overall training compliance" value={stats.compliancePct} color={gaugeColor(stats.compliancePct)} sub="of all required competencies" />
        <GaugeCard label="Mandatory training completion" value={stats.mandatoryPct} color={gaugeColor(stats.mandatoryPct)} sub="statutory & mandatory courses" />
        <Card className="px-5 py-4">
          <p className="text-2xs font-semibold text-ink-2">Certificate expiry pipeline</p>
          <div className="mt-2 space-y-1.5">
            {[
              ['Expired', stats.expired, 'var(--critical)'],
              ['≤30 days', stats.expiring30, 'var(--serious)'],
              ['≤60 days', stats.expiring60, 'var(--warning)'],
              ['≤90 days', stats.expiring90, 'var(--s3)'],
            ].map(([label, val, color]) => (
              <div key={label as string} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: color as string }} />{label}</span>
                <span className="font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{val as number}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-2xs font-semibold text-ink-2">Workforce</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.totalEmployees}</p>
          <p className="text-2xs text-muted">tracked employees</p>
          <div className="mt-2 flex gap-3 text-xs">
            <span className="text-good">{stats.employeesTrained} fully trained</span>
            <span className="text-critical">{stats.employeesOverdue} overdue</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Department training score" subtitle="Competency compliance by department — lowest first" />
          <CardBody>
            <RankedBars
              data={stats.byDepartment}
              color="var(--s1)"
              highlight={(d) => (d.value < 70 ? 'var(--critical)' : d.value < 85 ? 'var(--warning)' : undefined)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Site training score" subtitle="Competency compliance by site" />
          <CardBody>
            <RankedBars
              data={stats.bySite}
              color="var(--s2)"
              highlight={(d) => (d.value < 70 ? 'var(--critical)' : d.value < 85 ? 'var(--warning)' : undefined)}
            />
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Training hours delivered" subtitle="Total instructor-led hours per month (present attendees × course duration)" />
          <CardBody>
            <ChartBlock legend={<ChartLegend items={[{ color: 'var(--s1)', label: 'Training hours' }]} />}>
              <TrendChart
                data={stats.monthlyHours}
                series={[{ key: 'Hours', name: 'Hours', color: 'var(--s1)' }]}
                height={220}
              />
            </ChartBlock>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function GaugeCard({ label, value, color, sub }: { label: string; value: number; color: string; sub: string }) {
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg width="64" height="64" className="-rotate-90">
          <circle cx="32" cy="32" r="27" fill="none" stroke="var(--grid)" strokeWidth="6" />
          <circle cx="32" cy="32" r="27" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 169.6} 169.6`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}%</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink">{label}</p>
        <p className="text-2xs text-muted">{sub}</p>
      </div>
    </Card>
  )
}
