import { describe, it, expect } from 'vitest'
import type { PlatformCompany, ProvisionResult } from '@/api/platformApi'
import {
  companyStatusBadge, formatMyr, monthlyRecurring, previewCompanyId, provisionOutcome,
  subscriptionBadge,
} from './lib'

/**
 * The platform console's decisions.
 *
 * The console calls these directly - there is no second copy - so what is asserted here is
 * what an operator sees. Same level as the dashboard's and the reports page's libs; the web
 * suite has no DOM renderer.
 *
 * Two things are worth more than the rest: that revenue never counts money nobody is
 * paying, and that the operator is told plainly when an invitation did not actually reach
 * anyone. Both are ways to be quietly wrong.
 */

function company(over: Partial<PlatformCompany> = {}): PlatformCompany {
  return {
    id: 'acme', name: 'Acme', industry: 'Oil and gas',
    plan: 'standard', planLabel: 'Standard',
    monthlyPriceMyr: 10_000, monthlyPrice: 'RM 10,000',
    status: 'active', subscriptionStatus: 'active',
    provisionedAt: null, provisionedBy: null, users: 4, sites: 1,
    ...over,
  }
}

function result(over: Partial<ProvisionResult> = {}): ProvisionResult {
  return {
    companyId: 'acme', companyName: 'Acme Sdn Bhd',
    siteId: 'site-1', siteName: 'Bintulu Plant',
    adminEmail: 'hse@acme.com',
    plan: 'standard', planLabel: 'Standard', monthlyPrice: 'RM 10,000',
    deliveryStatus: 'sent',
    ...over,
  }
}

describe('status badges', () => {
  it('reads suspension and billing separately', () => {
    // A customer can be paid up and suspended for cause, or past due and still working.
    // One merged "health" badge would lose exactly the distinction being looked for.
    const suspendedButPaying = company({ status: 'suspended', subscriptionStatus: 'active' })
    expect(companyStatusBadge(suspendedButPaying.status).label).toBe('Suspended')
    expect(companyStatusBadge(suspendedButPaying.status).tone).toBe('critical')
    expect(subscriptionBadge(suspendedButPaying.subscriptionStatus).label).toBe('Paying')
  })

  it('names every subscription state a company can hold', () => {
    expect(subscriptionBadge('active').label).toBe('Paying')
    expect(subscriptionBadge('trial').label).toBe('Trial')
    expect(subscriptionBadge('past_due').label).toBe('Past Due')
    expect(subscriptionBadge('past_due').tone).toBe('warning')
    expect(subscriptionBadge('cancelled').label).toBe('Cancelled')
  })

  it('shows an unknown status rather than hiding it', () => {
    // A state added server-side and not yet handled here must still be visible - blanking
    // it would make a customer look fine when nobody knows that they are.
    expect(subscriptionBadge('grace_period').label).toBe('grace_period')
  })
})

describe('monthlyRecurring', () => {
  it('counts only money actually being paid', () => {
    const money = monthlyRecurring([
      company({ id: 'a', subscriptionStatus: 'active', monthlyPriceMyr: 10_000 }),
      company({ id: 'b', subscriptionStatus: 'active', monthlyPriceMyr: 15_000 }),
      company({ id: 'c', subscriptionStatus: 'trial', monthlyPriceMyr: 15_000 }),
      company({ id: 'd', subscriptionStatus: 'cancelled', monthlyPriceMyr: 10_000 }),
      company({ id: 'e', subscriptionStatus: 'past_due', monthlyPriceMyr: 10_000 }),
    ])
    expect(money.mrrMyr).toBe(25_000)
    expect(money.paying).toBe(2)
    expect(money.trial).toBe(1)
  })

  it('excludes a suspended customer even while their subscription says active', () => {
    // They cannot use the product. Billing them is a decision somebody makes deliberately,
    // not something this tile should assume by counting them as revenue.
    const money = monthlyRecurring([
      company({ id: 'a', status: 'active', subscriptionStatus: 'active' }),
      company({ id: 'b', status: 'suspended', subscriptionStatus: 'active' }),
    ])
    expect(money.mrrMyr).toBe(10_000)
    expect(money.paying).toBe(1)
  })

  it('is zero on an empty deployment rather than undefined', () => {
    expect(monthlyRecurring([])).toEqual({ paying: 0, trial: 0, mrrMyr: 0 })
  })
})

describe('provisionOutcome', () => {
  it('never shows the invitation link once a provider has the message', () => {
    // The link is a credential. Once it has been emailed, putting it on screen only widens
    // where it can be copied from.
    const out = provisionOutcome(result({ deliveryStatus: 'sent' }))
    expect(out.showLink).toBe(false)
    expect(out.tone).toBe('success')
    expect(out.detail).toContain('hse@acme.com')
  })

  it('says plainly when the email failed, and hands over the link', () => {
    // "Created" is not "they can get in". Without this the customer waits for a message
    // that never arrives.
    const out = provisionOutcome(result({ deliveryStatus: 'failed' }))
    expect(out.tone).toBe('critical')
    expect(out.showLink).toBe(true)
    expect(out.headline).toContain('failed')
  })

  it('flags an unconfigured mail provider as needing the operator to act', () => {
    const out = provisionOutcome(result({ deliveryStatus: 'email_pending' }))
    expect(out.tone).toBe('warning')
    expect(out.showLink).toBe(true)
    expect(out.detail).toContain('Send the link')
  })

  it('treats any non-sent status as needing the link', () => {
    // 'created' is the pre-delivery state. Defaulting it to success would be the same
    // silent failure as above.
    const out = provisionOutcome(result({ deliveryStatus: 'created' }))
    expect(out.showLink).toBe(true)
    expect(out.tone).not.toBe('success')
  })
})

describe('formatMyr', () => {
  it('matches the server so the two never disagree on a price', () => {
    expect(formatMyr(10_000)).toBe('RM 10,000')
    expect(formatMyr(0)).toBe('RM 0')
    expect(formatMyr(1_250_000)).toBe('RM 1,250,000')
  })
})

describe('previewCompanyId', () => {
  it('shows the id before submitting rather than after, in a URL', () => {
    expect(previewCompanyId('Borneo Industrial Group Sdn Bhd'))
      .toBe('borneo-industrial-group-sdn-bhd')
  })

  it('produces a usable id from punctuation and accents', () => {
    expect(previewCompanyId('  Petra & Co. (M) Sdn. Bhd.  ')).toBe('petra-co-m-sdn-bhd')
    expect(previewCompanyId('Café Naîve')).toBe('cafe-naive')
  })

  it('is empty when nothing usable was typed, so no id is promised', () => {
    expect(previewCompanyId('')).toBe('')
    expect(previewCompanyId('   ')).toBe('')
    expect(previewCompanyId('!!!')).toBe('')
  })

  it('bounds the id the same way the server does', () => {
    const long = previewCompanyId('A'.repeat(80) + ' Holdings')
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('-')).toBe(false)
  })
})
