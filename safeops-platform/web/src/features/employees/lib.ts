import type { MedicalStatus } from '@/api/employees'
import type { StatusKind } from '@/components/ui'
import type { Role } from '@/api/types'

/** Roles that may change the register. Mirrors WRITE_ROLES on the server. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager']

/**
 * The UI hides what the caller cannot do; the server refuses it regardless. Both exist
 * on purpose — the check here is courtesy, the one on the server is the boundary.
 */
export const canManageEmployees = (role: Role | null) => !!role && WRITE_ROLES.includes(role)

export const MEDICAL_KIND: Record<MedicalStatus, StatusKind> = {
  valid: 'good',
  expiring: 'warning',
  expired: 'critical',
  // Not an alarm — an absent medical is a gap in the record, not a failed one.
  missing: 'info',
}

/** "in 34 days", "12 days ago", "today" — the phrasing a supervisor reads at a glance. */
export function relativeDays(days: number | null): string {
  if (days === null) return '—'
  if (days === 0) return 'today'
  if (days < 0) return `${Math.abs(days)}d ago`
  return `in ${days}d`
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().slice(0, 10)
}
