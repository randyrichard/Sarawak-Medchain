import { describe, it, expect } from 'vitest'
import { DIALOG_LAYOUT } from './Dialog'

/**
 * A dialog must never be taller than the window.
 *
 * The panel had no height limit, so a form with more fields than fit grew past the
 * viewport - and because the wrapper centres it, past both edges at once. The title went
 * off the top, the buttons off the bottom, and nothing scrolled, so the dialog could be
 * neither read nor submitted. Registering a visitor did exactly that on a laptop; on a
 * phone it would be most of the fifty-two dialogs in the product, which is much of where
 * this is used.
 *
 * The fix is four classes and every one of them can be deleted in a refactor without
 * anything looking wrong in the source. So each has its own test saying what breaks.
 */
describe('a dialog stays inside the window', () => {
  it('limits the panel to the height the wrapper leaves it', () => {
    // Without this the panel grows to its content and overflows both edges at once.
    expect(DIALOG_LAYOUT.panel).toContain('max-h-full')
  })

  it('lays the panel out as a column', () => {
    // A header, a scrolling body and a footer are only pinnable in a flex column.
    expect(DIALOG_LAYOUT.panel).toContain('flex')
    expect(DIALOG_LAYOUT.panel).toContain('flex-col')
  })

  it('scrolls the body', () => {
    expect(DIALOG_LAYOUT.body).toContain('overflow-y-auto')
  })

  it('lets the body shrink, which is what makes the overflow rule fire', () => {
    /*
     * The subtle one, and the one most likely to look redundant and be removed. A flex
     * child keeps its content height without `min-h-0`, so the panel goes on growing,
     * `max-h-full` never bites, and every other class here still reads as correct.
     */
    expect(DIALOG_LAYOUT.body).toContain('min-h-0')
  })

  it('keeps the title and the buttons from being squeezed away', () => {
    // They are the two things a reader needs in exactly the situation this exists for:
    // knowing what the dialog is, and being able to leave or submit it.
    expect(DIALOG_LAYOUT.header).toContain('shrink-0')
    expect(DIALOG_LAYOUT.footer).toContain('shrink-0')
  })

  it('stops a scroll at the end of the body rather than moving the page behind it', () => {
    expect(DIALOG_LAYOUT.body).toContain('overscroll-contain')
  })
})
