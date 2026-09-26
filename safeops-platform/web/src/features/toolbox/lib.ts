import type { Role } from '@/api/types'

/*
 * Mirrors RECORD_ROLES and DELETE_ROLES in api/src/lib/toolboxService.ts. The server refuses
 * regardless; these only decide which buttons are offered.
 */
export const canRecordToolbox = (role: Role | null) =>
  !!role && ['admin', 'hse_manager', 'safety_officer', 'supervisor'].includes(role)

export const canDeleteToolbox = (role: Role | null) =>
  !!role && ['admin', 'hse_manager'].includes(role)

/** A Date as the value a `datetime-local` input expects, in the browser's own time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
