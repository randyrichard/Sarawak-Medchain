import { request, qs } from './http'

/**
 * The investigation half of incident management.
 *
 * Separate from incidentsApi because it spans four registers - workforce, contractors,
 * visitors and equipment - and because the blockers endpoint exists purely to explain
 * refusals. Every sentence it returns is the server's own and is rendered as-is.
 */

export type IncidentPersonRole = 'witness' | 'injured' | 'involved' | 'first_aider'

export const PERSON_ROLE_LABEL: Record<IncidentPersonRole, string> = {
  witness: 'Witness',
  injured: 'Injured Person',
  involved: 'Involved',
  first_aider: 'First Aider',
}

export type IncidentLinkKind =
  | 'permit' | 'employee' | 'contractor' | 'contractor_worker' | 'visitor' | 'asset'

export const LINK_KIND_LABEL: Record<IncidentLinkKind, string> = {
  permit: 'Permit',
  employee: 'Employee',
  contractor: 'Contractor Company',
  contractor_worker: 'Contractor Worker',
  visitor: 'Visitor',
  asset: 'Equipment',
}

export interface IncidentPerson {
  id: string
  role: IncidentPersonRole
  roleLabel: string
  employeeId: string | null
  contractorWorkerId: string | null
  visitorId: string | null
  name: string
  company: string
  injuryType: string | null
  bodyPart: string | null
  treatment: string | null
  daysLost: number | null
  statement: string | null
  addedBy: string
  addedAt: string
  /** Which register they came from, or 'external' for somebody in none. */
  source: 'employee' | 'contractor' | 'visitor' | 'external'
}

export interface IncidentLinkRow {
  id: string
  kind: IncidentLinkKind
  kindLabel: string
  targetId: string
  targetCode: string
  targetLabel: string
  note: string | null
  addedBy: string
  addedAt: string
  href: string
}

export interface Investigation {
  leadInvestigator: string | null
  investigationTeam: string
  investigationStartedAt: string | null
  investigationCompletedAt: string | null
  directCause: string | null
  underlyingCause: string | null
  rootCause: string | null
  contributingFactors: string | null
  recommendations: string | null
  fishbone: Record<string, string[]> | null
  /** Obliged by severity, whatever anyone thinks of the event. */
  mandatory: boolean
  /** The server's sentences. Rendered as-is, never re-derived. */
  blockers: string[]
}

export interface Classification<T extends string = string> {
  value: T
  label: string
  /** Kept for existing rows; not offered on new reports. */
  legacy?: boolean
  hint?: string
}

export interface IncidentCatalog {
  types: Classification[]
  severities: Classification[]
  shifts: string[]
  weather: string[]
}

export interface IncidentBoard {
  openIncidents: number
  overdueCapas: number
  lostTime: number
  nearMisses: number
  thisMonth: number
  openInvestigations: number
  total: number
  bySeverity: { name: string; value: number }[]
  byType: { name: string; value: number }[]
  byDepartment: { name: string; value: number }[]
  bySite: { name: string; value: number }[]
  topRootCauses: { name: string; value: number }[]
}

export interface LinkedIncident {
  linkId: string
  id: string
  number: string
  title: string
  severity: string
  type: string
  stage: string
  occurredAt: string
  note: string | null
}

export const investigationApi = {
  catalog(): Promise<IncidentCatalog> {
    return request('/incidents/catalog')
  },

  board(companyId: string, siteId?: string): Promise<IncidentBoard> {
    return request(`/incidents/board?${qs({ companyId, siteId })}`)
  },

  /** The reverse question: what has gone wrong around this permit, contractor, visitor. */
  incidentsFor(companyId: string, kind: IncidentLinkKind, targetId: string): Promise<LinkedIncident[]> {
    return request(`/incidents/linked/${kind}/${targetId}?${qs({ companyId })}`)
  },

  // -- People ----------------------------------------------------------------

  listPeople(incidentId: string): Promise<IncidentPerson[]> {
    return request<{ rows: IncidentPerson[] }>(`/incidents/${incidentId}/people`).then((r) => r.rows)
  },

  addPerson(incidentId: string, input: {
    role: IncidentPersonRole
    employeeId?: string
    contractorWorkerId?: string
    visitorId?: string
    name?: string
    company?: string
    injuryType?: string
    bodyPart?: string
    treatment?: string
    daysLost?: number
    statement?: string
  }): Promise<IncidentPerson> {
    return request(`/incidents/${incidentId}/people`, { method: 'POST', body: JSON.stringify(input) })
  },

  updatePerson(personId: string, input: {
    statement?: string
    injuryType?: string
    bodyPart?: string
    treatment?: string
    daysLost?: number
  }): Promise<IncidentPerson> {
    return request(`/incidents/people/${personId}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  removePerson(personId: string): Promise<void> {
    return request(`/incidents/people/${personId}`, { method: 'DELETE' })
  },

  // -- Related records -------------------------------------------------------

  listLinks(incidentId: string): Promise<IncidentLinkRow[]> {
    return request<{ rows: IncidentLinkRow[] }>(`/incidents/${incidentId}/links`).then((r) => r.rows)
  },

  addLink(incidentId: string, input: {
    kind: IncidentLinkKind
    targetId: string
    note?: string
  }): Promise<IncidentLinkRow> {
    return request(`/incidents/${incidentId}/links`, { method: 'POST', body: JSON.stringify(input) })
  },

  removeLink(linkId: string): Promise<void> {
    return request(`/incidents/links/${linkId}`, { method: 'DELETE' })
  },

  // -- The investigation -----------------------------------------------------

  get(incidentId: string): Promise<Investigation> {
    return request(`/incidents/${incidentId}/investigation`)
  },

  save(incidentId: string, input: {
    leadInvestigator?: string
    investigationTeam?: string
    directCause?: string
    underlyingCause?: string
    rootCause?: string
    contributingFactors?: string
    recommendations?: string
    fishbone?: Record<string, string[]>
  }): Promise<unknown> {
    return request(`/incidents/${incidentId}/investigation`, {
      method: 'PUT', body: JSON.stringify(input),
    })
  },

  complete(incidentId: string): Promise<unknown> {
    return request(`/incidents/${incidentId}/investigation/complete`, {
      method: 'POST', body: JSON.stringify({}),
    })
  },
}
