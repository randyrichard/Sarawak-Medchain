// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { FORM_SPACING } from './Form'

/*
 * The law of proximity: things near each other are read as one group, so the space inside
 * a group has to be clearly smaller than the space between groups, and feedback belongs next
 * to the thing that caused it. Each test names what a person would misread if it failed.
 */

afterEach(cleanup)

/** Tailwind's spacing scale: `space-y-5` is 5 × 4px. */
const px = (cls: string, prefix: string) => {
  const m = new RegExp(`(?:^|\\s)${prefix}-([\\d.]+)(?:\\s|$)`).exec(cls)
  if (!m) throw new Error(`no ${prefix} in "${cls}"`)
  return Number(m[1]) * 4
}

describe('a label belongs to its own field', () => {
  const fieldSource = readFileSync(join(__dirname, 'Field.tsx'), 'utf8')
  const inside = px(/<div className="(space-y-[\d.]+)">/.exec(fieldSource)![1], 'space-y')

  it('keeps label, control and hint tight (4-8px)', () => {
    expect(inside).toBeGreaterThanOrEqual(4)
    expect(inside).toBeLessThanOrEqual(8)
  })

  it('puts at least three times that between fields, stacked or side by side', () => {
    expect(px(FORM_SPACING.stack, 'space-y')).toBeGreaterThanOrEqual(inside * 3)
    expect(px(FORM_SPACING.row, 'gap-y')).toBeGreaterThanOrEqual(inside * 3)
  })

  it('separates sections by more than it separates fields', () => {
    expect(px(FORM_SPACING.section, 'space-y')).toBeGreaterThan(px(FORM_SPACING.stack, 'space-y'))
  })
})

describe("a dialog's error sits beside the button that caused it", () => {
  function Long({ error }: { error?: string }) {
    return (
      <Dialog
        open onClose={() => {}} title="Register asset" error={error}
        footer={<><Button variant="secondary">Cancel</Button><Button>Save</Button></>}
      >
        {Array.from({ length: 30 }).map((_, i) => <p key={i}>Field {i}</p>)}
      </Dialog>
    )
  }

  it('renders it immediately above the footer buttons, outside the scrolling body', () => {
    render(<Long error="Serial number already registered." />)
    const alert = screen.getByRole('alert')
    const save = screen.getByRole('button', { name: 'Save' })
    const body = document.querySelector('[data-dialog-body]')!
    expect(body.contains(alert)).toBe(false) // never scrolled out of view
    // The very next block after the error is the footer holding the buttons.
    const slot = alert.parentElement!
    expect(slot.nextElementSibling!.contains(save)).toBe(true)
  })

  it('shows nothing when there is no error', () => {
    render(<Long />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('no dialog puts its error back at the top of the body', () => {
  // A source check, because the failure is a layout choice made in each of fifty dialogs:
  // a critical Alert written into a Dialog's children lands at the top of a scrolling body.
  const root = join(__dirname, '..', '..', 'features')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx') && !p.includes('.test.')) files.push(p)
    }
  }
  walk(root)

  it('passes submit errors through Dialog `error`', () => {
    const offenders: string[] = []
    const inlineError = /\{(\w+)\s*&&\s*<Alert tone="critical"(?: className="[^"]*")?>\{\1\}<\/Alert>\}/
    for (const f of files) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/<Dialog\b/g)) {
        const end = s.indexOf('</Dialog>', m.index)
        if (end > 0 && inlineError.test(s.slice(m.index, end))) offenders.push(f.slice(root.length + 1))
      }
    }
    expect(offenders).toEqual([])
  })
})
