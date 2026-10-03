import { describe, expect, it } from 'vitest'
import { canRecordManHours, formatPercent, formatRate, hoursBasis, monthLabel, monthsOfYear, parseHours } from './lib'

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
