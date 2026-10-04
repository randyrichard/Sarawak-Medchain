import type { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { validatePasswordStrength } from './password.js'

/**
 * The Authentication Policy page, enforced.
 *
 * Each company sets its own policy (`SecurityPolicy`), but a password, a lockout and a
 * session belong to a person, and one person can belong to several companies. The rule is
 * the one the MFA requirement already follows: **every policy that applies to you applies
 * in full, so the strictest value of each setting wins.** Being in a strict company and a
 * lax one must not make you lax anywhere.
 *
 * The server's own rules stay a floor. The policy can make them stricter, never weaker:
 * 12 characters with an uppercase letter, a lowercase letter and a number are always
 * required (`validatePasswordStrength`), so a stored minimum of 10 still means 12.
 *
 * Only companies whose workspace is active count, as for sessions: a suspended workspace
 * gives no access, so it does not set the rules either. A company that has never saved a
 * policy gets the defaults the page shows it (the schema defaults below).
 */
export interface EffectivePolicy {
  minLength: number
  requireUppercase: boolean
  requireNumber: boolean
  requireSymbol: boolean
  /** Null when passwords never expire. */
  expiryDays: number | null
  lockoutThreshold: number
  sessionTimeoutHours: number
}

/** What a stored policy holds. Matches `SecurityPolicy` in schema.prisma. */
export interface StoredPolicy {
  passwordMinLength: number
  requireUppercase: boolean
  requireNumber: boolean
  requireSymbol: boolean
  passwordExpiryDays: number
  lockoutThreshold: number
  sessionTimeoutHours: number
}

/** The schema defaults: what a company that never saved a policy is shown, and gets. */
export const DEFAULT_POLICY: StoredPolicy = {
  passwordMinLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: false,
  passwordExpiryDays: 90, lockoutThreshold: 5, sessionTimeoutHours: 12,
}

/** The server's own rules, before any company makes them stricter. */
export const BASELINE: EffectivePolicy = {
  minLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: false,
  expiryDays: null, lockoutThreshold: env.MAX_FAILED_LOGINS,
  sessionTimeoutHours: env.REFRESH_TOKEN_TTL_DAYS * 24,
}

/** The strictest combination of the policies that apply, on top of the server's rules. */
export function strictest(policies: StoredPolicy[]): EffectivePolicy {
  const out = { ...BASELINE }
  for (const p of policies) {
    out.minLength = Math.max(out.minLength, p.passwordMinLength)
    out.requireUppercase ||= p.requireUppercase
    out.requireNumber ||= p.requireNumber
    out.requireSymbol ||= p.requireSymbol
    if (p.passwordExpiryDays > 0) out.expiryDays = Math.min(out.expiryDays ?? Infinity, p.passwordExpiryDays)
    out.lockoutThreshold = Math.min(out.lockoutThreshold, p.lockoutThreshold)
    out.sessionTimeoutHours = Math.min(out.sessionTimeoutHours, p.sessionTimeoutHours)
  }
  return out
}

/** Why a password does not meet the policy, in words for the person typing it; null if it does. */
export function passwordProblem(pw: string, policy: EffectivePolicy): string | null {
  const base = validatePasswordStrength(pw)
  if (base) return base
  if (pw.length < policy.minLength) return `Password must be at least ${policy.minLength} characters, as your organisation requires.`
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) return 'Password must include a symbol, such as ! or #, as your organisation requires.'
  return null
}

/** Whether a password set at `changedAt` has expired under the policy. */
export function passwordExpired(changedAt: Date, policy: EffectivePolicy, now = new Date()): boolean {
  return policy.expiryDays !== null && now.getTime() - changedAt.getTime() >= policy.expiryDays * 86_400_000
}

/** The latest a session started at `startedAt` may last, however often it is refreshed. */
export function sessionEnd(startedAt: Date, policy: EffectivePolicy): Date {
  return new Date(startedAt.getTime() + policy.sessionTimeoutHours * 3_600_000)
}

/**
 * The policy for one person: every active company they belong to, plus any they are about
 * to join (an invitation being accepted), combined strictly.
 */
export async function policyForUser(db: PrismaClient, userId: string, joining: string[] = []): Promise<EffectivePolicy> {
  const memberships = await db.membership.findMany({ where: { userId }, select: { companyId: true } })
  const ids = [...new Set([...memberships.map((m) => m.companyId), ...joining])]
  if (ids.length === 0) return BASELINE
  const active = await db.company.findMany({ where: { id: { in: ids }, status: 'active' }, select: { id: true } })
  if (active.length === 0) return BASELINE
  const stored = await db.securityPolicy.findMany({ where: { companyId: { in: active.map((c) => c.id) } } })
  const byCompany = new Map(stored.map((p) => [p.companyId, p]))
  return strictest(active.map((c) => byCompany.get(c.id) ?? DEFAULT_POLICY))
}
