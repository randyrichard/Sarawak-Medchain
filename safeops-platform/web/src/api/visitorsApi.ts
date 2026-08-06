import { request, qs } from './http'

/**
 * Visitor management.
 *
 * Every response carries the server's own sentences - what is outstanding before the gate,
 * why entry was refused - and the screens render them as-is. Nothing here re-derives a
 * decision the server has already made.
 */

export type VisitorStatus =
  | 'draft' | 'pre_registered' | 'waiting' | 'checked_in' | 'on_site'
  | 'checked_out' | 'expired' | 'denied' | 'blacklisted' | 'cancelled'

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  draft: 'Draft',
  pre_registered: 'Pre-registered',
  waiting: 'Waiting at reception',
  checked_in: 'Checked in',
  on_site: 'On site',
  checked_out: 'Checked out',
  expired: 'Expired',
  denied: 'Denied',
  blacklisted: 'Blacklisted',
  cancelled: 'Cancelled',
}

/** Badge tone per status, so the register reads at a glance. */
export const VISITOR_STATUS_TONE: Record<VisitorStatus, 'neutral' | 'accent' | 'good' | 'warning' | 'critical'> = {
  draft: 'neutral',
  pre_registered: 'accent',
  waiting: 'warning',
  checked_in: 'good',
  on_site: 'good',
  checked_out: 'neutral',
  expired: 'neutral',
  denied: 'critical',
  blacklisted: 'critical',
  cancelled: 'neutral',
}

export type AcknowledgementKey =
  | 'inductionAt' | 'ndaAt' | 'safetyBriefingAt' | 'emergencyProcedureAt' | 'siteRulesAt'

export interface Acknowledgement {
  key: AcknowledgementKey
  label: string
  at: string | null
}

export interface Visitor {
  id: string
  code: string
  companyId: string
  siteId: string
  name: string
  idNumber: string
  nationality: string
  visitorCompany: string
  phone: string
  email: string
  vehicleNumber: string
  hostEmployeeId: string | null
  hostNameAtBooking: string
  departmentId: string | null
  purpose: string
  expectedArrival: string
  expectedDeparture: string
  checkedInAt: string | null
  checkedOutAt: string | null
  status: VisitorStatus
  statusLabel: string
  badgeNumber: string | null
  badgeIssuedAt: string | null
  badgeReturnedAt: string | null
  /** The QR payload. Opaque, and separate from `code` so a pass can be reissued. */
  passKey: string
  notes: string | null
  emergencyContactName: string
  emergencyContactPhone: string
  approvedBy: string | null
  approvedAt: string | null
  rejectedBy: string | null
  rejectedAt: string | null
  decisionNote: string | null
  deniedReason: string | null
  createdBy: string
  createdAt: string
  onSite: boolean
  durationMinutes: number | null
  durationLabel: string | null
  /** Minutes past the expected departure, while they are still inside. */
  overdueMinutes: number | null
  acknowledgements: Acknowledgement[]
  /** The server's sentences. Rendered as-is, never re-derived. */
  outstanding: string[]
}

export interface VisitorEvent {
  id: string
  kind: string
  summary: string
  detail: string | null
  actor: string
  actorRole: string
  at: string
}

export interface GateStatus {
  status: VisitorStatus
  /** Includes the blacklist, which the pure blocker function cannot see. */
  blockers: string[]
  acknowledgements: Acknowledgement[]
}

export interface BlacklistEntry {
  id: string
  companyId: string
  idNumber: string | null
  phone: string | null
  visitorCompany: string | null
  vehicleNumber: string | null
  reason: string
  expiresAt: string | null
  active: boolean
  addedBy: string
  addedAt: string
  liftedBy: string | null
  liftedAt: string | null
  inForce: boolean
  permanent: boolean
}

export interface VisitorDashboard {
  onSite: number
  expectedToday: number
  overdue: number
  checkedInToday: number
  deniedToday: number
  blacklistedToday: number
  /** Distinct vehicles, not visitors with a vehicle: four people share a van. */
  vehiclesOnSite: number
  badgesOut: number
  byCompany: { name: string; value: number }[]
  onSiteList: {
    id: string; code: string; name: string; visitorCompany: string
    vehicleNumber: string; badgeNumber: string | null; host: string
    checkedInAt: string | null; overdueMinutes: number | null
  }[]
}

