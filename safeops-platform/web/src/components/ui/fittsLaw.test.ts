import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/*
 * Fitts's law: the time to hit a target grows as it gets smaller (T = a + b·log2(D/W + 1)),
 * and a fingertip is a far blunter pointer than a cursor. SafeChain sizes targets at 24px or
 * more for a mouse (WCAG 2.5.8) and 44px on a touch screen (Apple HIG / WCAG 2.5.5), using
 * the `coarse:` variant so a desktop keeps its density.
 *
 * Sizes come from CSS, which jsdom does not lay out, so these hold the class contract in the
 * source; the live measurement of every target on twelve pages is in the PR that added this.
 */

const src = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(src, p), 'utf8')

const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx') && !p.includes('.test.')) files.push(p)
  }
}
walk(src)

describe('form controls grow to a finger-sized target on touch', () => {
  it('sizes every Input, Select and date field at 44px on a coarse pointer', () => {
    expect(read('components/ui/Field.tsx')).toMatch(/const controlCls[\s\S]*?'h-9[^']*coarse:h-11/)
  })

  it('leaves no hand-built 36px select, input or button without its touch size', () => {
    const offenders: string[] = []
    let inspected = 0
    for (const f of files) {
      if (f.includes(join('components', 'ui'))) continue
      const s = readFileSync(f, 'utf8')
      // Start from each class list with h-9 and look back for the element it belongs to:
      // attributes span lines and contain arrow functions, so a forward regex over the tag
      // cannot reliably reach the className.
      for (const m of s.matchAll(/className="([^"]*\bh-9\b[^"]*)"/g)) {
        const tags = [...s.slice(Math.max(0, m.index - 600), m.index).matchAll(/<([A-Za-z][\w.]*)/g)]
        const tag = tags.at(-1)?.[1]
        if (!tag || !['select', 'input', 'textarea', 'button'].includes(tag)) continue
        inspected++
        if (!/coarse:(h|min-h)-1[12]\b/.test(m[1])) offenders.push(`${f.slice(src.length + 1)}: <${tag} ${m[1].slice(0, 50)}`)
      }
    }
    expect(inspected).toBeGreaterThan(20) // the scan must actually be looking at the controls
    expect(offenders).toEqual([])
  })
})

describe('small icon buttons are not the smallest thing on the page', () => {
  it('gives the alert dismiss button 24px for a mouse and 44px on touch', () => {
    const alert = read('components/ui/Alert.tsx')
    const button = /aria-label="Dismiss"[\s\S]*?className="([^"]+)"/.exec(alert)![1]
    expect(button).toMatch(/\bh-6\b/)
    expect(button).toMatch(/\bw-6\b/)
    expect(button).toMatch(/coarse:h-11/)
    expect(button).toMatch(/coarse:w-11/)
  })

  it('makes sortable column headers at least 24px, and 44px on touch', () => {
    expect(read('components/ui/Table.tsx')).toMatch(/inline-flex min-h-6 [^']*coarse:min-h-11/)
  })
})
