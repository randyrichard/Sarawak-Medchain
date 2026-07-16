import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react'
import type { Kpi, KpiTone } from '@/api/dashboard'
import { Card, Dialog, Skeleton } from '@/components/ui'
import { Sparkline } from '@/components/charts/Sparkline'
import { TrendChart } from '@/components/charts/Charts'
import { MONTHS } from '@/api/mock/dashboard'
import { cn } from '@/lib/cn'

const TONE_COLOR: Record<KpiTone, string> = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
  neutral: 'var(--muted)',
}

function DeltaChip({ kpi }: { kpi: Kpi }) {
  if (kpi.delta === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-muted">
        <Minus size={11} /> flat
      </span>
    )
  const isGood = kpi.goodWhen === 'up' ? kpi.delta > 0 : kpi.delta < 0
  const Icon = kpi.delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className="inline-flex items-center gap-0.5 text-2xs font-semibold"
      style={{ color: isGood ? 'var(--delta-good)' : 'var(--critical)' }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {Math.abs(kpi.delta)}{kpi.deltaSuffix ?? ''} vs last month
    </span>
  )
}

export function KpiGrid({ kpis, loading }: { kpis: Kpi[] | undefined; loading: boolean }) {
  const [open, setOpen] = useState<Kpi | null>(null)

  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 xl:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-14" />
            <Skeleton className="mt-2.5 h-2.5 w-24" />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 xl:gap-4">
        {kpis.map((kpi, i) => (
          <button
            key={kpi.id}
            onClick={() => setOpen(kpi)}
            className="animate-rise text-left"
            style={{ animationDelay: `${i * 40}ms` }}
            title={kpi.definition}
          >
            <Card className="group h-full px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-pop">
              <div className="flex items-start justify-between gap-1">
                <span className="text-2xs font-semibold leading-tight text-ink-2">{kpi.label}</span>
                <span className="mt-px h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[kpi.tone] }} aria-hidden />
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {kpi.value}
                </span>
                {kpi.unit && <span className="text-2xs text-muted">{kpi.unit}</span>}
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <DeltaChip kpi={kpi} />
                <span className="opacity-70 transition-opacity group-hover:opacity-100">
                  <Sparkline data={kpi.spark} width={52} height={20} stroke={TONE_COLOR[kpi.tone]} />
                </span>
              </div>
              <span className="mt-2 hidden items-center gap-1 text-2xs font-medium text-accent group-hover:flex">
                <Info size={10} /> Drill down
              </span>
            </Card>
          </button>
        ))}
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.label ?? ''}
        description="How this number is computed, and where it comes from"
        width="max-w-lg"
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight text-ink">{open.value}</span>
              {open.unit && <span className="text-sm text-muted">{open.unit}</span>}
              <span className="ml-auto"><DeltaChip kpi={open} /></span>
            </div>
            <p className="text-xs leading-relaxed text-ink-2">{open.definition}</p>
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Trailing 12 months</p>
              <TrendChart
                data={open.spark.map((v, i) => ({ month: MONTHS[i], [open.label]: v }))}
                series={[{ key: open.label, name: open.label, color: TONE_COLOR[open.tone] }]}
                height={160}
              />
            </div>
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Top contributors</p>
              <ul className="divide-y rounded-lg border">
                {open.breakdown.map((b) => (
                  <li key={b.label} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-ink-2">{b.label}</span>
                    <span className={cn('font-semibold text-ink')} style={{ fontVariantNumeric: 'tabular-nums' }}>{b.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}
