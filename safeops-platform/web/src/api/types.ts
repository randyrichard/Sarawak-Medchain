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

export interface Company {
  id: string
  name: string
  industry: string
  plan: 'trial' | 'standard' | 'enterprise'
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
  constructor(
    public code: 'invalid_credentials' | 'invalid_token' | 'expired_token' | 'not_found' | 'forbidden' | 'validation',
    message: string,
  ) {
    super(message)
  }
}
