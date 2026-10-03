import { useMemo, useState } from 'react'
import { Clock, Info } from 'lucide-react'
import { performanceApi, type Indicators, type PerformanceView, type SitePerformance } from '@/api/performanceApi'
import { useOrg } from '@/features/org/OrgContext'
import { useAsync } from '@/lib/useAsync'
import { useUrlState } from '@/lib/useUrlState'
import {
  AsyncContent, AttentionIcon, Badge, Button, Card, CardBody, CardHeader, DataTable, PageHeader, Skeleton,
  attentionOf, attentionStripe, type Column,
} from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars } from '@/components/charts/Charts'
import { canRecordManHours, formatHours, formatPercent, formatRate, hoursBasis, monthLabel } from './lib'
import { ManHoursDialog } from './ManHoursDialog'

/**
 * HSE Performance - the wider view.
 *
 * The dashboard answers "what needs doing today, here". An HSE manager reporting to the
 * board, to DOSH or to a client's contractor-prequalification asks a different question:
 * across every site, over months, are we getting safer - and where are we not?
 *
 * That needs three things the rest of SafeOps does not give:
 *
 * - **Rates, not counts.** Two lost-time injuries mean something different on a 40-man site
 *   and a 900-man one. Every injury figure is normalised by exposure hours using the
 *   formulas Malaysian employers already report on the DOSH JKKP 8 annual return (per
 *   1,000,000 hours, per 1,000 workers) and the OSHA TRIR that multinational clients ask
 *   for (per 200,000 hours). Formulas are in docs/HSE_PERFORMANCE.md.
 * - **Leading as well as lagging.** Injury rates only move after someone is hurt. ISO 45001
 *   §9.1 asks for the activity that prevents them too - near misses reported, actions closed
 *   on time, toolbox meetings held - so both are shown, leading first in nothing but name:
 *   the page reads outcomes then causes, the order a board pack does.
 * - **Time and sites together.** A twelve-month trend says whether it is improving; a site
 *   league table on the same rates says where to look.
 */
const PERIODS = ['6', '12', '24'] as const

export function PerformancePage() {
  const { company, project, role } = useOrg()
  const [period, setPeriod] = useUrlState('months', '12', PERIODS)
  const [manHoursOpen, setManHoursOpen] = useState(false)

  const state = useAsync(
    (signal) => performanceApi.get({ companyId: company!.id, projectId: project?.id, months: Number(period) }, signal),
    [company?.id, project?.id, period],
    { enabled: !!company },
  )

  return (
    <>
      <PageHeader
        title="HSE Performance"
        subtitle={`Every site, ${period} months - the rates you report to DOSH, clients and the board`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Period
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as (typeof PERIODS)[number])}
                className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </select>
            </label>
            {canRecordManHours(role) && (
              <Button icon={<Clock size={15} />} onClick={() => setManHoursOpen(true)}>Record man-hours</Button>
            )}
          </div>
        }
      />

      <AsyncContent
        state={state}
        errorTitle="Could not load HSE performance"
        loading={<PerformanceSkeleton />}
      >
        {(data) => <PerformanceBody data={data} />}
      </AsyncContent>

      {company && (
        <ManHoursDialog
          open={manHoursOpen}
          companyId={company.id}
          onClose={() => setManHoursOpen(false)}
          onSaved={state.reload}
        />
      )}
    </>
  )
}

function PerformanceSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

interface Tile {
  label: string
  value: string
  note: string
  tone?: string
}

function TileRow({ tiles, label }: { tiles: Tile[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.label}>
          <Card className="h-full px-4 py-3" style={attentionStripe(attentionOf(t.tone))}>
            <p className="text-2xs font-semibold text-ink-2">{t.label}</p>
            <p
              className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight"
              style={{ color: t.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {t.value}
              <AttentionIcon level={attentionOf(t.tone)} />
            </p>
            <p className="text-2xs text-muted">{t.note}</p>
          </Card>
        </li>
      ))}
    </ul>
  )
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-MY')} ${n === 1 ? one : many}`

