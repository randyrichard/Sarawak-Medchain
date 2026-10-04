import { describe, expect, it } from 'vitest'
import type { Indicators, PerformanceView } from '@/api/performanceApi'
import { exportFilename, monthsCsv, sitesCsv } from './export'

const base: Indicators = {
  lostTime: 2, recordable: 3, fatalities: 0, injuries: 3, daysLost: 10, hours: 178_500, estimatedShare: 0.3285,
  workers: 150, frequencyRate: 11.2, severityRate: 56.02, incidenceRate: 13.33, trir: 3.36,
  nearMisses: 4, nearMissRatio: 1.3, actionsClosed: 3, actionsClosedOnTime: 2, onTimeClosure: 0.667,
  overdueActions: 1, toolboxMeetings: 12,
}

const data = (over: Partial<PerformanceView> = {}): PerformanceView => ({
  from: '2026-01-01',
  to: '2026-06-30',
  months: [
    { month: '2026-05', lostTime: 1, recordable: 1, nearMisses: 3, hours: 30_000, estimatedShare: 0.3, frequencyRate: 33.33 },
    { month: '2026-06', lostTime: 0, recordable: 0, nearMisses: 1, hours: 0, estimatedShare: 0, frequencyRate: null },
  ],
  total: base,
  sites: [{ ...base, siteId: 'a', siteName: '=HYPERLINK("x")', frequencyRate: null, hours: 0 }],
  missingHours: [],
  targets: [],
  basis: { frequency: 1e6, trir: 2e5, incidence: 1e3, estimatedHoursPerWorkerMonth: 195 },
  ...over,
})

/** Parses our own CSV back: every cell is quoted, CRLF between rows. */
const parse = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n').map((line) => line.slice(1, -1).split('","'))

describe('HSE performance export', () => {
  it('starts with a byte-order mark so Excel reads the ≤ and accents', () => {
    expect(sitesCsv(data()).charCodeAt(0)).toBe(0xfeff)
    expect(monthsCsv(data()).charCodeAt(0)).toBe(0xfeff)
  })

  it('writes raw numbers a spreadsheet can calculate with', () => {
    const [header, total] = parse(sitesCsv(data()))
    const col = (name: string) => total[header.indexOf(name)]
    expect(total.slice(0, 3)).toEqual(['2026-01-01', '2026-06-30', 'All sites'])
    expect(col('Hours worked')).toBe('178500')
    expect(col('Hours estimated (%)')).toBe('32.9')
    expect(col('LTI frequency rate (per 1M h)')).toBe('11.2')
    expect(col('Actions closed on time (%)')).toBe('66.7')
  })

  it('leaves an unknown rate empty rather than writing 0', () => {
    const [header, , site] = parse(sitesCsv(data()))
    expect(site[header.indexOf('LTI frequency rate (per 1M h)')]).toBe('')
    const [, , june] = parse(monthsCsv(data()))
    expect(june.at(-1)).toBe('')
  })

  it('neutralises a site name a spreadsheet would run as a formula', () => {
    const [, , site] = parse(sitesCsv(data()))
    expect(site[2]).toBe(`'=HYPERLINK(""x"")`)
  })

  it('adds the targets and whether all sites meet them, only when targets are set', () => {
    expect(parse(sitesCsv(data()))).toHaveLength(3)
    const rows = parse(sitesCsv(data({ targets: [
      { metric: 'frequencyRate', value: 0.5, direction: 'max' },
      { metric: 'onTimeClosure', value: 0.6, direction: 'min' },
    ] })))
    const [header, , , target, status] = rows
    expect(rows).toHaveLength(5)
    expect(target[2]).toBe('Target')
    expect(target[header.indexOf('LTI frequency rate (per 1M h)')]).toBe('≤ 0.50')
    expect(status[header.indexOf('LTI frequency rate (per 1M h)')]).toBe('No')
    expect(status[header.indexOf('Actions closed on time (%)')]).toBe('Yes')
    expect(status[header.indexOf('TRIR (per 200,000 h)')]).toBe('')
  })

  it('writes one row per month with a sortable month key', () => {
    const [header, may] = parse(monthsCsv(data()))
    expect(header.slice(0, 2)).toEqual(['Month', 'Month label'])
    expect(may.slice(0, 7)).toEqual(['2026-05', 'May 26', '3', '1', '1', '30000', '30'])
  })

  it('names the file after the months it covers', () => {
    expect(exportFilename('sites', data())).toBe('hse-performance-sites_2026-01_to_2026-06.csv')
    // A period running to "now" names the current month.
    expect(exportFilename('monthly', data({ from: '2025-11-01', to: '2026-10-03' })))
      .toBe('hse-performance-monthly_2025-11_to_2026-10.csv')
  })
})
