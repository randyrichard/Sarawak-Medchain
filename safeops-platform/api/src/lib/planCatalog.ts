/**
 * What a SafeOps subscription costs, in one place.
 *
 * The company row stores only the plan key. Every price, label and entitlement is here, so
 * repricing Standard is one edit rather than an UPDATE across every customer row and a
 * hunt for the places a number was written down. Nothing outside this module should
 * contain a ringgit figure.
 *
 * `enterprise` exists because companies created before plans did carry it. It is not
 * offered for new customers - `SELLABLE_PLANS` is what the console shows - but it must
 * keep resolving, or an existing customer's record stops rendering.
 */

export interface Plan {
  key: string
  label: string
  /** Monthly price in whole Malaysian ringgit. */
  monthlyPriceMyr: number
  summary: string
  /** Offered to new customers. Legacy plans stay resolvable but unsellable. */
  sellable: boolean
}

export const PLANS: Record<string, Plan> = {
  standard: {
    key: 'standard',
    label: 'Standard',
    monthlyPriceMyr: 10_000,
    summary: 'Incidents, investigations, corrective actions, permits, equipment, visitors, '
      + 'reports and the audit trail, across every site.',
    sellable: true,
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    monthlyPriceMyr: 15_000,
    summary: 'Everything in Standard, with scheduled report delivery and priority support.',
    sellable: true,
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise (legacy)',
    monthlyPriceMyr: 0,
    summary: 'Companies created before the plans existed. Priced outside the product.',
    sellable: false,
  },
}

export const SELLABLE_PLANS = Object.values(PLANS).filter((p) => p.sellable)

export function isSellablePlan(key: string): boolean {
  return PLANS[key]?.sellable === true
}

/**
 * The plan for a stored key.
 *
 * An unrecognised key returns a placeholder rather than throwing. A company whose plan was
 * edited by hand should render as "unknown plan" in the console, not take the page down.
 */
export function planFor(key: string): Plan {
  return PLANS[key] ?? {
    key,
    label: key || 'Unknown',
    monthlyPriceMyr: 0,
    summary: 'This plan is not one the product recognises.',
    sellable: false,
  }
}

/** "RM 10,000" - formatted once, so the console and any future invoice agree. */
export function formatMyr(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY')}`
}

/** Company lifecycle, kept as strings so adding one is not a migration. */
export const COMPANY_STATUSES = ['active', 'suspended'] as const
export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled'] as const
