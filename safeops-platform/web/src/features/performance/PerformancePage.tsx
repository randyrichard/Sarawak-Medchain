import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Download, FileSpreadsheet, Goal, Printer } from 'lucide-react'
import { performanceApi, type Indicators, type PerformanceView, type SitePerformance, type Target, type TargetMetric } from '@/api/performanceApi'
import { useOrg } from '@/features/org/OrgContext'
import { useAsync } from '@/lib/useAsync'
import { useUrlState } from '@/lib/useUrlState'
import {
  AsyncContent, AttentionIcon, Badge, Button, Card, CardBody, CardHeader, DataTable, Dropdown, DropdownItem, DropdownLabel,
  DropdownSeparator, PageHeader, Skeleton, attentionOf, attentionStripe, type Column,
} from '@/components/ui'
import { ChartBlock, ChartLegend, GroupedBars } from '@/components/charts/Charts'
import { cn } from '@/lib/cn'
import { canRecordManHours, monthRanges, formatHours, formatPercent, formatRate, formatTarget, hoursBasis, monthLabel, targetStatus } from './lib'
import { ManHoursDialog } from './ManHoursDialog'
import { TargetsDialog } from './TargetsDialog'
import { downloadCsv, exportFilename, monthsCsv, sitesCsv } from './export'

/**
 * HSE Performance - the wider view.
 *
 * The dashboard answers "what needs doing today, here". An HSE manager reporting to the
 * board, to DOSH or to a client's contractor-prequalification asks a different question:
 * across every site, over months, are we getting safer - and where are we not?
 *
 * That needs three things the rest of SafeChain does not give:
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
  const [targetsOpen, setTargetsOpen] = useState(false)
  const owner = canRecordManHours(role)

  const state = useAsync(
    (signal) => performanceApi.get({ companyId: company!.id, projectId: project?.id, months: Number(period) }, signal),
    [company?.id, project?.id, period],
    { enabled: !!company },
  )

  return (
    <>
      <PageHeader
        title="HSE performance"
        subtitle={`Health, safety and environment (HSE) figures for every site over ${period} months: the rates you report to DOSH, clients and the board.`}
        right={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
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
            <Dropdown
              trigger={() => <Button variant="secondary" icon={<Download size={15} />} disabled={!state.data}>Export</Button>}
            >
              <DropdownLabel>Spreadsheet (opens in Excel)</DropdownLabel>
              <DropdownItem icon={<FileSpreadsheet size={14} />}
                onSelect={() => state.data && downloadCsv(sitesCsv(state.data), exportFilename('sites', state.data))}>
                Sites and totals (CSV)
              </DropdownItem>
              <DropdownItem icon={<FileSpreadsheet size={14} />}
                onSelect={() => state.data && downloadCsv(monthsCsv(state.data), exportFilename('monthly', state.data))}>
                Monthly trend (CSV)
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<Printer size={14} />} onSelect={() => window.print()}>
                Print or save as PDF
              </DropdownItem>
            </Dropdown>
            {owner && (
              <Button variant="secondary" icon={<Goal size={15} />} disabled={!state.data} onClick={() => setTargetsOpen(true)}>Set targets</Button>
            )}
            {owner && (
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
        {(data) => <PerformanceBody data={data} scope={[company?.name, project?.name].filter(Boolean).join(' · ')} onRecordHours={owner ? () => setManHoursOpen(true) : undefined} />}
      </AsyncContent>

      {company && (
        <ManHoursDialog
          open={manHoursOpen}
          companyId={company.id}
          onClose={() => setManHoursOpen(false)}
          onSaved={state.reload}
        />
      )}
      {company && (
        <TargetsDialog
          open={targetsOpen}
          companyId={company.id}
          targets={state.data?.targets ?? []}
          onClose={() => setTargetsOpen(false)}
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
  /** "≤ 0.50" when a target is set, with whether the figure meets it. */
  target?: { text: string; status: 'met' | 'missed' | null }
}

/**
 * Applies a company target to a tile. A target, where one is set, replaces the page's own
 * rule of thumb (e.g. "under 80% on time is a warning"): it is the standard the company
 * chose, and the one the board reads the figure against. Missing it is a warning, never
 * critical - a fatality keeps the only critical mark on the page.
 */
