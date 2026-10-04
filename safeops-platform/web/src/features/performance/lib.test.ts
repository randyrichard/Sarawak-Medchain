import { describe, expect, it } from 'vitest'
import { canRecordManHours, monthRanges, formatPercent, formatRate, formatTarget, hoursBasis, monthLabel, monthsOfYear, parseHours, parseTarget, targetInput, targetStatus } from './lib'

describe('HSE performance formatting', () => {
  it('shows a missing rate as a dash, never as zero', () => {
    // A rate with no hours to divide by is unknown. "0.00" would read as a perfect record.
    expect(formatRate(null)).toBe('—')
    expect(formatRate(0)).toBe('0.00')
    expect(formatRate(11.204)).toBe('11.20')
    expect(formatRate(1234.5)).toBe('1,234.50')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(0.667)).toBe('67%')
  })

  it('labels months briefly', () => {
    expect(monthLabel('2026-01')).toBe('Jan 26')
    expect(monthLabel('2025-12')).toBe('Dec 25')
  })

  it('says how much of the denominator is estimated', () => {
    expect(hoursBasis({ hours: 0, estimatedShare: 0 })).toEqual({ label: 'No hours recorded or estimated', estimated: true })
    expect(hoursBasis({ hours: 1000, estimatedShare: 0 })).toEqual({ label: 'All hours recorded', estimated: false })
    expect(hoursBasis({ hours: 1000, estimatedShare: 1 }).label).toBe('All hours estimated from headcount')
    expect(hoursBasis({ hours: 178_500, estimatedShare: 0.328 })).toEqual({ label: '33% of hours estimated from headcount', estimated: true })
  })

  it('offers only the months that have started', () => {
    expect(monthsOfYear(2026, '2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(monthsOfYear(2025, '2026-03')).toHaveLength(12)
    expect(monthsOfYear(2027, '2026-03')).toEqual([])
  })

  it('parses hours the way people copy them from payroll', () => {
    expect(parseHours('')).toEqual({ ok: true, hours: null })
    expect(parseHours('  ')).toEqual({ ok: true, hours: null })
    expect(parseHours('21,450')).toEqual({ ok: true, hours: 21450 })
    expect(parseHours('0')).toEqual({ ok: true, hours: 0 })
    expect(parseHours('12.5').ok).toBe(false)
    expect(parseHours('-3').ok).toBe(false)
    expect(parseHours('lots').ok).toBe(false)
    expect(parseHours('50000001').ok).toBe(false)
  })

  it('lets only the people who sign the figures off record hours', () => {
    expect(canRecordManHours('admin')).toBe(true)
    expect(canRecordManHours('hse_manager')).toBe(true)
    for (const r of ['ceo', 'safety_officer', 'supervisor', 'employee', null] as const) expect(canRecordManHours(r)).toBe(false)
  })
})

describe('performance targets', () => {
  const fr = { metric: 'frequencyRate' as const, value: 0.5, direction: 'max' as const }
  const onTime = { metric: 'onTimeClosure' as const, value: 0.9, direction: 'min' as const }

  it('judges a figure in the direction its indicator improves', () => {
    expect(targetStatus(0.5, fr)).toBe('met') // at the target is on target
    expect(targetStatus(0.51, fr)).toBe('missed')
    expect(targetStatus(0.9, onTime)).toBe('met')
    expect(targetStatus(0.89, onTime)).toBe('missed')
  })

  it('does not judge an unknown figure or a missing target', () => {
    expect(targetStatus(null, fr)).toBeNull()
    expect(targetStatus(3, undefined)).toBeNull()
  })

  it('shows targets in the unit people use', () => {
    expect(formatTarget(fr)).toBe('≤ 0.50')
    expect(formatTarget(onTime)).toBe('≥ 90%')
    expect(formatTarget({ metric: 'nearMissRatio', value: 10, direction: 'min' })).toBe('≥ 10:1')
    expect(formatTarget({ metric: 'fatalities', value: 0, direction: 'max' })).toBe('≤ 0')
    expect(targetInput(onTime)).toBe('90')
    expect(targetInput(fr)).toBe('0.5')
    expect(targetInput(undefined)).toBe('')
  })

  it('parses a typed target, storing a percentage as a fraction', () => {
    expect(parseTarget('onTimeClosure', '90')).toEqual({ ok: true, value: 0.9 })
    expect(parseTarget('onTimeClosure', '87.5%')).toEqual({ ok: true, value: 0.875 })
    expect(parseTarget('nearMissRatio', '10:1')).toEqual({ ok: true, value: 10 })
    expect(parseTarget('frequencyRate', '0.5')).toEqual({ ok: true, value: 0.5 })
    expect(parseTarget('frequencyRate', ' ')).toEqual({ ok: true, value: null })
    expect(parseTarget('onTimeClosure', '120').ok).toBe(false)
    expect(parseTarget('fatalities', '0.5').ok).toBe(false)
    expect(parseTarget('trir', '-1').ok).toBe(false)
    expect(parseTarget('trir', 'low').ok).toBe(false)
  })
})

describe('monthRanges', () => {
  it('merges consecutive months into ranges', () => {
    expect(monthRanges(['2026-01', '2026-02', '2026-03', '2026-05'])).toBe('Jan–Mar 26, May 26')
    expect(monthRanges(['2025-11', '2025-12', '2026-01'])).toBe('Nov 25–Jan 26') // both years when they differ
    expect(monthRanges(['2026-04'])).toBe('Apr 26')
    expect(monthRanges([])).toBe('')
  })
})
