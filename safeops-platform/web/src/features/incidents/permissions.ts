import type { Role } from '@/api/types'

/**
 * Who may record an investigation: its findings, the people involved and the equipment
 * it touched. Mirrors WRITE_ROLES in api/src/lib/incidentInvestigation.ts, which is what
 * decides; this only stops the page offering a form the server will refuse.
 *
 * It used to offer it to everyone. An Executive or an Employee could type a direct cause
 * into an editable field, and the save on leaving it came back "Your role does not permit
 * recording an investigation" - after the typing was done.
 */
const INVESTIGATE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

export const canRecordInvestigation = (role: Role | null | undefined) => !!role && INVESTIGATE_ROLES.includes(role)
