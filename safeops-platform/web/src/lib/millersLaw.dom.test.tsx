// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { chunk, formatIdNumber } from './chunk'
import { ReportingSummary } from '@/features/incidents/ReportIncidentPage'

/*
 * Miller's law: working memory holds a handful of chunks (about seven, Miller 1956; nearer
 * four without rehearsal, Cowan 2001). It is about what people must *remember*, not what
 * they can see, so these tests do not cap menus. They hold the three places SafeChain used to
 * ask people to hold too much in their heads.
 */

afterEach(cleanup)

describe('long strings are shown in chunks', () => {
  it('groups a setup key in fours', () => {
    expect(chunk('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP')
    expect(chunk('ABCDEFGHIJ', 4)).toBe('ABCD EFGH IJ')
    expect(chunk('ABC')).toBe('ABC')
  })

  it('prints a 12-digit IC number in its three printed chunks', () => {
    expect(formatIdNumber('900101135678')).toBe('900101-13-5678')
    expect(formatIdNumber('900101 13 5678')).toBe('900101-13-5678')
    expect(formatIdNumber('900101-13-5678')).toBe('900101-13-5678')
  })

  it('leaves anything that is not a MyKad number exactly as entered', () => {
    expect(formatIdNumber('A12345678')).toBe('A12345678')
    expect(formatIdNumber('12345')).toBe('12345')
    expect(formatIdNumber(null)).toBe('')
  })
})

describe('the incident report carries step 1 forward instead of asking people to remember it', () => {
  it('shows the type, severity, title and time already given, with a way back to change them', () => {
    const onEdit = vi.fn()
    render(
      <ReportingSummary
        type="chemical_spill" severity="Serious" title="Caustic soda leak at dosing pump 2"
        occurredAt="2026-10-03T05:30" onEdit={onEdit}
      />,
    )
    const region = screen.getByRole('region', { name: 'You are reporting' })
    expect(region.textContent).toContain('Caustic soda leak at dosing pump 2')
    expect(region.textContent).toContain('Chemical Spill')
    expect(region.textContent).toContain('Serious')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})

describe('long forms are chunked into small named sections', () => {
  // A source check over every dialog: the failure is a layout choice made in each form.
  const root = join(__dirname, '..', 'features')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx') && !p.includes('.test.')) files.push(p)
    }
  }
  walk(root)
  const FIELD = /<(Input|Select|Textarea|PasswordInput|SuggestSelect|Checkbox|Switch)\b/g
  const dialogs = files.flatMap((f) => {
    const s = readFileSync(f, 'utf8')
    return [...s.matchAll(/<Dialog\b/g)].map((m) => ({ file: f.slice(root.length + 1), body: s.slice(m.index, s.indexOf('</Dialog>', m.index)) }))
  })

  it('gives every dialog of twelve or more fields named sections', () => {
    const unchunked = dialogs
      .filter((d) => (d.body.match(FIELD) ?? []).length >= 12 && !d.body.includes('<FormSection'))
      .map((d) => d.file)
    expect(unchunked).toEqual([])
  })

  it('keeps every section to five fields or fewer', () => {
    const tooBig: string[] = []
    for (const d of dialogs) {
      for (const m of d.body.matchAll(/<FormSection\b[^>]*title="([^"]+)"[\s\S]*?<\/FormSection>/g)) {
        const n = (m[0].match(FIELD) ?? []).length
        if (n > 5) tooBig.push(`${d.file}: "${m[1]}" has ${n}`)
      }
    }
    expect(tooBig).toEqual([])
  })
})
