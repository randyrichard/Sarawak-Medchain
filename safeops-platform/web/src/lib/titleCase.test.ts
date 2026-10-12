import { describe, expect, it } from 'vitest'
import { titleCase } from './titleCase'

describe('Title Case for the names on screen', () => {
  it('capitalises every word of a name', () => {
    expect(titleCase('Incident board')).toBe('Incident Board')
    expect(titleCase('Corrective actions')).toBe('Corrective Actions')
    expect(titleCase('Toolbox meetings')).toBe('Toolbox Meetings')
    expect(titleCase('Record toolbox meeting')).toBe('Record Toolbox Meeting')
  })

  it('keeps the small joining words lowercase inside a name', () => {
    expect(titleCase('Report a near miss')).toBe('Report a Near Miss')
    expect(titleCase('Permits to work')).toBe('Permits to Work')
    expect(titleCase('Hazards and controls discussed')).toBe('Hazards and Controls Discussed')
    expect(titleCase('Report A Near Miss')).toBe('Report a Near Miss')
  })

  it('always capitalises the first and last word', () => {
    expect(titleCase('Sign in')).toBe('Sign In')
    expect(titleCase('a day on site')).toBe('A Day on Site')
    expect(titleCase('What it is for')).toBe('What It Is For')
  })

  it('leaves acronyms and names that carry their own capitals', () => {
    expect(titleCase('HSE performance')).toBe('HSE Performance')
    expect(titleCase('SafeChain in one minute')).toBe('SafeChain in One Minute')
    expect(titleCase('Add to iPhone home screen')).toBe('Add to iPhone Home Screen')
    expect(titleCase('PPE issued')).toBe('PPE Issued')
  })

  it('handles symbols, numbers, hyphens and brackets', () => {
    expect(titleCase('Assets & inspections')).toBe('Assets & Inspections')
    expect(titleCase('Expiring in 7 days')).toBe('Expiring in 7 Days')
    expect(titleCase('Two-step sign-in')).toBe('Two-Step Sign-In')
    expect(titleCase('Day-to-day checks')).toBe('Day-to-Day Checks')
    expect(titleCase('Follow-up actions')).toBe('Follow-Up Actions')
    // A small word that opens or ends a hyphenated word is part of a name, not a joiner.
    expect(titleCase('Department on-time performance')).toBe('Department On-Time Performance')
    expect(titleCase('Check-in desk')).toBe('Check-In Desk')
    expect(titleCase('Search (also in titles)')).toBe('Search (Also in Titles)')
    expect(titleCase('Someone not listed…')).toBe('Someone Not Listed…')
    expect(titleCase("Today's briefing")).toBe("Today's Briefing")
  })

  it('capitalises the "in" or "on" that belongs to a verb', () => {
    expect(titleCase('Checked in today')).toBe('Checked In Today')
    expect(titleCase('Turn on multi-factor sign-in')).toBe('Turn On Multi-Factor Sign-In')
    expect(titleCase('Check visitors in and out')).toBe('Check Visitors In and Out')
    // ...and leaves the ordinary preposition alone.
    expect(titleCase('Visitors on site')).toBe('Visitors on Site')
    expect(titleCase('Incidents in range')).toBe('Incidents in Range')
  })

  it('starts afresh after a colon or dash', () => {
    expect(titleCase('Your role: an employee')).toBe('Your Role: An Employee')
    expect(titleCase('Step 2 - the review')).toBe('Step 2 - The Review')
  })

  it('treats a piece of a longer label by where it sits', () => {
    // <Button>Assign to {name}</Button>: "to" is followed by the name, so it is not last.
    expect(titleCase('Assign to ', { atEnd: false })).toBe('Assign to ')
    expect(titleCase(' and close', { atStart: false })).toBe(' and Close')
  })

  it('is stable when applied twice', () => {
    for (const s of ['Report a near miss', 'Sign-in history', 'HSE performance', 'Permits to work']) {
      expect(titleCase(titleCase(s))).toBe(titleCase(s))
    }
  })
})
