// ─── Interactive chart layer ─────────────────────────────────────────────────
// Recharts themed entirely by design tokens. Rules baked in: 2px lines, one
// axis, series colors from --s* slots only, legends + tooltips always, text in
// ink tokens (never the series color).

import type { ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

export interface SeriesDef {
  key: string
  name: string
  color: string
}

const AXIS = {
  tickLine: false as const,
  axisLine: false as const,
  tick: { fill: 'var(--muted)', fontSize: 11 },
}

function VizTooltip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-raised px-3 py-2 shadow-pop">
      <p className="mb-1 text-2xs font-semibold text-ink">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 text-2xs text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {p.value}{suffix}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-2xs text-ink-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** Multi-series line chart over months, with optional target reference line. */
export function TrendChart({
  data, series, height = 240, yDomain, refLine, suffix,
}: {
  data: Record<string, string | number>[]
  series: SeriesDef[]
  height?: number
  yDomain?: [number, number]
  refLine?: { y: number; label: string }
  suffix?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} domain={yDomain} width={44} />
        <Tooltip content={<VizTooltip suffix={suffix} />} cursor={{ stroke: 'var(--baseline)', strokeWidth: 1 }} />
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

/** Grouped vertical bars (e.g. this year vs last year). */
export function GroupedBars({
  data, series, height = 240,
}: {
  data: Record<string, string | number>[]
  series: SeriesDef[]
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barCategoryGap="28%" barGap={2}>
        <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} width={44} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal ranked bars with direct value labels (root causes, rankings). */
export function RankedBars({
  data, color, height, highlight,
}: {
  data: { name: string; value: number }[]
  color: string
  height?: number
  highlight?: (d: { name: string; value: number }) => string | undefined
}) {
  const h = height ?? data.length * 40 + 12
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }} barCategoryGap="30%">
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...AXIS} width={150} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
        <Bar
          dataKey="value" name="Incidents" radius={[0, 4, 4, 0]} maxBarSize={16}
          label={{ position: 'right', fill: 'var(--ink)', fontSize: 11, fontWeight: 600 }}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={highlight?.(d) ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ChartBlock({ legend, children }: { legend?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {legend && <div className="mb-2">{legend}</div>}
      {children}
    </div>
  )
}
