import { describe, it, expect } from 'vitest'
import { personRegisterHint } from './PersonRegisterOptions'

/**
 * What an empty person picker says, and why it needed two answers.
 *
 * A workspace with three employees at Bintulu Plant, and an administrator whose membership
 * was scoped to LMG, was told "Add people under Employees or Contractors to pick them
 * here". Every word of that is wrong for that reader: the people exist, they are on the
 * register already, and following the advice creates duplicates of colleagues who are
 * there. It also cost most of an afternoon, because it was the only thing on screen
 * claiming to explain the empty list and it explained it incorrectly.
 *
 * So the tests below are as much about what the message must NOT claim as what it says.
 */
describe('personRegisterHint', () => {
  it('tells an unrestricted reader to add people, because that is the only reason left', () => {
    expect(personRegisterHint()).toMatch(/add people/i)
    expect(personRegisterHint([])).toMatch(/Employees or Contractors/i)
  })

  it('names the site when the reader can only see one', () => {
    const hint = personRegisterHint(['LMG'])
    expect(hint).toContain('LMG')
    expect(hint).toMatch(/only covers that site/i)
  })

  it('does not tell a site-scoped reader to add people', () => {
    /*
     * The whole point. This advice is actively harmful to somebody whose colleagues are
     * already on the register at a site they cannot see - it produces duplicate employee
     * records, which is the one thing the workforce register exists to prevent.
     */
    const hint = personRegisterHint(['LMG'])
    expect(hint).not.toMatch(/add (people|them)/i)
  })

  it('does not claim anybody exists elsewhere', () => {
    /*
     * The client cannot see past its own scope and must not imply that it can. Saying
     * "they are at another site" would be a guess presented as fact - the same class of
     * mistake as the message it replaces, pointing the other way.
     */
    const hint = personRegisterHint(['LMG'])
    expect(hint).not.toMatch(/they are at|people exist|somebody else/i)
    // It states the filter and leaves the conclusion to somebody who can look.
    expect(hint).toMatch(/not listed/i)
  })

  it('counts the sites rather than listing all of them when there are several', () => {
    // An option label has no room for six site names, and a truncated list reads as a bug.
    const hint = personRegisterHint(['LMG', 'Bintulu Plant', 'Miri Yard'])
    expect(hint).toContain('3 sites')
    expect(hint).not.toContain('Miri Yard')
  })

  it('names where to add somebody, because that differs by picker', () => {
    /*
     * A visitor's host must be an employee - a contractor worker cannot approve a visit -
     * so sending reception to add one would be advice that cannot work. The default stays
     * the broader wording for the pickers where both registers genuinely apply.
     */
    expect(personRegisterHint([], 'Employees')).toContain('Employees')
    expect(personRegisterHint([], 'Employees')).not.toContain('Contractors')
    expect(personRegisterHint()).toContain('Employees or Contractors')
  })

  it('ignores where-to-add when the reason is a site scope', () => {
    // Adding somebody is not the fix in that case, so the advice does not appear at all.
    const hint = personRegisterHint(['LMG'], 'Employees')
    expect(hint).not.toMatch(/add /i)
    expect(hint).toContain('LMG')
  })

  it('is a single line in every case, because it renders inside an option', () => {
    for (const scope of [[], ['LMG'], ['LMG', 'Bintulu Plant']]) {
      expect(personRegisterHint(scope), JSON.stringify(scope)).not.toContain('\n')
    }
  })
})
