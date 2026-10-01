// ─── Domain types ────────────────────────────────────────────────────────────
// Mirrors the PRD data model (§13/§14). The mock adapter and the future real
// API both implement these shapes — UI code never knows which one it talks to.

export type Role = 'ceo' | 'admin' | 'hse_manager' | 'safety_officer' | 'supervisor' | 'employee'

export const ROLE_LABEL: Record<Role, string> = {
  ceo: 'CEO',
  admin: 'Admin',
  hse_manager: 'HSE Manager',
  safety_officer: 'Safety Officer',
  supervisor: 'Supervisor',
  employee: 'Employee',
}

/**
 * What the workspace's plan permits, as decided by the server.
 *
 * The client never works this out for itself. Branch on these, not on `plan`: a component
 * that asks `plan === 'premium'` breaks silently the day a plan is renamed or a third one
 * appears, and it puts the commercial rules in two places that can disagree. Asking what
 * the workspace may do keeps the server the only thing that decides.
 *
 * These are for showing the right thing - a disabled button with a reason beats a button
 * that fails on click. They are not the enforcement; that is on the API, which refuses the
 * write whatever the browser believes.
 */
export interface PlanEntitlements {
  /** Active sites this workspace may run. `null` is no limit. */
  maxSites: number | null
  /** Whether API keys and webhooks may be created. */
  integrations: boolean
}

export interface Company {
  id: string
  name: string
  industry: string
  /**
   * The plan key as stored, for display.
   *
   * Deliberately a string. This was `'trial' | 'standard' | 'enterprise'` - a union that
   * had never included `premium` and did include `trial`, which is a subscription status
   * and not a plan at all. The server stores this as free text on purpose, so that rows
   * created before a plan existed keep the value they were given; a closed union here
   * could only ever be a copy of that list, drifting.
   */
  plan: string
  entitlements: PlanEntitlements
  logoInitials: string
}

export interface Site {
  id: string
  companyId: string
  name: string
  short: string
  city: string
  timezone: string
  headcount: number
}

export interface Department {
  id: string
  siteId: string
  name: string
}

export interface Team {
  id: string
  departmentId: string
  name: string
  lead: string
}

export interface Employee {
  id: string
  companyId: string
  siteId: string
  departmentId: string
  teamId?: string
  name: string
  position: string
  email?: string
}

/** A user's role within one company, optionally limited to specific sites. */
export interface Membership {
  companyId: string
  role: Role
  /** empty array = all sites in the company */
  siteIds: string[]
}

export interface User {
  id: string
  email: string
  name: string
  title: string
  memberships: Membership[]
  /** users must change password at next login when set (future: forced rotation) */
  mustChangePassword?: boolean
  /**
   * A workspace requires multi-factor sign-in and this person has not set it up. The API
   * refuses everything but the setup until they do; the app shows only the setup screen.
   */
  mfaSetupRequired?: boolean
}

export interface Session {
  token: string
  userId: string
  /** epoch ms */
  expiresAt: number
}

export type NotificationKind = 'incident' | 'action' | 'audit' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  createdAt: string
  readAt: string | null
  href?: string
}

export interface ActivityEvent {
  id: string
  actor: string
  verb: string
  target: string
  at: string
}

// ─── API error contract ──────────────────────────────────────────────────────

export class ApiError extends Error {
  /**
   * The server's error code, or one the HTTP client raised itself.
   *
   * A string, not a union, because the value comes straight off the response body and the
   * server's set is larger than any list kept here stayed. The union this replaces named
   * ten codes and had already fallen five behind — `plan_limit`, `invalid_password`,
   * `expired_refresh`, `invalid_refresh` and `refresh_reuse` all reach this constructor
   * and none of them were in it. Nothing in the app branches on this today; everything
   * displays `message`. When something does need to branch, comparing against a literal
   * works on a string, and the compiler will not be quietly wrong about which ones exist.
   *
   * Raised by the client rather than the server: `network`, `unauthenticated`,
   * `request_failed`, and `misconfigured` (no API configured, so nothing can be trusted).
   */
  constructor(public code: string, message: string) {
    super(message)
  }
}
