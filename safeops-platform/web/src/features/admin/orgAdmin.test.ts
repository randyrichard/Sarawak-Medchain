import { describe, it, expect } from 'vitest'
import {
  canResendInvitation, departmentInUseSummary, invitationDelivery, invitationLink,
  invitationState, siteAllowanceLabel, siteAllowanceOf, siteInUseSummary, siteLimitNote,
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

describe('invitationDelivery', () => {
  it('uses the same words as the Reports page', () => {
    // An operator who learnt what "failed" means there should not learn it twice.
    expect(invitationDelivery('sent')).toEqual({ label: 'Emailed', tone: 'good' })
    expect(invitationDelivery('failed')).toEqual({ label: 'Email Failed', tone: 'critical' })
    expect(invitationDelivery('email_pending')).toEqual({ label: 'Sending', tone: 'warning' })
  })

  it('does not dress "nobody configured mail" up as a failure', () => {
    /*
     * "created" means no provider exists, which is a configuration gap rather than
     * something that went wrong. Colouring it red sends an administrator hunting a bug.
     */
    const created = invitationDelivery('created')
    expect(created.label).toBe('Not Emailed')
    expect(created.tone).toBe('neutral')
  })

  it('never reports an email as delivered for any other state', () => {
    for (const s of ['created', 'email_pending', 'failed']) {
      expect(invitationDelivery(s).label).not.toBe('Emailed')
    }
  })
})

describe('canResendInvitation', () => {
  it('offers a resend on a live invitation with attempts left', () => {
    expect(canResendInvitation({ state: 'pending', attempts: 1, maxSends: 5 })).toBe(true)
  })

  it('does not offer a click that can only fail', () => {
    for (const state of ['accepted', 'revoked', 'expired']) {
      expect(canResendInvitation({ state, attempts: 1, maxSends: 5 })).toBe(false)
    }
  })

  it('stops at the ceiling', () => {
    // Past this the server refuses, so offering the button would be a lie.
    expect(canResendInvitation({ state: 'pending', attempts: 5, maxSends: 5 })).toBe(false)
    expect(canResendInvitation({ state: 'pending', attempts: 4, maxSends: 5 })).toBe(true)
  })
})

/**
 * The plan's site allowance.
 *
 * This decides whether New site is enabled, and it has to agree with the API's own count
 * or the button lies in one direction or the other. The two cases that matter are the ones
 * that are easy to get wrong: a deactivated site must not consume the allowance, and a
 * workspace already above its limit must be reported honestly rather than clamped - it is
 * a real state, reached by downgrading a customer or by grandfathering one in.
 */
describe('siteAllowanceOf', () => {
  const sites = (active: number, inactive = 0) => [
    ...Array.from({ length: active }, () => ({ active: true })),
    ...Array.from({ length: inactive }, () => ({ active: false })),
  ]

  it('reports no limit when the plan sets none', () => {
    const a = siteAllowanceOf(sites(9), { maxSites: null })
    expect(a).toEqual({ limit: null, used: 9, atLimit: false })
    expect(siteAllowanceLabel(a)).toBeNull()
  })

  it('counts up to the limit without reaching it', () => {
    const a = siteAllowanceOf(sites(2), { maxSites: 3 })
    expect(a.atLimit).toBe(false)
    expect(siteAllowanceLabel(a)).toBe('2 of 3 sites')
  })

  it('is at the limit on the last one, not after it', () => {
    // The third site is allowed; the fourth is what gets refused. Off by one here means
    // either selling three and delivering two, or delivering four.
    expect(siteAllowanceOf(sites(3), { maxSites: 3 }).atLimit).toBe(true)
  })

  it('does not count deactivated sites against the allowance', () => {
    // How a customer at the limit opens a new site without calling anyone: retire the one
    // that closed. The server counts the same way.
    const a = siteAllowanceOf(sites(2, 5), { maxSites: 3 })
    expect(a.used).toBe(2)
    expect(a.atLimit).toBe(false)
  })

  it('reports a workspace above its limit as it is', () => {
    // Reached by downgrading someone, or by a legacy tenant moving onto a plan. Nothing is
    // taken away - the count is just told truthfully and the next one is refused.
    const a = siteAllowanceOf(sites(6), { maxSites: 3 })
    expect(a.used).toBe(6)
    expect(a.atLimit).toBe(true)
    expect(siteAllowanceLabel(a)).toBe('6 of 3 sites')
  })

  it('treats a still-loading list as empty rather than as at the limit', () => {
    // rows is null until the fetch lands. Reading that as "at the limit" would disable the
    // button for the first second of every visit.
    expect(siteAllowanceOf(null, { maxSites: 3 })).toEqual({ limit: 3, used: 0, atLimit: false })
  })

  it('assumes no limit when the server sent no entitlements', () => {
    // An API that has not been redeployed yet. The write is refused server-side either way,
    // so the browser guessing generously only ever costs a clearer error message.
    expect(siteAllowanceOf(sites(4), undefined).atLimit).toBe(false)
  })
})

describe('siteLimitNote', () => {
  it('names the plan, the number, and both ways out', () => {
    const note = siteLimitNote({ limit: 3, used: 3, atLimit: true }, 'Standard')
    expect(note).toContain('Standard')
    expect(note).toContain('3 active sites')
    expect(note).toContain('Deactivate')
    expect(note).toContain('Premium')
  })

  it('reads correctly for a one-site plan', () => {
    expect(siteLimitNote({ limit: 1, used: 1, atLimit: true }, 'Starter'))
      .toContain('1 active site,')
  })
})
