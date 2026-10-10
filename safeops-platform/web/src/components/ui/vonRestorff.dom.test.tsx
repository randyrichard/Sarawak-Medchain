// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { AttentionIcon, attentionOf, attentionStripe } from './Attention'

/*
 * The Von Restorff (isolation) effect: among items that look alike, the one that differs is
 * the one noticed. SafeChain spends that on what needs action - and only that - and never
 * signals it by colour alone (WCAG 1.4.1).
 */

afterEach(cleanup)

describe('what needs attention is marked by more than colour', () => {
  it('reads the attention level from the tone a page already uses', () => {
    expect(attentionOf('var(--critical)')).toBe('critical')
    expect(attentionOf('var(--warning)')).toBe('warning')
    expect(attentionOf('var(--serious)')).toBe('warning')
    expect(attentionOf('var(--ink)')).toBeNull()
    expect(attentionOf(undefined)).toBeNull()
  })

  it('adds an icon and words for screen readers, not just a hue', () => {
    const { container } = render(<p><AttentionIcon level="critical" /></p>)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toBe('Needs attention now')
    render(<p data-testid="calm"><AttentionIcon level={null} /></p>)
    expect(document.querySelector('[data-testid=calm]')!.innerHTML).toBe('')
  })

  it('keeps the strongest mark - the stripe - for critical alone', () => {
    expect(attentionStripe('critical')?.boxShadow).toContain('var(--critical)')
    expect(attentionStripe('warning')).toBeUndefined()
    expect(attentionStripe(null)).toBeUndefined()
  })
})

describe('across the product', () => {
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
  const rel = (f: string) => f.slice(root.length + 1)

  it('marks every coloured KPI value with an icon, not colour alone', () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8')
      return /text-2xl font-semibold tracking-tight"[^>]*style=\{\{ color:/.test(s.replace(/\n\s*/g, ' ')) && !s.includes('<AttentionIcon')
    }).map(rel)
    expect(offenders).toEqual([])
  })

  it("never gives a selected filter or toggle the primary button's solid fill", () => {
    // One solid-accent standout per view: the primary action. A selected chip in the same
    // fill competes with it as an equal.
    const offenders: string[] = []
    for (const f of files) {
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/aria-pressed=\{[^}]*\}[\s\S]{0,400}?className=\{cn\(([\s\S]*?)\)\}/g)) {
        if (m[1].includes('bg-accent-solid')) offenders.push(rel(f))
      }
    }
    expect(offenders).toEqual([])
  })
})