export interface VisitorFilters {
  status?: VisitorStatus | 'all' | 'on_site' | 'today' | 'overdue'
  siteId?: string
  q?: string
  page?: number
  pageSize?: number
}

export const visitorsApi = {
  list(companyId: string, f: VisitorFilters = {}): Promise<{
    rows: Visitor[]; total: number; page: number; pageSize: number
  }> {
    return request(`/visitors?${qs({
      companyId,
      status: f.status,
      siteId: f.siteId,
      q: f.q,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 50,
    })}`)
  },

  get(id: string): Promise<Visitor> {
    return request(`/visitors/${id}`)
  },

  /** Resolve a scanned pass. Read-only; every mutation still needs a session. */
  byPass(passKey: string): Promise<Visitor> {
    return request(`/visitors/pass/${passKey}`)
  },

  create(input: {
    companyId: string
    siteId: string
    name: string
    idNumber: string
    nationality?: string
    visitorCompany?: string
    phone?: string
    email?: string
    vehicleNumber?: string
    hostEmployeeId?: string
    departmentId?: string
    purpose?: string
    expectedArrival: string
    expectedDeparture: string
    notes?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
  }): Promise<Visitor> {
    return request('/visitors', { method: 'POST', body: JSON.stringify(input) })
  },

  timeline(id: string): Promise<VisitorEvent[]> {
    return request(`/visitors/${id}/timeline`)
  },

  gate(id: string): Promise<GateStatus> {
    return request(`/visitors/${id}/gate`)
  },

  decide(id: string, approve: boolean, note?: string): Promise<Visitor> {
    return request(`/visitors/${id}/decision`, {
      method: 'POST', body: JSON.stringify({ approve, note }),
    })
  },

  acknowledge(id: string, key: AcknowledgementKey): Promise<Visitor> {
    return request(`/visitors/${id}/acknowledge`, {
      method: 'POST', body: JSON.stringify({ key }),
    })
  },

  checkIn(id: string, input: { badgeNumber?: string; vehicleNumber?: string } = {}): Promise<Visitor> {
    return request(`/visitors/${id}/check-in`, { method: 'POST', body: JSON.stringify(input) })
  },

  checkOut(id: string, badgeReturned?: boolean): Promise<Visitor> {
    return request(`/visitors/${id}/check-out`, {
      method: 'POST', body: JSON.stringify({ badgeReturned }),
    })
  },

  setBadge(id: string, badgeNumber: string | null): Promise<Visitor> {
    return request(`/visitors/${id}/badge`, {
      method: 'POST', body: JSON.stringify({ badgeNumber }),
    })
  },

  setVehicle(id: string, vehicleNumber: string | null): Promise<Visitor> {
    return request(`/visitors/${id}/vehicle`, {
      method: 'POST', body: JSON.stringify({ vehicleNumber }),
    })
  },

  addNote(id: string, note: string): Promise<Visitor> {
    return request(`/visitors/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) })
  },

  cancel(id: string, reason?: string): Promise<Visitor> {
    return request(`/visitors/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
  },

  dashboard(companyId: string, siteId?: string): Promise<VisitorDashboard> {
    return request(`/visitors/dashboard?${qs({ companyId, siteId })}`)
  },

  listBlacklist(companyId: string): Promise<BlacklistEntry[]> {
    return request<{ rows: BlacklistEntry[] }>(`/visitors/blacklist?${qs({ companyId })}`)
      .then((r) => r.rows)
  },

  addToBlacklist(input: {
    companyId: string
    idNumber?: string
    phone?: string
    visitorCompany?: string
    vehicleNumber?: string
    reason: string
    expiresAt?: string | null
  }): Promise<BlacklistEntry> {
    return request('/visitors/blacklist', { method: 'POST', body: JSON.stringify(input) })
  },

  liftBlacklist(id: string): Promise<BlacklistEntry> {
    return request(`/visitors/blacklist/${id}/lift`, { method: 'POST', body: JSON.stringify({}) })
  },
}
