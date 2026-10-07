import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DIALOG_LAYOUT } from '@/components/ui/Dialog'

/**
 * Mobile layout rules, held in place.
 *
 * jsdom does no layout, so whether a page fits a phone can only be measured in a browser:
 * scripts/mobile-audit/ does that, across iPhone and Android sizes, portrait, landscape and
 * with the keyboard up. These tests pin the rules that audit found missing, so a change that
 * quietly undoes one fails here without anyone having to run it.
 */
const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(p)
  }
  return out
}

describe('mobile layout', () => {
  it('anchors every horizontal scroll box, so hidden labels inside cannot widen the page', () => {
    /*
     * A screen-reader-only label is `position: absolute`. Inside a scroll box that is not
     * itself positioned, its containing block is the page, so the box does not clip it:
     * the "Overdue actions" label in a table's off-screen column made the HSE Performance
     * page 516px wide on a 412px phone, and the phone zoomed the whole page out to fit.
     */
    const offenders: string[] = []
    for (const file of sources(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/(['"])([^'"\n]*\boverflow-x-auto\b[^'"\n]*)\1/g)) {
        if (!/(^|\s)relative(\s|$)/.test(m[2])) offenders.push(`${relative(SRC, file)}: "${m[2]}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('lets page header actions wrap rather than run off a phone screen', () => {
    // As `shrink-0` alone, four actions made a 678px row on a 412px phone.
    const header = read('src/components/ui/PageHeader.tsx')
    expect(header).toMatch(/className="flex max-w-full shrink-0 flex-wrap/)
  })

  it('scrolls a dialog as one on a short screen, so its fields stay reachable', () => {
    // In landscape with the keyboard up, the pinned header and footer took all the height.
    expect(DIALOG_LAYOUT.panel).toContain('short:overflow-y-auto')
    expect(DIALOG_LAYOUT.body).toContain('short:overflow-visible')
    expect(read('tailwind.config.js')).toMatch(/short:\s*\{\s*raw:\s*'\(max-height: 500px\)'/)
  })

  it('stops the near-miss submit bar pinning while someone is typing', () => {
    // Pinned, it covered "Where was it?" on every phone once the keyboard was up.
    const page = read('src/features/incidents/ReportNearMissPage.tsx')
    expect(page).toContain('group/nm')
    expect(page).toMatch(/sticky bottom-0[^"]*short:static[^"]*group-has-\[input:focus,textarea:focus\]\/nm:static/)
  })

  it('gives text fields 16px on touch screens, so iPhones do not zoom in on focus', () => {
    const css = read('src/styles/index.css')
    const rule = css.slice(css.indexOf('@media (pointer: coarse)'))
    expect(rule).toMatch(/input:not\(\[type='checkbox'\]\)/)
    expect(rule).toMatch(/select/)
    expect(rule).toMatch(/textarea/)
    expect(rule).toMatch(/font-size:\s*16px\s*!important/)
    // And zoom itself is never disabled - people who need it must keep it (WCAG 1.4.4).
    expect(read('index.html')).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/)
  })

  it('makes every close button a 44px target on a touch screen', () => {
    // Drawer and dialog close buttons were 24-28px: the control people reach for most on a
    // phone, in a corner, where a miss lands on the page behind.
    const offenders: string[] = []
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/aria-label="Close[^"]*"/g)) {
        const start = text.lastIndexOf('<button', m.index)
        const end = text.indexOf('</button>', m.index)
        if (start < 0 || end < 0) continue
        if (!text.slice(start, end).includes('coarse:min-h-11')) offenders.push(`${relative(SRC, file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('makes checkbox and radio rows 44px tall on a touch screen', () => {
    // The label is the target. Rows of them (an invitation's sites) were 19px tall.
    const css = read('src/styles/index.css')
    const rule = css.slice(css.indexOf('@media (pointer: coarse)'))
    expect(rule).toMatch(/label:has\(> input\[type='checkbox'\]\),\s*label:has\(> input\[type='radio'\]\)\s*\{\s*min-height:\s*44px/)
    expect(read('src/components/ui/Switch.tsx')).toContain('coarse:h-11 coarse:w-12')
  })

  it('lists a month by day on a phone instead of drawing seven 45px columns', () => {
    // In the grid, each entry was a dot and the first character of its code.
    for (const f of ['src/features/actions/components/CalendarView.tsx', 'src/features/assets/components/InspectionCalendar.tsx']) {
      const src = read(f)
      expect(src).toContain('<MonthAgenda')
      expect(src).toMatch(/className="hidden grid-cols-7[^"]*sm:grid"/)
      // Fading a whole cell took its text below 4.5:1.
      expect(src).not.toContain('opacity-45')
    }
  })
})
