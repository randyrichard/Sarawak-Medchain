import { drainRows } from './paging'
import { request, qs } from './http'
import type {
  GasTest, IsolationPoint, NewPermitInput, PermitControl, PermitEvent, PermitFilters,
  PermitSignature, PermitStats, PermitStatus, PermitType, PermitView,
} from './permits'

/**
 * HTTP client for the permit-to-work vertical.
 *
 * Replaces the localStorage-backed PermitStore. Every safety rule the store enforced —
 * unconfirmed controls blocking issue, gas testing, isolation release before closure,
 * per-type validity limits, who may issue — now lives on the server, where it cannot be
 * edited from a browser console. Nothing here re-implements a rule; it only maps shapes.
 */

interface Page<T> {
  rows: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Server row shape. Optional columns arrive as null, not undefined. */
interface ServerPermit {
  id: string
  code: string
  companyId: string
  siteId: string
  type: PermitType
  title: string
  description: string
  department: string
  location: string
  applicant: string
  contractor: string | null
  workerCount: number
  validFrom: string
  validTo: string
  status: PermitStatus
  approver: string | null
  approvedAt: string | null
  rejectionReason: string | null
  suspendedReason: string | null
  closedBy: string | null
  closedAt: string | null
  handbackConfirmed: boolean
  linkedIncidentId: string | null
  version: number
  createdBy: string
  createdAt: string
  controls: {
    id: string; position: number; label: string; required: boolean; confirmed: boolean
    confirmedBy: string | null; confirmedAt: string | null; note: string | null
  }[]
  isolations: {
    id: string; description: string; tagId: string
    isolatedBy: string | null; isolatedAt: string | null
    removedBy: string | null; removedAt: string | null
  }[]
  gasTests: {
    id: string; testedAt: string; testedBy: string
    oxygenPct: number; lelPct: number; h2sPpm: number; coPpm: number
    pass: boolean; note: string | null
  }[]
  signatures: { id: string; role: PermitSignature['role']; name: string; signedAt: string; statement: string }[]
  timeline: { id: string; action: string; detail: string | null; actor: string; at: string }[]
  // Derived server-side so the board, the drawer and the print sheet all agree.
  hoursRemaining: number
  expiringSoon: boolean
  outstandingControls: number
  typeLabel: string
  statusLabel: string
}

/** Optional columns are null on the wire and optional in the UI types. */
const nu = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

export function toPermit(s: ServerPermit): PermitView {
  return {
    id: s.id,
    code: s.code,
    type: s.type,
    title: s.title,
    description: s.description,
    companyId: s.companyId,
    siteId: s.siteId,
    department: s.department,
    location: s.location,
    applicant: s.applicant,
    contractor: nu(s.contractor),
    workerCount: s.workerCount,
    validFrom: s.validFrom,
    validTo: s.validTo,
    status: s.status,
    controls: s.controls.map<PermitControl>((c) => ({
      id: c.id,
      label: c.label,
      required: c.required,
      confirmed: c.confirmed,
      confirmedBy: nu(c.confirmedBy),
      confirmedAt: nu(c.confirmedAt),
      note: nu(c.note),
    })),
    isolations: s.isolations.map<IsolationPoint>((i) => ({
      id: i.id,
      description: i.description,
      tagId: i.tagId,
      isolatedBy: nu(i.isolatedBy),
      isolatedAt: nu(i.isolatedAt),
      removedBy: nu(i.removedBy),
      removedAt: nu(i.removedAt),
    })),
    gasTests: s.gasTests.map<GasTest>((g) => ({
      id: g.id,
      testedAt: g.testedAt,
      testedBy: g.testedBy,
      oxygenPct: g.oxygenPct,
      lelPct: g.lelPct,
      h2sPpm: g.h2sPpm,
      coPpm: g.coPpm,
      pass: g.pass,
      note: nu(g.note),
    })),
    approver: nu(s.approver),
    approvedAt: nu(s.approvedAt),
    rejectionReason: nu(s.rejectionReason),
    suspendedReason: nu(s.suspendedReason),
    closedBy: nu(s.closedBy),
    closedAt: nu(s.closedAt),
    handbackConfirmed: s.handbackConfirmed,
    signatures: s.signatures.map<PermitSignature>((g) => ({
      role: g.role, name: g.name, signedAt: g.signedAt, statement: g.statement,
    })),
    timeline: s.timeline.map<PermitEvent>((e) => ({
      id: e.id, at: e.at, actor: e.actor, action: e.action, detail: nu(e.detail),
    })),
    linkedIncidentId: nu(s.linkedIncidentId),
    createdAt: s.createdAt,
    hoursRemaining: s.hoursRemaining,
    expiringSoon: s.expiringSoon,
    outstandingControls: s.outstandingControls,
    typeLabel: s.typeLabel,
    statusLabel: s.statusLabel,
  }
}

/** One entry in the expiry sweep — enough to raise a warning without a second fetch. */
export interface ExpiringPermit {
  id: string
  code: string
  type: PermitType
  typeLabel: string
  location: string
  applicant: string
  validTo: string
}

export const permitsApi = {
  /** One page, with the server's true total — the input `drain` needs. */
  async listPage(
    companyId: string, filters: PermitFilters = {}, page = 1, pageSize = 100,
  ): Promise<{ rows: PermitView[]; total: number }> {
    const data = await request<Page<ServerPermit>>(`/permits?${qs({
      companyId,
      q: filters.q,
      siteId: filters.siteId ?? undefined,
      type: filters.type || undefined,
      status: filters.status,
      page,
      pageSize,
    })}`)
    return { rows: data.rows.map(toPermit), total: data.total }
  },

  /** Every permit matching the filter, not just the first page. See `paging.ts`. */
  async list(companyId: string, filters: PermitFilters = {}): Promise<PermitView[]> {
    return drainRows((page, pageSize) => this.listPage(companyId, filters, page, pageSize))
  },

  async get(id: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}`))
  },

  async stats(companyId: string, siteId?: string | null): Promise<PermitStats> {
    return request<PermitStats>(`/permits/stats?${qs({ companyId, siteId: siteId ?? undefined })}`)
  },

  async expiring(companyId: string) {
    return request<{ warning: ExpiringPermit[]; expired: ExpiringPermit[] }>(
      `/permits/expiring?${qs({ companyId })}`,
    )
  },

  async create(input: NewPermitInput): Promise<PermitView> {
    return toPermit(await request<ServerPermit>('/permits', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async submit(id: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/submit`, { method: 'POST' }))
  },

  async approve(id: string, statement: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/approve`, {
      method: 'POST', body: JSON.stringify({ statement }),
    }))
  },

  async reject(id: string, reason: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }))
  },

  async activate(id: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/activate`, { method: 'POST' }))
  },

  async suspend(id: string, reason: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }))
  },

  async resume(id: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/resume`, { method: 'POST' }))
  },

  async close(id: string, input: { handbackConfirmed: boolean; statement: string }): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${id}/close`, {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async confirmControl(permitId: string, controlId: string, confirmed: boolean): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${permitId}/controls/${controlId}`, {
      method: 'PATCH', body: JSON.stringify({ confirmed }),
    }))
  },

  async addGasTest(
    permitId: string,
    reading: Omit<GasTest, 'id' | 'testedAt' | 'testedBy' | 'pass'>,
  ): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${permitId}/gas-tests`, {
      method: 'POST', body: JSON.stringify(reading),
    }))
  },

  async addIsolation(
    permitId: string,
    input: Pick<IsolationPoint, 'description' | 'tagId'>,
  ): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(`/permits/${permitId}/isolations`, {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async releaseIsolation(permitId: string, isolationId: string): Promise<PermitView> {
    return toPermit(await request<ServerPermit>(
      `/permits/${permitId}/isolations/${isolationId}/release`, { method: 'POST' },
    ))
  },
}