function withTarget(tile: Tile, value: number | null, metric: TargetMetric, targets: Target[]): Tile {
  const target = targets.find((t) => t.metric === metric)
  if (!target) return tile
  const status = targetStatus(value, target)
  const critical = tile.tone?.includes('--critical')
  const tone = critical ? tile.tone : status === 'missed' ? 'var(--warning)' : undefined
  return { ...tile, tone, target: { text: formatTarget(target), status } }
}

/*
 * A tile's figure, sized to the tile.
 *
 * Screen width was the wrong measure on a desktop: at 1280px the row turns six-up beside
 * the sidebar, each tile has 120px for its figure, and "9,710,350" at 24px is 130px - it
 * ran into the tile's edge on exactly the screen most managers use. 13% of the tile's own
 * width fits nine digits with their separators at any column count. A browser without
 * container units (Safari before 16) ignores this and keeps the screen-width class above.
 */
const TILE_FIGURE = 'clamp(1rem, 13cqw, 1.5rem)'

function TileRow({ tiles, label }: { tiles: Tile[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        // The tile is a size container, so the figure can scale to the tile rather than to
        // the screen (TILE_FIGURE below).
        <li key={t.label} style={{ containerType: 'inline-size' }}>
          <Card className="h-full px-4 py-3" style={attentionStripe(attentionOf(t.tone))}>
            <p className="text-2xs font-semibold text-ink-2">{t.label}</p>
            <p
              // Scales down on a narrow phone: "9,597,512" at 24px is wider than a
              // two-up tile on a 320-412px screen and ran past the card's edge.
              className="mt-0.5 flex items-center gap-1.5 text-[clamp(1.125rem,5.5vw,1.5rem)] font-semibold tracking-tight"
              style={{ color: t.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums', fontSize: TILE_FIGURE }}
            >
              {t.value}
              <AttentionIcon level={attentionOf(t.tone)} />
            </p>
            <p className="text-2xs text-muted">{t.note}</p>
            {t.target && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs font-semibold text-ink-2">
                <span className="whitespace-nowrap">Target {t.target.text}</span>
                {t.target.status === 'met' && (
                  <span className="whitespace-nowrap text-good">On target</span>
                )}
                {t.target.status === 'missed' && <span className="whitespace-nowrap text-ink">Off target</span>}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-MY')} ${n === 1 ? one : many}`

export function laggingTiles(t: Indicators, targets: Target[] = []): Tile[] {
  return [
    withTarget({ label: 'LTI frequency rate', value: formatRate(t.frequencyRate), note: `${plural(t.lostTime, 'lost-time injury', 'lost-time injuries')} · per 1M hours` }, t.frequencyRate, 'frequencyRate', targets),
    withTarget({ label: 'Severity rate', value: formatRate(t.severityRate), note: `${plural(t.daysLost, 'day', 'days')} lost · per 1M hours` }, t.severityRate, 'severityRate', targets),
    withTarget({ label: 'Incidence rate', value: formatRate(t.incidenceRate), note: `LTIs per 1,000 of ${plural(t.workers, 'worker', 'workers')}` }, t.incidenceRate, 'incidenceRate', targets),
    withTarget({ label: 'TRIR', value: formatRate(t.trir), note: `${plural(t.recordable, 'recordable', 'recordables')} · per 200,000 hours` }, t.trir, 'trir', targets),
    withTarget({
      label: 'Fatalities',
      value: String(t.fatalities),
      note: t.fatalities > 0 ? 'Reportable to DOSH immediately' : 'None in the period',
      tone: t.fatalities > 0 ? 'var(--critical)' : undefined,
    }, t.fatalities, 'fatalities', targets),
    { label: 'Hours worked', value: formatHours(t.hours), note: hoursBasis(t).label },
  ]
}

export function leadingTiles(t: Indicators, targets: Target[] = []): Tile[] {
  return [
    { label: 'Near misses reported', value: t.nearMisses.toLocaleString('en-MY'), note: 'More reporting is a good sign' },
    withTarget({
      label: 'Near-miss ratio',
      value: t.nearMissRatio === null ? '—' : `${t.nearMissRatio}:1`,
      note: t.nearMissRatio === null ? 'No recordable injuries to compare' : 'Near misses per recordable injury',
    }, t.nearMissRatio, 'nearMissRatio', targets),
    withTarget({
      label: 'Actions closed on time',
      value: formatPercent(t.onTimeClosure),
      note: `${t.actionsClosedOnTime} of ${plural(t.actionsClosed, 'action', 'actions')} closed`,
      tone: t.onTimeClosure !== null && t.onTimeClosure < 0.8 ? 'var(--warning)' : undefined,
    }, t.onTimeClosure, 'onTimeClosure', targets),
    withTarget({
      label: 'Overdue actions',
      value: String(t.overdueActions),
      note: 'Open past their due date, now',
      tone: t.overdueActions > 0 ? 'var(--warning)' : undefined,
    }, t.overdueActions, 'overdueActions', targets),
    { label: 'Toolbox meetings', value: t.toolboxMeetings.toLocaleString('en-MY'), note: 'Held in the period' },
  ]
}

function PerformanceBody({ data, scope, onRecordHours }: { data: PerformanceView; scope: string; onRecordHours?: () => void }) {
  const { total } = data
  const basis = hoursBasis(total)

  const trend = useMemo(
    () => data.months.map((m) => ({ month: monthLabel(m.month), 'Near misses': m.nearMisses, 'Recordable injuries': m.recordable })),
    [data.months],
  )

  return (
    <div className="space-y-6">
      {/* On paper the page has no header controls or URL, so it says what it is. */}
      <p className="hidden text-xs text-ink-2 print:block">
        {scope} · {monthLabel(data.from.slice(0, 7))} to {monthLabel(data.to.slice(0, 7))} ·
        printed {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {basis.estimated && (
        <div className="flex items-start gap-2 rounded-lg border bg-sunken px-3 py-2 text-xs text-ink-2">
          <div className="min-w-0 flex-1">
            <p>
              <strong className="font-semibold text-ink">{basis.label}.</strong>{' '}
              Rates use {data.basis.estimatedHoursPerWorkerMonth} hours per worker per month where a site has
              no recorded figure. Fine for comparing sites; record actual man-hours before the figures go on a JKKP 8 return.
            </p>
            {/* Where the estimates are, so they can be replaced - not just how many there are. */}
            {data.missingHours.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold text-ink">Not yet recorded (finished months):</p>
                <ul className="mt-0.5 space-y-0.5">
                  {data.missingHours.map((m) => (
                    <li key={m.siteId}>
                      <span className="font-medium text-ink">{m.siteName}</span>
                      <span className="text-muted"> · {monthRanges(m.months)}</span>
                    </li>
                  ))}
                </ul>
                {onRecordHours && (
                  <Button size="sm" variant="secondary" className="mt-2 print:hidden" icon={<Clock size={13} />} onClick={onRecordHours}>
                    Record man-hours
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="perf-lagging">
        <h2 id="perf-lagging" className="mb-2 text-sm font-semibold text-ink">
          Lagging indicators <span className="font-normal text-muted">· outcomes - lower is better</span>
        </h2>
        <TileRow label="Lagging indicators" tiles={laggingTiles(total, data.targets)} />
      </section>

      <section aria-labelledby="perf-leading">
        <h2 id="perf-leading" className="mb-2 text-sm font-semibold text-ink">
          Leading indicators <span className="font-normal text-muted">· the activity that prevents injuries</span>
        </h2>
        <TileRow label="Leading indicators" tiles={leadingTiles(total, data.targets)} />
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

      <SiteTable sites={data.sites} targets={data.targets} />
    </div>
  )
}

/** The chart's figures as a table - for screen readers, for reading exact values, and for anyone who cannot tell the two bar colours apart. */
function MonthTable({ data }: { data: PerformanceView }) {
  // A closed <details> prints as its summary alone. The printed board pack needs the
  // figures, so open it for printing and put it back as it was afterwards.
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    let wasOpen = false
    const before = () => { if (ref.current) { wasOpen = ref.current.open; ref.current.open = true } }
    const after = () => { if (ref.current) ref.current.open = wasOpen }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after) }
  }, [])
  return (
    // `overflow-hidden`: Chrome keeps a closed <details>'s contents laid out (hidden, not
    // removed), and the 560px table inside widened the whole page to 516px on a phone -
    // which zoomed the page out - even though the table sits in its own scroll box.
    <details ref={ref} className="group mt-3 max-w-full overflow-hidden">
      <summary className="cursor-pointer select-none text-xs font-semibold text-accent hover:underline coarse:py-3 print:hidden">
        Show the figures as a table
      </summary>
      <div className="mt-2 relative overflow-x-auto" tabIndex={0} role="region" aria-label="Monthly figures">
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

/**
 * A site figure, marked when it misses the company target. The mark is an icon with words,
 * not a colour, and only where a target exists: an unmarked number means "no target set" or
 * "on target", and the header says which target applies.
 */
function judged(value: number | null, text: string, target: Target | undefined) {
  const missed = targetStatus(value, target) === 'missed'
  return (
    <span className={cn('inline-flex items-center justify-end gap-1 tabular-nums', value === null ? 'text-muted' : missed ? 'font-semibold text-ink' : 'text-ink')}>
      {missed && <AttentionIcon level="warning" label={`Off target (${formatTarget(target!)})`} />}
      {text}
    </span>
  )
}

const headed = (label: string, target: Target | undefined) => target
  ? <span>{label}<span className="block font-normal normal-case tracking-normal text-muted">target {formatTarget(target)}</span></span>
  : label

export function siteColumns(targets: Target[]): Column<SitePerformance>[] {
  const t = (m: TargetMetric) => targets.find((x) => x.metric === m)
  return [
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
    { key: 'fr', header: headed('LTI freq. rate', t('frequencyRate')), align: 'right', render: (s) => judged(s.frequencyRate, formatRate(s.frequencyRate), t('frequencyRate')), sortValue: (s) => s.frequencyRate },
    { key: 'trir', header: headed('TRIR', t('trir')), align: 'right', render: (s) => judged(s.trir, formatRate(s.trir), t('trir')), sortValue: (s) => s.trir, visibility: 'hidden md:table-cell' },
    { key: 'sr', header: headed('Severity rate', t('severityRate')), align: 'right', render: (s) => judged(s.severityRate, formatRate(s.severityRate), t('severityRate')), sortValue: (s) => s.severityRate, visibility: 'hidden lg:table-cell' },
    { key: 'nm', header: 'Near misses', align: 'right', render: (s) => <span className="tabular-nums">{s.nearMisses}</span>, sortValue: (s) => s.nearMisses, visibility: 'hidden md:table-cell' },
    { key: 'ontime', header: headed('Closed on time', t('onTimeClosure')), align: 'right', render: (s) => judged(s.onTimeClosure, formatPercent(s.onTimeClosure), t('onTimeClosure')), sortValue: (s) => s.onTimeClosure, visibility: 'hidden lg:table-cell' },
    {
      key: 'overdue',
      header: headed('Overdue actions', t('overdueActions')),
      align: 'right',
      render: (s) => {
        const target = t('overdueActions')
        // With a target, only a miss is marked; without one, any overdue action is.
        const flagged = target ? targetStatus(s.overdueActions, target) === 'missed' : s.overdueActions > 0
        return (
          <span className={flagged ? 'inline-flex items-center gap-1 font-semibold text-ink' : 'text-muted'}>
            {flagged && <AttentionIcon level="warning" label={target ? `Off target (${formatTarget(target)})` : 'Overdue actions'} />}
            <span className="tabular-nums">{s.overdueActions}</span>
          </span>
        )
      },
      sortValue: (s) => s.overdueActions,
    },
  ]
}

function SiteTable({ sites, targets }: { sites: SitePerformance[]; targets: Target[] }) {
  const columns = useMemo(() => siteColumns(targets), [targets])
  return (
    <Card>
      <CardHeader
        title="Sites compared"
        subtitle="Highest lost-time injury frequency rate first. Rates, not counts, so a small site and a large one compare fairly."
      />
      <DataTable
        caption="HSE performance by site"
        columns={columns}
        rows={sites}
        rowKey={(s) => s.siteId}
        defaultSort={{ key: 'fr', direction: 'desc' }}
        empty="No sites in this scope yet."
      />
    </Card>
  )
}
