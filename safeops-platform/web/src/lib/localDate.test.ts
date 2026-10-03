import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { localISODate } from './localDate'

describe('localISODate', () => {
  it('gives the local calendar date', () => {
    // Built from local fields, so this holds in any zone the tests run in.
    expect(localISODate(new Date(2026, 2, 5, 7, 30))).toBe('2026-03-05')
    expect(localISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('is not the UTC date early in the morning east of UTC', () => {
    // 07:30 on 5 March in Kuching is 23:30 UTC on the 4th - which is what the slice gave.
    const early = new Date('2026-03-04T23:30:00Z')
    if (new Date(2026, 0, 1).getTimezoneOffset() === -480) {
      expect(localISODate(early)).toBe('2026-03-05')
      expect(early.toISOString().slice(0, 10)).toBe('2026-03-04')
    }
  })

  it('is used for "today" everywhere outside the offline demo data', () => {
    const SRC = resolve(process.cwd(), 'src')
    const files: string[] = []
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p) && !p.includes('.test.') && !p.includes(`${'/'}api${'/'}mock${'/'}`)) files.push(p) } }
    walk(SRC)
    const offenders = files.filter((f) => f !== join(SRC, 'lib/localDate.ts') && /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(SRC, f))).toEqual([])
  })
})
