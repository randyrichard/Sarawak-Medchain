import { describe, it, expect } from 'vitest'
import { overallScore, type ScoreComponent } from './auditPack.js'

/**
 * The compliance score's arithmetic.
 *
 * Worth testing on its own because this is the one number on the pack that is not simply
 * read out of a record — it is computed, it appears on the cover, and an auditor will ask
 * where it came from. The rule that matters most is what happens to a question nobody was
 * asked.
 */
const c = (label: string, met: number, of: number): ScoreComponent =>
  ({ label, met, of, basis: 'test' })

describe('overallScore', () => {
  it('averages the components that applied', () => {
    expect(overallScore([c('a', 1, 1), c('b', 1, 2)])).toBe(75)
  })

  it('is 100 only when everything required was done', () => {
    expect(overallScore([c('a', 4, 4), c('b', 9, 9)])).toBe(100)
  })

  it('is 0 when nothing required was done', () => {
    expect(overallScore([c('a', 0, 4), c('b', 0, 9)])).toBe(0)
  })

  it('leaves out a component nobody was asked', () => {
    /*
     * The rule this test exists for. A site that ran no confined-space work did not score
     * full marks on gas testing — it was never asked the question. Counting an empty
     * component as a pass inflates the score of exactly the sites doing the least work,
     * which is how a compliance figure stops meaning anything.
     */
    const withEmpty = overallScore([c('precautions', 1, 2), c('gas testing', 0, 0)])
    const without = overallScore([c('precautions', 1, 2)])
    expect(withEmpty).toBe(without)
    expect(withEmpty).toBe(50)
  })

  it('does not treat an unasked component as a failure either', () => {
    // The opposite mistake: scoring 0/0 as zero would punish a site for work it never did.
    expect(overallScore([c('a', 1, 1), c('b', 0, 0)])).toBe(100)
  })

  it('is null when nothing applied at all', () => {
    // Printed as "N/A". A period with no permits, no people and no isolations has no
    // compliance to measure, and "0%" would read as a catastrophic failure.
    expect(overallScore([c('a', 0, 0), c('b', 0, 0)])).toBeNull()
    expect(overallScore([])).toBeNull()
  })

  it('weights every component the same', () => {
    /*
     * Deliberate, and worth pinning down so a later change is a decision rather than a
     * drift. Weighting would be an assertion about which failure matters more — an
     * unreleased isolation against an expired medical — and this document is evidence for
     * an auditor to judge, not a place to publish that opinion.
     */
    const a = overallScore([c('big', 0, 1000), c('small', 1, 1)])
    expect(a).toBe(50)
  })

  it('rounds to a whole percent', () => {
    expect(overallScore([c('a', 2, 3)])).toBe(67)
  })
})
