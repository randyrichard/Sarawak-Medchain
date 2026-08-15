import type { PlatformCompany, ProvisionResult } from '@/api/platformApi'

/**
 * The platform console's presentation decisions.
 *
 * The console calls these directly — there is no second copy — so what is asserted in the
 * tests is what an operator sees. Same level as the other feature libs; the web suite has
 * no DOM renderer.
 */

export type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical'

/**
 * Whether a customer can use the product right now.
 *
 * Deliberately two separate readings rather than one merged "health" badge: a company can
 * be past due and still working, or paid up and suspended for cause, and collapsing those
 * into one colour loses the distinction an operator is actually looking for.
 */
export function companyStatusBadge(status: string): { label: string; tone: Tone } {
  return status === 'suspended'
    ? { label: 'Suspended', tone: 'critical' }
    : { label: 'Active', tone: 'good' }
}

export function subscriptionBadge(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active': return { label: 'Paying', tone: 'good' }
    case 'trial': return { label: 'Trial', tone: 'accent' }
    case 'past_due': return { label: 'Past due', tone: 'warning' }
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral' }
    default: return { label: status, tone: 'neutral' }
  }
}

/**
 * What the operator is told after provisioning.
 *
 * The distinction that matters is whether the customer's administrator actually received
 * anything. "Created" is not "they can get in" — if no email went out, somebody has to
 * send the link, and saying so plainly is the difference between a customer who starts on
 * Monday and one who waits for a message that never arrives.
 */
export function provisionOutcome(r: ProvisionResult): {
  headline: string
  detail: string
  tone: 'success' | 'warning' | 'critical'
  showLink: boolean
} {
  if (r.deliveryStatus === 'sent') {
    return {
      headline: `${r.companyName} is ready.`,
      detail: `An invitation is on its way to ${r.adminEmail}. They set their own password `
        + 'and sign in — nothing else is needed from you.',
      tone: 'success',
      showLink: false,
    }
  }
  if (r.deliveryStatus === 'failed') {
    return {
      headline: `${r.companyName} was created, but the invitation email failed.`,
      detail: 'The customer exists and the link below works. Send it to them yourself, or '
        + 'fix the mail configuration and resend from the workspace.',
      tone: 'critical',
      showLink: true,
    }
  }
  return {
    headline: `${r.companyName} is ready.`,
    detail: 'No mail provider is configured, so nothing was emailed. Send the link below '
      + 'to their administrator.',
    tone: 'warning',
    showLink: true,
  }
}

/** Monthly recurring revenue across paying customers, from the server's own figures. */
export function monthlyRecurring(companies: PlatformCompany[]): {
  paying: number
  trial: number
  mrrMyr: number
} {
  const paying = companies.filter(
    (c) => c.subscriptionStatus === 'active' && c.status === 'active',
  )
  return {
    paying: paying.length,
    trial: companies.filter((c) => c.subscriptionStatus === 'trial').length,
    // Only what is actually being paid: counting trials as revenue is how a forecast
    // becomes fiction.
    mrrMyr: paying.reduce((sum, c) => sum + c.monthlyPriceMyr, 0),
  }
}

/** "RM 25,000" — matches the server's formatting so the two never disagree. */
export function formatMyr(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY')}`
}

/**
 * The id a company name will become, mirrored from the server so the operator sees it
 * before they submit rather than discovering it in a URL afterwards.
 */
export function previewCompanyId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    // Mirrors companyIdFrom on the server, including dropping the combining marks NFKD
    // produces and trimming after the length cut. If these two ever drift, the operator is
    // shown an id the customer will not actually have.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
}
