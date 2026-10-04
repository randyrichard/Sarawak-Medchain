import type { Indicators, PerformanceView, Target, TargetMetric } from '@/api/performanceApi'
import { csvDocument } from '@/lib/csv'
import { formatTarget, monthLabel, targetStatus } from './lib'

/**
 * HSE performance as files: the figures an HSE manager pastes into a board pack or a
 * JKKP 8 return, so they are not retyped from the screen.
 *
 * Built for a spreadsheet, not for the eye:
 * - numbers are raw (178500, not "178,500"; 66.7, not "67%") so Excel can sum and chart them;
 * - an unknown rate is an empty cell, never 0 - the same rule as the page's "—";
 * - percentages are 0-100 with one decimal, the way people type them into Excel;
 * - every row carries its period, so files from different months can be stacked.
 *
 * Cells go through the shared CSV writer, which neutralises anything a spreadsheet would
 * execute (site names are typed by people).
 */

/** Excel reads a UTF-8 CSV as ANSI unless it starts with a byte-order mark - "≤" would arrive as "â‰¤". */
const BOM = '\uFEFF'

const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10)

const SITE_HEADER = [
  'Period from', 'Period to', 'Site',
  'Hours worked', 'Hours estimated (%)', 'Workers',
  'Lost-time injuries', 'Recordable injuries', 'Fatalities', 'Days lost',
  'LTI frequency rate (per 1M h)', 'Severity rate (per 1M h)', 'Incidence rate (per 1,000 workers)', 'TRIR (per 200,000 h)',
  'Near misses', 'Near-miss ratio (per recordable)', 'Actions closed', 'Actions closed on time (%)', 'Overdue actions', 'Toolbox meetings',
]

/** Which column of the site sheet each target applies to. */
const TARGET_COLUMN: Record<TargetMetric, string> = {
  frequencyRate: 'LTI frequency rate (per 1M h)',
  severityRate: 'Severity rate (per 1M h)',
  incidenceRate: 'Incidence rate (per 1,000 workers)',
  trir: 'TRIR (per 200,000 h)',
  fatalities: 'Fatalities',
  overdueActions: 'Overdue actions',
  nearMissRatio: 'Near-miss ratio (per recordable)',
  onTimeClosure: 'Actions closed on time (%)',
}

function siteRow(from: string, to: string, name: string, i: Indicators) {
  return [
    from, to, name,
    i.hours, pct(i.estimatedShare), i.workers,
    i.lostTime, i.recordable, i.fatalities, i.daysLost,
    i.frequencyRate, i.severityRate, i.incidenceRate, i.trir,
    i.nearMisses, i.nearMissRatio, i.actionsClosed, pct(i.onTimeClosure), i.overdueActions, i.toolboxMeetings,
  ]
}

/** The values a target row and an on-target row put under each targeted column. */
function targetRows(from: string, to: string, total: Indicators, targets: Target[]) {
  if (targets.length === 0) return []
  const target = SITE_HEADER.map(() => null as string | null)
  const status = SITE_HEADER.map(() => null as string | null)
  target[0] = from; target[1] = to; target[2] = 'Target'
  status[0] = from; status[1] = to; status[2] = 'All sites on target?'
  for (const t of targets) {
    const col = SITE_HEADER.indexOf(TARGET_COLUMN[t.metric])
    target[col] = formatTarget(t)
    const s = targetStatus(total[t.metric], t)
    status[col] = s === 'met' ? 'Yes' : s === 'missed' ? 'No' : 'No data'
  }
  return [target, status]
}

/**
 * One row for all sites together, one per site, then (when targets are set) the targets and
 * whether the all-sites figure meets each.
 */
export function sitesCsv(data: PerformanceView): string {
  const { from, to } = data
  const rows = [
    siteRow(from, to, 'All sites', data.total),
    ...data.sites.map((s) => siteRow(from, to, s.siteName, s)),
    ...targetRows(from, to, data.total, data.targets),
  ]
  return BOM + csvDocument(SITE_HEADER, rows)
}

/** The monthly trend, one row per month. Month is YYYY-MM so it sorts and pivots. */
export function monthsCsv(data: PerformanceView): string {
  return BOM + csvDocument(
    ['Month', 'Month label', 'Near misses', 'Recordable injuries', 'Lost-time injuries', 'Hours worked', 'Hours estimated (%)', 'LTI frequency rate (per 1M h)'],
    data.months.map((m) => [m.month, monthLabel(m.month), m.nearMisses, m.recordable, m.lostTime, m.hours, pct(m.estimatedShare), m.frequencyRate]),
  )
}

/** "hse-performance-sites_2025-11_to_2026-10.csv" - the period in the name, so files do not overwrite each other. */
export function exportFilename(kind: 'sites' | 'monthly', data: PerformanceView): string {
  return `hse-performance-${kind}_${data.from.slice(0, 7)}_to_${data.to.slice(0, 7)}.csv`
}

export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
