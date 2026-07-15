import type { ReactNode } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from 'recharts'
import { useSequential } from '../theme'

/** Shared tooltip skin — raised surface, hairline ring, ink text. */
export function VizTooltip({ active, payload, label, formatter }: any & { formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-raised px-3 py-2 shadow-pop">
      <p className="mb-1 text-[11px] font-semibold text-ink">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatter ? formatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const AXIS = { stroke: 'transparent', tickLine: false as const, axisLine: false as const, tick: { fill: 'var(--muted)', fontSize: 11 } }

/** Multi-series line chart over months. */
export function TrendLines({
  data, series, height = 220, yDomain, refLine,
}: {
  data: any[]
  series: { key: string; name: string; color: string }[]
  height?: number
  yDomain?: [number, number]
  refLine?: { y: number; label: string }
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} domain={yDomain} width={46} />
        <Tooltip content={<VizTooltip />} cursor={{ stroke: 'var(--baseline)', strokeWidth: 1 }} />
        {refLine && (
          <ReferenceLine
            y={refLine.y} stroke="var(--muted)" strokeDasharray="5 4"
            label={{ value: refLine.label, position: 'insideTopRight', fill: 'var(--muted)', fontSize: 10 }}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} type="monotone"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Vertical grouped/stacked bars over months. */
export function MonthBars({
  data, series, height = 220, stacked = false,
}: {
  data: any[]
  series: { key: string; name: string; color: string }[]
  height?: number
  stacked?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }} barCategoryGap="30%" barGap={2}>
        <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} width={46} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
        {series.map((s, i) => (
          <Bar
            key={s.key} dataKey={s.key} name={s.name} fill={s.color}
            stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            stroke="var(--surface)" strokeWidth={stacked ? 2 : 0} maxBarSize={26}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal ranked bars: one metric across categories, direct-labeled. */
export function RankedBars({
  data, color, height, valueSuffix = '', highlight,
}: {
  data: { name: string; value: number; id?: string }[]
  color: string
  height?: number
  valueSuffix?: string
  highlight?: (d: { name: string; value: number; id?: string }) => string | undefined
}) {
  const h = height ?? data.length * 38 + 16
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }} barCategoryGap="28%">
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...AXIS} width={150} />
        <Tooltip content={<VizTooltip formatter={(v: number) => `${v}${valueSuffix}`} />} cursor={{ fill: 'var(--accent-soft)' }} />
        <Bar
          dataKey="value" name="Value" radius={[0, 4, 4, 0]} maxBarSize={16}
          label={{ position: 'right', fill: 'var(--ink)', fontSize: 11, fontWeight: 600, formatter: (v: number) => `${v}${valueSuffix}` }}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={highlight?.(d) ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Sequential heatmap grid (rows × columns), one blue ramp light→dark. */
export function Heatmap({
  rows, cols, values, formatValue = (v) => String(v), rowLabelWidth = 150,
}: {
  rows: string[]
  cols: string[]
  values: number[][] // [row][col]
  formatValue?: (v: number) => string
  rowLabelWidth?: number
}) {
  const ramp = useSequential()
  const max = Math.max(...values.flat(), 1)
  const colorFor = (v: number) => {
    if (v === 0) return 'var(--grid)'
    const idx = Math.min(ramp.length - 1, Math.floor((v / max) * ramp.length))
    return ramp[idx]
  }
  const inkFor = (v: number) => (v / max > 0.55 ? '#ffffff' : 'var(--ink)')
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `${rowLabelWidth}px repeat(${cols.length}, 1fr)` }}>
          <div />
          {cols.map((c) => (
            <div key={c} className="pb-1 text-center text-[10px] font-medium text-muted">{c}</div>
          ))}
          {rows.map((r, ri) => (
            <RowCells key={r} label={r} cells={values[ri]} colorFor={colorFor} inkFor={inkFor} formatValue={formatValue} cols={cols} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
          <span>Low</span>
          {ramp.map((c) => (
            <span key={c} className="h-2.5 w-6 rounded-[2px]" style={{ background: c }} />
          ))}
          <span>High</span>
        </div>
      </div>
    </div>
  )
}

function RowCells({
  label, cells, colorFor, inkFor, formatValue, cols,
}: {
  label: string
  cells: number[]
  colorFor: (v: number) => string
  inkFor: (v: number) => string
  formatValue: (v: number) => string
  cols: string[]
}) {
  return (
    <>
      <div className="flex items-center pr-3 text-[11px] text-ink-2">{label}</div>
      {cells.map((v, ci) => (
        <div
          key={ci}
          title={`${label} · ${cols[ci]}: ${formatValue(v)}`}
          className="flex h-8 items-center justify-center rounded-[3px] text-[10px] font-semibold transition-transform hover:scale-[1.08]"
          style={{ background: colorFor(v), color: v === 0 ? 'var(--muted)' : inkFor(v) }}
        >
          {v > 0 ? formatValue(v) : '·'}
        </div>
      ))}
    </>
  )
}

export function ChartBlock({ children, legend }: { children: ReactNode; legend?: ReactNode }) {
  return (
    <div className="px-5 pb-4 pt-2">
      {legend && <div className="mb-2">{legend}</div>}
      {children}
    </div>
  )
}
