// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Skeleton, SKELETON_PERIOD_MS, skeletonPhase } from './Skeleton'

/**
 * Loading placeholders: one steady light across the page.
 *
 * They pulsed, out of step with one another. With reduced motion switched on (Windows does
 * this when its animation effects are turned off) they strobed instead, because the rule
 * that shortened every animation never stopped the endless ones.
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8')

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('a loading placeholder', () => {
  it('joins the light where it already is, however late it appears', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5_000)
    const early = render(<Skeleton />).container.firstElementChild as HTMLElement
    vi.spyOn(performance, 'now').mockReturnValue(6_100)
    const late = render(<Skeleton />).container.firstElementChild as HTMLElement

    expect(early.style.getPropertyValue('--skeleton-phase')).toBe('-200ms')
    expect(late.style.getPropertyValue('--skeleton-phase')).toBe('-1300ms')
    // Each one's cycle began at the same instant, a whole number of cycles after page load
    // (4.8s for both), so at any moment the two lights are at the same point.
    expect(5_000 - 200).toBe(6_100 - 1_300)
    expect((5_000 - 200) % SKELETON_PERIOD_MS).toBe(0)
  })

  it('keeps its place in the cycle when the page re-renders', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const { container, rerender } = render(<Skeleton className="h-3" />)
    now.mockReturnValue(2_000)
    rerender(<Skeleton className="h-3 w-1/2" />)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--skeleton-phase')).toBe('-1000ms')
  })

  it('is drawn by the stylesheet, at the period the component counts in', () => {
    const el = render(<Skeleton className="h-8 w-8 rounded-full" />).container.firstElementChild as HTMLElement
    expect(el.className).toMatch(/\bskeleton\b/)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    const declared = css.match(/animation:\s*skeleton-shine\s+([\d.]+)s/)
    expect(declared, 'index.css animates .skeleton::after with skeleton-shine').not.toBeNull()
    expect(Number(declared![1]) * 1000).toBe(SKELETON_PERIOD_MS)
  })

  it('moves only by transform, which the compositor can draw while the page is busy', () => {
    const frames = css.match(/@keyframes skeleton-shine\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(frames).toMatch(/transform:/)
    expect(frames).not.toMatch(/opacity|background|width|left/)
  })

  it('phases stay within one cycle', () => {
    for (const t of [0, 1, 2_399, 2_400, 123_456.7]) {
      const ms = Number(skeletonPhase(t).replace('ms', ''))
      expect(ms).toBeLessThanOrEqual(0)
      expect(ms).toBeGreaterThan(-SKELETON_PERIOD_MS)
    }
  })
})

describe('with reduced motion', () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

  it('stops endless animations instead of running them thousands of times a second', () => {
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms !important/)
    expect(reduced).toMatch(/animation-iteration-count:\s*1 !important/)
  })

  it('shows a still placeholder', () => {
    expect(reduced).toMatch(/\.skeleton::after\s*\{\s*animation:\s*none;/)
  })
})
