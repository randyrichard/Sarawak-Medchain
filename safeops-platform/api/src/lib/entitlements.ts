import type { PrismaClient } from '@prisma/client'
import { planFor, type PlanEntitlements } from './planCatalog.js'

/**
 * Plan limits, checked against what a workspace actually holds.
 *
 * Two rules hold everywhere in here, and both matter more than the limits themselves:
 *
 * 1. Limits are checked when something is created, never when something is read. A
 *    workspace that is over its allowance - because it was downgraded, or because it was
 *    grandfathered in above the line - keeps everything it has and keeps it visible. The
 *    only thing refused is the next one. An HSE system that hides a site's incident
 *    history over a billing state has done something far worse than fail to collect.
 *
 * 2. Turning something off is always allowed. Deactivating a site or revoking a key is
 *    how a customer gets back under a limit, so those paths are never gated - a plan
 *    limit that traps a customer above it is a support ticket by construction.
 */

/** A limit, with what the workspace currently holds counted against it. */
export interface Allowance {
  plan: string
  planLabel: string
  /** null means no limit on this plan. */
  limit: number | null
  used: number
  atLimit: boolean
}

async function planOf(db: PrismaClient, companyId: string): Promise<{ key: string; ents: PlanEntitlements; label: string }> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { plan: true },
  })
  // A caller who reached here has already passed a membership check, so a missing company
  // is an inconsistency rather than an access attempt. Resolve it to the unknown-plan
  // placeholder, which grants everything, and let the write path fail on its own terms.
  const plan = planFor(company?.plan ?? '')
  return { key: plan.key, ents: plan.entitlements, label: plan.label }
}

/**
 * How many sites this workspace may run, and how many it runs now.
 *
 * Counts active sites only. A deactivated site keeps all of its history and stays in the
 * console, but it is not a location anyone is operating, so it does not consume the
 * allowance - which also gives a customer at the limit a way to open a new site without
 * calling anybody: retire the one that closed.
 */
export async function siteAllowance(db: PrismaClient, companyId: string): Promise<Allowance> {
  const { key, ents, label } = await planOf(db, companyId)
  const used = await db.site.count({ where: { companyId, active: true } })
  return {
    plan: key,
    planLabel: label,
    limit: ents.maxSites,
    used,
    atLimit: ents.maxSites !== null && used >= ents.maxSites,
  }
}

/** Whether this workspace may create API keys and webhooks, and the plan that decides. */
export async function integrationAllowance(
  db: PrismaClient, companyId: string,
): Promise<{ allowed: boolean; planLabel: string }> {
  const { ents, label } = await planOf(db, companyId)
  return { allowed: ents.integrations, planLabel: label }
}

/**
 * What a customer is told when a limit stops them.
 *
 * Written here rather than at each call site so the wording cannot drift between the two
 * places it appears - the API's refusal and the button the console disables. It names the
 * plan, the number, and the way out, because "forbidden" tells an administrator nothing
 * they can act on.
 */
export function siteLimitMessage(a: Allowance): string {
  return `The ${a.planLabel} plan includes ${a.limit} active `
    + `${a.limit === 1 ? 'site' : 'sites'}, and this workspace has ${a.used}. `
    + 'Deactivate a site you no longer operate, or move to Premium for unlimited sites.'
}

export function integrationsMessage(planLabel: string, thing: 'API keys' | 'Webhooks'): string {
  return `${thing} are part of the Premium plan. This workspace is on ${planLabel}. `
    + 'Existing integrations keep working; only creating a new one is unavailable.'
}
