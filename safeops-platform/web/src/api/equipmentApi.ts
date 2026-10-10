import { blob, request, upload } from './http'

/**
 * Calibration, equipment fitness, and the equipment named on a permit.
 *
 * Kept out of assets.ts because this is the side of equipment that a permit desk uses:
 * every response here carries a verdict and, when the verdict is no, the sentence that
 * explains it. The screens render that sentence; they never re-derive it.
 */

export type CalibrationResult = 'pass' | 'pass_with_adjustment' | 'fail'

export const CALIBRATION_RESULT_LABEL: Record<CalibrationResult, string> = {
  pass: 'Pass',
  pass_with_adjustment: 'Pass With Adjustment',
  fail: 'Fail',
}

export interface Calibration {
  id: string
  assetId: string
  calibratedAt: string
  certificateNumber: string
  vendor: string
  expiresAt: string
  result: CalibrationResult
  remarks: string | null
  recordedBy: string
  createdAt: string
  expired: boolean
  daysToExpiry: number | null
}

export type FitnessCode =
  | 'ok' | 'out_of_service' | 'under_maintenance' | 'retired' | 'disposed'
  | 'inspection_overdue' | 'calibration_missing' | 'calibration_expired'

export interface EquipmentFitness {
  fit: boolean
  code: FitnessCode
  /** Null when fit; a sentence naming the item and the problem otherwise. */
  reason: string | null
  inspectionDue: string | null
  daysToInspection: number | null
  calibrationRequired: boolean
  calibrationExpiry: string | null
  daysToCalibration: number | null
  certificateNumber: string | null
}

/** Equipment booked onto a permit, with its verdict as of this read. */
export interface PermitEquipmentRow {
  id: string
  assetId: string
  code: string
  name: string
  category: string
  serialNumber: string
  critical: boolean
  purpose: string
  addedBy: string
  addedAt: string
  fit: boolean
  blockedReason: string | null
  calibrationExpiry: string | null
  certificateNumber: string | null
  inspectionDue: string | null
}

/** A candidate for the picker. Unfit items are included, with their reason. */
export interface SelectableEquipment {
  id: string
  code: string
  name: string
  category: string
  serialNumber: string
  location: string | null
  critical: boolean
  alreadyBooked: boolean
  fit: boolean
  blockedReason: string | null
  calibrationExpiry: string | null
  inspectionDue: string | null
}

export type MaintenanceKind = 'preventive' | 'corrective' | 'emergency'
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical'
export type MaintenanceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export const MAINTENANCE_KIND_LABEL: Record<MaintenanceKind, string> = {
  preventive: 'Preventive',
  corrective: 'Corrective',
  emergency: 'Emergency',
}

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export interface WorkOrder {
  id: string
  code: string
  assetId: string
  kind: MaintenanceKind
  priority: MaintenancePriority
  description: string
  assignedTo: string
  dueAt: string | null
  startedAt: string | null
  finishedAt: string | null
  downtimeMinutes: number
  /** Ringgit. The server holds sen as an integer and divides on the way out. */
  cost: number
  partsUsed: string
  status: MaintenanceStatus
  raisedBy: string
  raisedAt: string
  closedBy: string | null
  closingNote: string | null
  /** Derived server-side against today, never stored. */
  overdue: boolean
}

export type AssetEventKind =
  | 'created' | 'assigned' | 'inspection' | 'calibration'
  | 'maintenance' | 'incident' | 'status_change' | 'permit'

export interface AssetEvent {
  id: string
  kind: AssetEventKind
  summary: string
  detail: string | null
  actor: string
  actorRole: string
  at: string
  refType: string | null
  refId: string | null
}

/** Equipment named on an incident. */
export interface IncidentEquipmentRow {
  id: string
  assetId: string
  code: string
  name: string
  category: string
  serialNumber: string
  critical: boolean
  status: string
  involvement: string
  addedBy: string
  addedAt: string
  fit: boolean
  blockedReason: string | null
}

/** Incidents an item has been involved in, shown on its profile. */
export interface AssetIncidentRow {
  id: string
  involvement: string
  incidentId: string
  number: string
  title: string
  severity: string
  stage: string
  occurredAt: string
}

export interface AssetDocumentRow {
  id: string
  name: string
  kind: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string | null
  createdAt: string
  /** False for rows predating real storage: shown, but with nothing to fetch. */
  hasFile: boolean
  isImage: boolean
}

export interface AssetHolder {
  kind: 'employee' | 'contractor'
  id: string
  name: string
  reference: string
  detail: string
  active: boolean
}

export interface AssetCurrentPermit {
  linkId: string
  purpose: string
  permitId: string
  code: string
  title: string
  status: string
  type: string
  location: string
  validTo: string
}

export interface EquipmentDashboard {
  total: number
  critical: number
  outOfService: number
  underMaintenance: number
  inspectionDueToday: number
  inspectionOverdue: number
  calibrationDue: number
  calibrationExpired: number
  maintenanceOpen: number
  maintenanceOverdue: number
  /** In service with nothing overdue — the number an issuer can actually use. */
  available: number
  byCategory: { name: string; value: number }[]
  bySite: { name: string; value: number }[]
  bookedToPermit: number
  retired: number
  newest: { id: string; code: string; name: string; category: string; at: string }[]
  upcomingWorkOrders: {
    id: string; code: string; kind: string; priority: string
    dueAt: string | null; description: string; assetCode: string; assetName: string
  }[]
  recentInspections: {
    id: string; code: string; outcome: string | null
    at: string | null; by: string | null; assetCode: string; assetName: string
  }[]
  recentMaintenance: {
    id: string; code: string; kind: string; status: string
    at: string; description: string; assetCode: string; assetName: string
  }[]
}

