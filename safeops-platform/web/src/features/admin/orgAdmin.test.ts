import { describe, it, expect } from 'vitest'
import {
  departmentInUseSummary, invitationLink, invitationState, siteInUseSummary,
} from './lib'

/**
 * The organisation console's presentation decisions.
 *
 * The sections call these directly - there is no second copy - so what is asserted here is
 * what an administrator sees. The web suite has no DOM renderer, which keeps these at the
 * same level as the incident board's filters and the reports page's badges.
 */
const site = (over: Partial<{
  incidents: number; permits: number; assets: number; employees: number; departments: number
}> = {}) => ({
  inUse: {
    incidents: 0, permits: 0, assets: 0, employees: 0, departments: 0, ...over,
  },
})

describe('siteInUseSummary', () => {
  it('says plainly when nothing depends on a site', () => {
    expect(siteInUseSummary(site())).toBe('Nothing references this site yet.')
  })

  it('names what would be orphaned', () => {
    /*
     * Shown because the only off-switch is deactivation. Stating what depends on a site is
     * how an administrator understands why there is no delete button.
     */
    expect(siteInUseSummary(site({ incidents: 12, permits: 3 })))
      .toBe('Referenced by 12 incidents, 3 permits.')
  })

  it('gets the singular right', () => {
    expect(siteInUseSummary(site({ incidents: 1 }))).toBe('Referenced by 1 incident.')
  })

  it('leaves out the categories that are empty', () => {
    const summary = siteInUseSummary(site({ assets: 4 }))
    expect(summary).toBe('Referenced by 4 assets.')
    expect(summary).not.toMatch(/0 /)
  })
})

describe('departmentInUseSummary', () => {
  it('says plainly when nothing depends on a department', () => {
    expect(departmentInUseSummary({ inUse: { incidents: 0, visitors: 0, teams: 0 } }))
      .toBe('Nothing references this department yet.')
  })

  it('names what would be orphaned', () => {
    expect(departmentInUseSummary({ inUse: { incidents: 2, visitors: 0, teams: 1 } }))
      .toBe('Referenced by 2 incidents, 1 team.')
  })
})

describe('invitationState', () => {
  it('distinguishes every terminal state from a live one', () => {
    expect(invitationState('pending')).toEqual({ label: 'Pending', tone: 'warning' })
    expect(invitationState('accepted')).toEqual({ label: 'Accepted', tone: 'good' })
    expect(invitationState('revoked')).toEqual({ label: 'Revoked', tone: 'neutral' })
    expect(invitationState('expired')).toEqual({ label: 'Expired', tone: 'critical' })
  })

  it('does not dress an expired invitation up as merely waiting', () => {
    // An administrator chasing somebody who "has not accepted yet" needs to know the link
    // died rather than that the person is slow.
    expect(invitationState('expired').tone).not.toBe(invitationState('pending').tone)
  })

  it('passes an unrecognised state through rather than inventing one', () => {
    expect(invitationState('something_new').label).toBe('something_new')
  })
})

describe('invitationLink', () => {
  it('builds a link the invitee can actually follow', () => {
    expect(invitationLink('abc123', 'https://safeops.example'))
      .toBe('https://safeops.example/accept-invitation/abc123')
  })

  it('keeps the token intact', () => {
    // base64url tokens carry - and _; mangling either makes the link fail silently.
    const token = 'aB-3_xY9zQ'
    expect(invitationLink(token, 'https://x.test')).toContain(token)
  })
})