export function laggingTiles(t: Indicators): Tile[] {
  return [
    { label: 'LTI frequency rate', value: formatRate(t.frequencyRate), note: `${plural(t.lostTime, 'lost-time injury', 'lost-time injuries')} · per 1M hours` },
    { label: 'Severity rate', value: formatRate(t.severityRate), note: `${plural(t.daysLost, 'day', 'days')} lost · per 1M hours` },
    { label: 'Incidence rate', value: formatRate(t.incidenceRate), note: `LTIs per 1,000 of ${plural(t.workers, 'worker', 'workers')}` },
    { label: 'TRIR', value: formatRate(t.trir), note: `${plural(t.recordable, 'recordable', 'recordables')} · per 200,000 hours` },
    {
      label: 'Fatalities',
      value: String(t.fatalities),
      note: t.fatalities > 0 ? 'Reportable to DOSH immediately' : 'None in the period',
      tone: t.fatalities > 0 ? 'var(--critical)' : undefined,
    },
    { label: 'Hours worked', value: formatHours(t.hours), note: hoursBasis(t).label },
  ]
}

export function leadingTiles(t: Indicators): Tile[] {
  return [
    { label: 'Near misses reported', value: t.nearMisses.toLocaleString('en-MY'), note: 'More reporting is a good sign' },
    {
      label: 'Near-miss ratio',
      value: t.nearMissRatio === null ? '—' : `${t.nearMissRatio}:1`,
      note: t.nearMissRatio === null ? 'No recordable injuries to compare' : 'Near misses per recordable injury',
    },
    {
      label: 'Actions closed on time',
      value: formatPercent(t.onTimeClosure),
      note: `${t.actionsClosedOnTime} of ${plural(t.actionsClosed, 'action', 'actions')} closed`,
      tone: t.onTimeClosure !== null && t.onTimeClosure < 0.8 ? 'var(--warning)' : undefined,
    },
    {
      label: 'Overdue actions',
      value: String(t.overdueActions),
      note: 'Open past their due date, now',
      tone: t.overdueActions > 0 ? 'var(--warning)' : undefined,
    },
    { label: 'Toolbox meetings', value: t.toolboxMeetings.toLocaleString('en-MY'), note: 'Held in the period' },
  ]
}

function PerformanceBody({ data }: { data: PerformanceView }) {
  const { total } = data
  const basis = hoursBasis(total)

  const trend = useMemo(
    () => data.months.map((m) => ({ month: monthLabel(m.month), 'Near misses': m.nearMisses, 'Recordable injuries': m.recordable })),
    [data.months],
  )

  return (
    <div className="space-y-6">
      {basis.estimated && (
        <p className="flex items-start gap-2 rounded-lg border bg-sunken px-3 py-2 text-xs text-ink-2">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            <strong className="font-semibold text-ink">{basis.label}.</strong>{' '}
            Rates use {data.basis.estimatedHoursPerWorkerMonth} hours per worker per month where a site has
            no recorded figure. Fine for comparing sites; record actual man-hours before the figures go on a JKKP 8 return.
          </span>
        </p>
      )}

      <section aria-labelledby="perf-lagging">
        <h2 id="perf-lagging" className="mb-2 text-sm font-semibold text-ink">
          Lagging indicators <span className="font-normal text-muted">· outcomes - lower is better</span>
        </h2>
        <TileRow label="Lagging indicators" tiles={laggingTiles(total)} />
      </section>

      <section aria-labelledby="perf-leading">
        <h2 id="perf-leading" className="mb-2 text-sm font-semibold text-ink">
          Leading indicators <span className="font-normal text-muted">· the activity that prevents injuries</span>
        </h2>
        <TileRow label="Leading indicators" tiles={leadingTiles(total)} />
      </section>

      <Card>
        <CardHeader
          title="Monthly trend"
          subtitle="Near misses reported against recordable injuries. A healthy reporting culture keeps the first well above the second."
        />
        <CardBody>
          <ChartBlock
            legend={<ChartLegend items={[
              { color: 'var(--s1)', label: 'Near misses' },
              { color: 'var(--s2)', label: 'Recordable injuries' },
            ]} />}
          >
            <div role="img" aria-label="Bar chart of near misses and recordable injuries by month. The same figures are in the table below.">
              <GroupedBars
                data={trend}
                series={[
                  { key: 'Near misses', name: 'Near misses', color: 'var(--s1)' },
                  { key: 'Recordable injuries', name: 'Recordable injuries', color: 'var(--s2)' },
                ]}
              />
            </div>
          </ChartBlock>
          <MonthTable data={data} />
        </CardBody>
      </Card>

      <SiteTable sites={data.sites} />
    </div>
  )
}

