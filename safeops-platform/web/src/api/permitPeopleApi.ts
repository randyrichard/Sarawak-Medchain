import { request } from './http'

/**
 * The people named on a permit.
 *
 * Separate from permitsApi because it spans three registers — permits, employees and
 * contractor workers — and because the eligibility call is the one endpoint whose whole
 * purpose is to explain refusals.
 */

export type AttendeeRole = 'supervisor' | 'receiver' | 'worker' | 'standby' | 'gas_tester'

export const ATTENDEE_ROLE_LABEL: Record<AttendeeRole, string> = {
  supervisor: 'Supervisor',
  receiver: 'Permit receiver',
  worker: 'Worker',
  standby: 'Standby attendant',
  gas_tester: 'Gas tester',
}

export interface PermitAttendee {
  id: string
  role: AttendeeRole
  name: string
  kind: 'employee' | 'contractor'
  personId: string
  reference: string
  enteredAt: string | null
  exitedAt: string | null
  /** In the work area right now. What makes vessel occupancy answerable. */
  inside: boolean
}

export interface EligiblePerson {
  kind: 'employee' | 'contractor'
  id: string
  name: string
  reference: string
  detail: string
  alreadyNamed: boolean
  /** Null when they can be named; a sentence explaining why not otherwise. */
  blockedReason: string | null
}

export interface PermitExtension {
  id: string
  permitId: string
  previousValidTo: string
  newValidTo: string
  reason: string
  requestedBy: string
  requestedAt: string
  approvedBy: string | null
  approvedAt: string | null
  rejectedReason: string | null
}

export const permitPeopleApi = {
  list(permitId: string): Promise<PermitAttendee[]> {
    return request<{ rows: PermitAttendee[] }>(`/permits/${permitId}/people`).then((r) => r.rows)
  },

  /** Everyone who could be named, blocked ones included with their reason. */
  eligible(permitId: string): Promise<EligiblePerson[]> {
    return request<{ rows: EligiblePerson[] }>(`/permits/${permitId}/eligible`).then((r) => r.rows)
  },

  add(permitId: string, input: { employeeId?: string; contractorWorkerId?: string; role?: AttendeeRole }): Promise<PermitAttendee> {
    return request(`/permits/${permitId}/people`, { method: 'POST', body: JSON.stringify(input) })
  },

  remove(attendeeId: string): Promise<void> {
    return request(`/permits/people/${attendeeId}`, { method: 'DELETE' })
  },

  /** Sign someone in or out of the work area. */
  setInside(attendeeId: string, inside: boolean): Promise<PermitAttendee> {
    return request(`/permits/people/${attendeeId}/entry`, {
      method: 'POST', body: JSON.stringify({ inside }),
    })
  },

  listExtensions(permitId: string): Promise<PermitExtension[]> {
    return request<{ rows: PermitExtension[] }>(`/permits/${permitId}/extensions`).then((r) => r.rows)
  },

  requestExtension(permitId: string, newValidTo: string, reason: string): Promise<PermitExtension> {
    return request(`/permits/${permitId}/extensions`, {
      method: 'POST', body: JSON.stringify({ newValidTo, reason }),
    })
  },

  approveExtension(extensionId: string): Promise<unknown> {
    return request(`/permits/extensions/${extensionId}/approve`, {
      method: 'POST', body: JSON.stringify({}),
    })
  },
}
