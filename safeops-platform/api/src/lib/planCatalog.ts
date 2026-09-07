/**
 * What a SafeOps subscription costs and what it includes, in one place.
 *
 * The company row stores only the plan key. Every price, label and entitlement is here, so
 * repricing Standard is one edit rather than an UPDATE across every customer row and a
 * hunt for the places a number was written down. Nothing outside this module should
 * contain a ringgit figure or a plan limit.
 *
 * `enterprise` exists because companies created before plans did carry it. It is not
 * offered for new customers - `SELLABLE_PLANS` is what the console shows - but it must
 * keep resolving, or an existing customer's record stops rendering.
 */

/**
 * What a plan actually permits.
 *
 * These are enforced at the write paths that create the thing being limited, and nowhere
 * else. Nothing here filters a read: a workspace over its allowance keeps every site,
 * key and record it already has, and keeps them visible. For a system that holds incident
 * and permit history, a billing state that hides safety records is worse than an unpaid
 * invoice, and a plan change must never look like data loss.
 *
 * The two axes are the ones PILOT_PRICING_NOTES.md argues for: sites, because they drive
 * both the value and the support load far more than headcount does, and integrations,
 * because pushing data into a customer's own systems is the work that does not scale.
 * Scheduled report delivery is deliberately NOT an axis - email costs almost nothing and
 * removes manual work on both sides, so every tier gets it.
 *
 * All of this is provisional until the pilot produces evidence. Changing the shape of the
 * offer means editing this object; it should not mean editing anything else.
 */
export interface PlanEntitlements {
  /** Active sites the workspace may operate. `null` is no limit. */
  maxSites: number | null
  /**
   * Whether the workspace may create API keys and webhooks.
   *
   * The boundary is wired and enforced, but the capability behind it is not finished:
   * nothing authenticates an issued `sk_live_` key, and no webhook has ever left the
   * server - `testWebhook` records a success without making a request, deliberately, and
   * no event dispatches one. So this gates a thing that does not work yet.
   *
   * It is kept because the boundary is right and cheap to hold now, and because moving it
   * later, after customers exist on both sides, is the expensive version. It is NOT a
   * reason to charge anyone the difference: sell Premium on sites until an API key opens
   * a door.
   */
  integrations: boolean
}

/** Grandfathered: everything, no limits. What legacy and unrecognised plans resolve to. */
const UNLIMITED: PlanEntitlements = { maxSites: null, integrations: true }

export interface Plan {
  key: string
  label: string
  /** Monthly price in whole Malaysian ringgit. */
  monthlyPriceMyr: number
  summary: string
  entitlements: PlanEntitlements
  /** Offered to new customers. Legacy plans stay resolvable but unsellable. */
  sellable: boolean
}

export const PLANS: Record<string, Plan> = {
  standard: {
    key: 'standard',
    label: 'Standard',
    monthlyPriceMyr: 10_000,
    summary: 'Every module and every user, across up to three sites. Incidents, '
      + 'investigations, corrective actions, permits, equipment, visitors, training, audits, '
      + 'contractors, and reports with scheduled email delivery.',
    entitlements: { maxSites: 3, integrations: false },
    sellable: true,
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    monthlyPriceMyr: 15_000,
    // Read by you in the provisioning console, not by a customer, so it says the awkward
    // half out loud.
    summary: 'Everything in Standard, with no limit on sites. API keys and webhooks are '
      + 'reserved to this plan but neither works yet — do not sell on them.',
    entitlements: { maxSites: null, integrations: true },
    sellable: true,
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise (legacy)',
    monthlyPriceMyr: 0,
    summary: 'Companies created before the plans existed. Priced outside the product, and '
      + 'not subject to plan limits.',
    entitlements: UNLIMITED,
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
 * edited by hand should render as "unknown plan" in the console, not take the page down -
 * and for the same reason it is granted everything rather than nothing. A typo made by
 * whoever edited the row is not a reason to start refusing that customer's writes.
 */
export function planFor(key: string): Plan {
  return PLANS[key] ?? {
    key,
    label: key || 'Unknown',
    monthlyPriceMyr: 0,
    summary: 'This plan is not one the product recognises.',
    entitlements: UNLIMITED,
    sellable: false,
  }
}

/** The entitlements for a stored plan key. Total: every key resolves to something. */
export function entitlementsFor(key: string): PlanEntitlements {
  return planFor(key).entitlements
}

/** "RM 10,000" - formatted once, so the console and any future invoice agree. */
export function formatMyr(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY')}`
}

/** Company lifecycle, kept as strings so adding one is not a migration. */
export const COMPANY_STATUSES = ['active', 'suspended'] as const
export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled'] as const
