import type { StatusKind } from '@/components/ui'
import type { PermitStatus, PermitType } from '@/api/permits'

export const PERMIT_STATUS_KIND: Record<PermitStatus, StatusKind> = {
  draft: 'info',
  submitted: 'warning',
  approved: 'info',
  active: 'good',
  suspended: 'critical',
  closed: 'info',
  rejected: 'critical',
  expired: 'critical',
}

/**
 * The colour for any status the server sends. The approval-chain stages are not in the map
 * above, so a permit with its supervisor or HSE reviewer had no colour at all; they wait for
 * a signature exactly as a submitted permit does.
 */
export const permitStatusKind = (status: string): StatusKind =>
  PERMIT_STATUS_KIND[status as PermitStatus]
  ?? (['supervisor_review', 'hse_review', 'area_authority'].includes(status) ? 'warning' : 'info')

/** Series tokens — permit type is an identity, not a status. */
export const PERMIT_TYPE_COLOR: Record<PermitType, string> = {
  hot_work: 'var(--s3)',
  confined_space: 'var(--s1)',
  working_at_height: 'var(--s5)',
  electrical_isolation: 'var(--s8)',
  excavation: 'var(--s2)',
  lifting_operation: 'var(--s4)',
  line_breaking: 'var(--s6)',
  radiography: 'var(--s7)',
}

export const canIssuePermits = (role: string | null) =>
  ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')

/**
 * Who may perform the safety steps on a permit: name or remove people, record gas tests,
 * place and release isolations. Mirrors FIELD_ROLES in the API's permitService.ts.
 */
export const canOperatePermits = (role: string | null) =>
  ['admin', 'hse_manager', 'safety_officer', 'supervisor'].includes(role ?? '')

/**
 * Who is shown the gas-test form. The operators, and employees - because the server also
 * accepts a reading from an employee the permit names as its gas tester, and that person
 * has to be able to reach the form. Anyone else on the employee role gets the server's
 * explanation. The executive role is read-only and never sees it.
 */
export const canRecordGasTests = (role: string | null) =>
  canOperatePermits(role) || role === 'employee'

/** "2h 40m left" / "expired 25m ago" — the number a supervisor actually reads. */
export function formatRemaining(hours: number): string {
  const mins = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`
  return hours >= 0 ? `${span} left` : `expired ${span} ago`
}

export function remainingTone(hours: number, status: PermitStatus): string {
  if (status === 'expired' || hours < 0) return 'var(--critical)'
  if (status !== 'active' && status !== 'approved') return 'var(--muted)'
  if (hours <= 1) return 'var(--critical)'
  if (hours <= 2) return 'var(--warning)'
  return 'var(--good)'
}

export const fmtWindow = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
