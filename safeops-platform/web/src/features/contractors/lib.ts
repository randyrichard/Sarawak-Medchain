import type { ExpiryStatus } from '@/api/contractors'
import type { StatusKind } from '@/components/ui'
import type { Role } from '@/api/types'

/** Roles that may change the register. Mirrors WRITE_ROLES on the server. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager']

/**
 * Roles that may work the gate. Wider than write access on purpose — checking people in
 * is a supervisor's job at shift start, and a gate only an admin can open is a gate
 * nobody uses, which leaves the evacuation list wrong.
 */
const GATE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

export const canManageContractors = (role: Role | null) => !!role && WRITE_ROLES.includes(role)
export const canWorkGate = (role: Role | null) => !!role && GATE_ROLES.includes(role)

export const EXPIRY_KIND: Record<ExpiryStatus, StatusKind> = {
  valid: 'good',
  expiring: 'warning',
  expired: 'critical',
  // A missing contractor date is not merely a gap: it bars entry exactly as an expired
  // one does, so it is shown as a problem rather than as an absence.
  missing: 'critical',
}

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

/** Why the gate would turn this person away, or null when it would not. */
export function gateBlockReason(w: {
  active: boolean
  contractorSuspended: boolean
  medicalStatus: ExpiryStatus
  inductionStatus: ExpiryStatus
}): string | null {
  if (!w.active) return 'Deregistered'
  if (w.contractorSuspended) return 'Contractor suspended'
  if (w.medicalStatus === 'expired') return 'Medical expired'
  if (w.medicalStatus === 'missing') return 'No medical on file'
  if (w.inductionStatus === 'expired') return 'Induction expired'
  if (w.inductionStatus === 'missing') return 'No induction on file'
  return null
}
