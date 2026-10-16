import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/*
 * Fitts's law: the time to hit a target grows as it gets smaller (T = a + b·log2(D/W + 1)),
 * and a fingertip is a far blunter pointer than a cursor. SafeChain sizes targets at 24px or
 * more for a mouse (WCAG 2.5.8) and at the medium touch sizes on a touch screen - 40px for a
 * control, 36px for a compact one, 44px for a form's main action - using the `coarse:`
 * variant so a desktop keeps its density. The sizes are three tokens in tailwind.config.js,
 * so the whole app can be tuned in one place.
 *
 * Sizes come from CSS, which jsdom does not lay out, so these hold the class contract in the
 * source; `npm run audit:mobile` measures the real targets on phones.
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

describe('the touch sizes', () => {
  const config = readFileSync(join(src, '..', 'tailwind.config.js'), 'utf8')
  /** A spacing token's size in px, as tailwind.config.js defines it in rem. */
  const token = (name: string) => {
    const m = new RegExp(`\\n\\s*'?${name}'?: '([\\d.]+)rem'`).exec(config)
    return m ? parseFloat(m[1]) * 16 : null
  }

  it('are medium: 36px compact, 40px regular, 44px for the main action', () => {
    expect(token('touch-sm')).toBe(36)
    expect(token('touch')).toBe(40)
    expect(token('touch-lg')).toBe(44)
  })

  it('come from those tokens, never from a number written into a page', () => {
    // A literal (`coarse:h-11`, `coarse:min-h-[44px]`) is how 44px ended up in 66 files.
    const literals: string[] = []
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/coarse:(?:min-)?[hw]-(?:9|1\d|\[[^\]]+\])(?![\w-])/g)) {
        literals.push(`${f.slice(src.length + 1)}: ${m[0]}`)
      }
    }
    expect(literals).toEqual([])
  })
})

describe('form controls grow to a finger-sized target on touch', () => {
  it('sizes every Input, Select and date field at the touch height on a coarse pointer', () => {
    expect(read('components/ui/Field.tsx')).toMatch(/const controlCls[\s\S]*?'h-9[^']*coarse:h-touch\b/)
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
        if (!/coarse:(h|min-h)-touch(-sm|-lg)?\b/.test(m[1])) offenders.push(`${f.slice(src.length + 1)}: <${tag} ${m[1].slice(0, 50)}`)
      }
    }
    expect(inspected).toBeGreaterThan(20) // the scan must actually be looking at the controls
    expect(offenders).toEqual([])
  })
})

describe('small icon buttons are not the smallest thing on the page', () => {
  it('gives the alert dismiss button 24px for a mouse and the touch size on touch', () => {
    const alert = read('components/ui/Alert.tsx')
    const button = /aria-label="Dismiss"[\s\S]*?className="([^"]+)"/.exec(alert)![1]
    expect(button).toMatch(/\bh-6\b/)
    expect(button).toMatch(/\bw-6\b/)
    expect(button).toMatch(/coarse:h-touch\b/)
    expect(button).toMatch(/coarse:w-touch\b/)
  })

  it('makes sortable column headers at least 24px, and the compact touch size on touch', () => {
    expect(read('components/ui/Table.tsx')).toMatch(/inline-flex min-h-6 [^']*coarse:min-h-touch-sm/)
  })
})