/** The chart's figures as a table - for screen readers, for reading exact values, and for anyone who cannot tell the two bar colours apart. */
function MonthTable({ data }: { data: PerformanceView }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer select-none text-xs font-semibold text-accent hover:underline coarse:py-3">
        Show the figures as a table
      </summary>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Monthly figures">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b text-left text-2xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">Month</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Near misses</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Recordable injuries</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Lost-time injuries</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Hours</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">LTI frequency rate</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-ink">{monthLabel(m.month)}</th>
                <td className="px-2 py-1.5 text-right tabular-nums">{m.nearMisses}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{m.recordable}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{m.lostTime}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {formatHours(m.hours)}{m.estimatedShare > 0 && <span className="text-muted" title="Includes hours estimated from headcount"> est.</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatRate(m.frequencyRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const rate = (v: number | null) => <span className={v === null ? 'text-muted' : 'text-ink'}>{formatRate(v)}</span>

const SITE_COLUMNS: Column<SitePerformance>[] = [
  {
    key: 'site',
    header: 'Site',
    render: (s) => (
      <span className="flex items-center gap-1.5 font-medium text-ink">
        {s.fatalities > 0 && <AttentionIcon level="critical" label="Fatality in the period" />}
        {s.siteName}
      </span>
    ),
    sortValue: (s) => s.siteName.toLowerCase(),
  },
  {
    key: 'hours',
    header: 'Hours',
    align: 'right',
    render: (s) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatHours(s.hours)}
        {s.estimatedShare > 0 && <Badge className="ml-1.5" tone="neutral">est.</Badge>}
      </span>
    ),
    sortValue: (s) => s.hours,
  },
  { key: 'lti', header: 'LTIs', align: 'right', render: (s) => <span className="tabular-nums">{s.lostTime}</span>, sortValue: (s) => s.lostTime },
  { key: 'fr', header: 'LTI freq. rate', align: 'right', render: (s) => rate(s.frequencyRate), sortValue: (s) => s.frequencyRate },
  { key: 'trir', header: 'TRIR', align: 'right', render: (s) => rate(s.trir), sortValue: (s) => s.trir, visibility: 'hidden md:table-cell' },
  { key: 'sr', header: 'Severity rate', align: 'right', render: (s) => rate(s.severityRate), sortValue: (s) => s.severityRate, visibility: 'hidden lg:table-cell' },
  { key: 'nm', header: 'Near misses', align: 'right', render: (s) => <span className="tabular-nums">{s.nearMisses}</span>, sortValue: (s) => s.nearMisses, visibility: 'hidden md:table-cell' },
  { key: 'ontime', header: 'Closed on time', align: 'right', render: (s) => <span className="tabular-nums">{formatPercent(s.onTimeClosure)}</span>, sortValue: (s) => s.onTimeClosure, visibility: 'hidden lg:table-cell' },
  {
    key: 'overdue',
    header: 'Overdue actions',
    align: 'right',
    render: (s) => (
      <span className={s.overdueActions > 0 ? 'inline-flex items-center gap-1 font-semibold text-ink' : 'text-muted'}>
        {s.overdueActions > 0 && <AttentionIcon level="warning" label="Overdue actions" />}
        <span className="tabular-nums">{s.overdueActions}</span>
      </span>
    ),
    sortValue: (s) => s.overdueActions,
  },
]

function SiteTable({ sites }: { sites: SitePerformance[] }) {
  return (
    <Card>
      <CardHeader
        title="Sites compared"
        subtitle="Highest lost-time injury frequency rate first. Rates, not counts, so a small site and a large one compare fairly."
      />
      <DataTable
        caption="HSE performance by site"
        columns={SITE_COLUMNS}
        rows={sites}
        rowKey={(s) => s.siteId}
        defaultSort={{ key: 'fr', direction: 'desc' }}
        empty="No sites in this scope yet."
      />
    </Card>
  )
}