export const equipmentApi = {
  dashboard(companyId: string, siteId?: string): Promise<EquipmentDashboard> {
    const q = new URLSearchParams({ companyId })
    if (siteId) q.set('siteId', siteId)
    return request(`/equipment/dashboard?${q.toString()}`)
  },

  listCalibrations(assetId: string): Promise<Calibration[]> {
    return request(`/assets/${assetId}/calibrations`)
  },

  recordCalibration(assetId: string, input: {
    calibratedAt: string
    expiresAt: string
    certificateNumber: string
    vendor?: string
    result?: CalibrationResult
    remarks?: string
  }): Promise<Calibration> {
    return request(`/assets/${assetId}/calibrations`, { method: 'POST', body: JSON.stringify(input) })
  },

  fitness(assetId: string): Promise<EquipmentFitness> {
    return request(`/assets/${assetId}/fitness`)
  },

  listForPermit(permitId: string): Promise<PermitEquipmentRow[]> {
    return request(`/permits/${permitId}/equipment`)
  },

  /** Everything that could be booked, blocked items included with their reason. */
  selectable(permitId: string): Promise<SelectableEquipment[]> {
    return request(`/permits/${permitId}/equipment/selectable`)
  },

  addToPermit(permitId: string, assetId: string, purpose?: string): Promise<{ id: string }> {
    return request(`/permits/${permitId}/equipment`, {
      method: 'POST', body: JSON.stringify({ assetId, purpose }),
    })
  },

  removeFromPermit(linkId: string): Promise<void> {
    return request(`/permits/equipment/${linkId}`, { method: 'DELETE' })
  },

  // -- Timeline --------------------------------------------------------------

  timeline(assetId: string): Promise<AssetEvent[]> {
    return request(`/assets/${assetId}/timeline`)
  },

  incidentsForAsset(assetId: string): Promise<AssetIncidentRow[]> {
    return request(`/assets/${assetId}/incidents`)
  },

  // -- Maintenance -----------------------------------------------------------

  listWorkOrders(assetId: string): Promise<WorkOrder[]> {
    return request(`/assets/${assetId}/work-orders`)
  },

  raiseWorkOrder(assetId: string, input: {
    kind: MaintenanceKind
    priority?: MaintenancePriority
    description: string
    assignedTo?: string
    dueAt?: string
    takeOutOfService?: boolean
  }): Promise<WorkOrder> {
    return request(`/assets/${assetId}/work-orders`, { method: 'POST', body: JSON.stringify(input) })
  },

  updateWorkOrder(workOrderId: string, input: {
    status?: MaintenanceStatus
    assignedTo?: string
    priority?: MaintenancePriority
    downtimeMinutes?: number
    cost?: number
    partsUsed?: string
    closingNote?: string
    returnToService?: boolean
  }): Promise<WorkOrder> {
    return request(`/work-orders/${workOrderId}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  // -- Incident link ---------------------------------------------------------

  listForIncident(incidentId: string): Promise<IncidentEquipmentRow[]> {
    return request(`/incidents/${incidentId}/equipment`)
  },

  linkToIncident(incidentId: string, assetId: string, involvement?: string): Promise<{ id: string }> {
    return request(`/incidents/${incidentId}/equipment`, {
      method: 'POST', body: JSON.stringify({ assetId, involvement }),
    })
  },

  unlinkFromIncident(linkId: string): Promise<void> {
    return request(`/incidents/equipment/${linkId}`, { method: 'DELETE' })
  },

  // -- Register --------------------------------------------------------------

  update(assetId: string, input: {
    name?: string
    manufacturer?: string
    model?: string
    serialNumber?: string
    department?: string
    location?: string
    owner?: string
    notes?: string
    critical?: boolean
    requiresCalibration?: boolean
    purchaseDate?: string | null
    commissionDate?: string | null
    warrantyUntil?: string | null
    assignedEmployeeId?: string | null
    assignedContractorWorkerId?: string | null
  }): Promise<unknown> {
    return request(`/assets/${assetId}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  holder(assetId: string): Promise<AssetHolder | null> {
    return request(`/assets/${assetId}/holder`)
  },

  currentPermit(assetId: string): Promise<AssetCurrentPermit | null> {
    return request(`/assets/${assetId}/current-permit`)
  },

  // -- Documents and photos --------------------------------------------------

  listDocuments(assetId: string): Promise<AssetDocumentRow[]> {
    return request<{ rows: AssetDocumentRow[] }>(`/assets/${assetId}/documents`).then((r) => r.rows)
  },

  /**
   * Upload with real progress.
   *
   * XHR rather than fetch, for the same reason as permit attachments: fetch still cannot
   * report upload progress, and a 10 MB photo over site wifi with no progress bar looks
   * like a hung screen. Same endpoint contract, same allow-list, enforced server-side.
   */
  uploadDocuments(
    assetId: string,
    files: File[],
    kind: 'photo' | 'manual' | 'certificate' | 'other',
    onProgress?: (percent: number) => void,
  ): Promise<AssetDocumentRow[]> {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    form.append('kind', kind)
    return upload<{ rows: AssetDocumentRow[] }>(
      `/assets/${assetId}/documents`, form, onProgress,
    ).then((r) => r.rows)
  },

  /**
   * Fetched as a blob rather than linked.
   *
   * The endpoint needs an Authorization header and re-checks membership, so a stored
   * filename grants nothing. The caller builds an object URL from this for thumbnails and
   * previews, which also keeps a crafted file out of the app's own origin.
   */
  documentBlob(documentId: string): Promise<Blob> {
    return blob(`/assets/documents/${documentId}`)
  },

  deleteDocument(documentId: string): Promise<void> {
    return request(`/assets/documents/${documentId}`, { method: 'DELETE' })
  },
}
