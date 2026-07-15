import { useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardHeader, PageHeader, Legend, Sparkline, StatusPill } from '../components/ui'
import { TrendLines, Heatmap, ChartBlock } from '../components/charts'
import { useSeries } from '../theme'
import { MONTHS, SITES } from '../data/mock'

export default function Sites() {
  const series = useSeries()
  const [selected, setSelected] = useState<string[]>(['kch', 'btu', 'mri'])

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]))

  const trendData = MONTHS.map((m, i) => {
    const row: Record<string, string | number> = { month: m }
    SITES.forEach((s) => (row[s.short] = s.trend[i]))
    return row
  })

  // series color follows the SITE (fixed slot by SITES order), never the selection
  const active = SITES.map((s, i) => ({ site: s, color: series[i] })).filter((x) => selected.includes(x.site.id))

  const heatValues = SITES.map((s) => s.incidents)
  const ranked = [...SITES].sort((a, b) => b.safetyScore - a.safetyScore)

  return (
    <>
      <PageHeader
        title="Site Intelligence"
        subtitle="Compare sites on the metrics that predict the next incident — not just the ones that count the last"
      />

      {/* KPI ranking table */}
      <Card className="mb-4">
        <CardHeader title="Site league table" subtitle="Ranked by safety score · trailing 12 months" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Site</th>
                <th className="px-3 py-2.5 font-semibold">Safety score</th>
                <th className="px-3 py-2.5 font-semibold">12-mo trend</th>
                <th className="px-3 py-2.5 font-semibold">Compliance</th>
                <th className="px-3 py-2.5 font-semibold">TRIFR</th>
                <th className="px-3 py-2.5 font-semibold">Open / overdue actions</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const delta = s.trend[11] - s.trend[0]
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-accent-soft/40">
                    <td className="px-5 py-3 text-sm font-bold text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                    <td className="px-3 py-3">
                      <p className="text-[13px] font-semibold text-ink">{s.name}</p>
                      <p className="text-[11px] text-muted">{s.industry} · {s.headcount.toLocaleString()} workers</p>
                    </td>
                    <td className="px-3 py-3 text-lg font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.safetyScore}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Sparkline data={s.trend} width={72} height={24} />
                        <span
                          className="inline-flex items-center gap-0.5 text-xs font-semibold"
                          style={{ color: delta >= 0 ? 'var(--delta-good)' : 'var(--critical)' }}
                        >
                          {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                          {delta > 0 ? '+' : ''}{delta}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.complianceScore}%</td>
                    <td className="px-3 py-3 text-[13px] text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.trifr}</td>
                    <td className="px-3 py-3 text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span className="text-ink-2">{s.openActions}</span>
                      {s.overdueActions > 0 && <span className="font-semibold" style={{ color: 'var(--critical)' }}> / {s.overdueActions} overdue</span>}
                    </td>
                    <td className="px-5 py-3">
                      {s.safetyScore < 75 ? (
                        <StatusPill kind="critical" label="Intervene" />
                      ) : s.safetyScore < 85 ? (
                        <StatusPill kind="warning" label="Watch" />
                      ) : (
                        <StatusPill kind="good" label="Healthy" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Trend comparison */}
        <Card className="xl:col-span-3">
          <CardHeader title="Safety score trajectory" subtitle="Pick sites to compare — Bintulu is the only site trending down" />
          <div className="flex flex-wrap gap-2 px-5 pt-1">
            {SITES.map((s, i) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? 'text-ink' : 'text-muted'}`}
                  style={on ? { borderColor: series[i], background: 'var(--accent-soft)' } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? series[i] : 'var(--grid)' }} />
                  {s.short}
                </button>
              )
            })}
          </div>
          <ChartBlock>
            <TrendLines
              data={trendData}
              series={active.map((x) => ({ key: x.site.short, name: x.site.short, color: x.color }))}
              height={260}
              yDomain={[60, 100]}
            />
          </ChartBlock>
        </Card>

        {/* Incident heatmap */}
        <Card className="xl:col-span-2">
          <CardHeader title="Incident heatmap" subtitle="Incidents per site per month" />
          <div className="px-5 pb-5 pt-2">
            <Heatmap rows={SITES.map((s) => s.short)} cols={[...MONTHS]} values={heatValues} rowLabelWidth={64} />
          </div>
          <p className="px-5 pb-4 text-[11px] leading-relaxed text-muted">
            Bintulu's row darkens left to right — frequency is rising, not episodic. That pattern usually precedes a serious event.
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Near-miss reporting rate" subtitle="Rising near-miss counts with falling incidents = healthy vigilance. Falling near-misses = under-reporting risk." />
        <ChartBlock legend={<Legend items={SITES.map((s, i) => ({ color: series[i], label: s.short }))} />}>
          <TrendLines
            data={MONTHS.map((m, i) => {
              const row: Record<string, string | number> = { month: m }
              SITES.forEach((s) => (row[s.short] = s.nearMisses[i]))
              return row
            })}
            series={SITES.map((s, i) => ({ key: s.short, name: s.short, color: series[i] }))}
            height={230}
          />
        </ChartBlock>
      </Card>
    </>
  )
}
