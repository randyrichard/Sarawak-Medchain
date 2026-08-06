import { drainRows } from './paging'
import { request, qs } from './http'
import type {
  Asset, AssetCategory, AssetFilters, AssetStats, AssetStatus, AssetView, ChecklistAnswer,
  CompleteInspectionInput, InspectionFilters, InspectionFrequency, InspectionStatus,
  InspectionView, NewAssetInput,
} from './assets'
import type { ChecklistItem } from './assets'
import type { CapaItem } from './capa'

/**
 * HTTP client for the asset & inspection vertical.
 *
 * Replaces the browser-storage store. Health scoring, checklist validation and the
 * auto-raising of defect actions all happen on the server now; this file only maps
 * between the wire shape and what the screens already render.
 */

interface Page<T> {
  rows: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** The server speaks snake_case enums; the screens render the labels below. */
const STATUS_FROM_SERVER: Record<string, AssetStatus> = {
  in_service: 'In Service',
  under_maintenance: 'Under Maintenance',
  out_of_service: 'Out of Service',
  retired: 'Retired',
}
const STATUS_TO_SERVER: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_FROM_SERVER).map(([k, v]) => [v, k]),
)

const INSPECTION_STATUS: Record<string, InspectionStatus> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

interface ServerAsset {
  id: string
  code: string
  qrKey: string
  companyId: string
  siteId: string
  name: string
  category: AssetCategory
  customCategory: string | null
  serialNumber: string
  manufacturer: string
  model: string
  purchaseDate: string | null
  commissionDate: string | null
  warrantyUntil: string | null
  department: string
  owner: string
  location: string
  status: string
  frequency: InspectionFrequency
  lastInspectedAt: string | null
  nextDueDate: string
  documents: { id: string; name: string; kind: string }[]
  // Derived server-side.
  health: number
  risk: 'Low' | 'Medium' | 'High'
  openDefects: number
  overdue: boolean
  daysToDue: number
  lastOutcome?: 'passed' | 'failed'
  healthFactors: { label: string; delta: number }[]
  categoryLabel: string
}

interface ServerInspection {
  id: string
  code: string
  assetId: string
  companyId: string
  siteId: string
  scheduledFor: string
  assignedTo: string
  status: string
  completedAt: string | null
  completedBy: string | null
  outcome: 'passed' | 'failed' | null
  answers: ChecklistAnswer[] | null
  comments: string | null
  photoCount: number
  gps: string | null
  signature: string | null
  assetName: string
  assetCode: string
  category: AssetCategory
  department: string
  overdue: boolean
  daysToDue: number
  actionCodes: string[]
}

interface ServerAction {
  id: string
  code: string
  title: string
  detail: string
  owner: string
  dueDate: string
  priority: CapaItem['priority']
  status: string
  companyId: string
  siteId: string
  createdAt: string
  completedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  evidenceNote: string | null
}

const nu = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/** Date-only fields are stored at UTC midnight, so the first ten characters are the date. */
const asDate = (iso: string) => iso.slice(0, 10)

export function toAsset(s: ServerAsset): AssetView {
  return {
    id: s.id,
    code: s.code,
    qrKey: s.qrKey,
    name: s.name,
    category: s.category,
    customCategory: nu(s.customCategory),
    serialNumber: s.serialNumber,
    manufacturer: s.manufacturer,
    model: s.model,
    purchaseDate: s.purchaseDate ? asDate(s.purchaseDate) : undefined,
    commissionDate: s.commissionDate ? asDate(s.commissionDate) : undefined,
    warrantyUntil: s.warrantyUntil ? asDate(s.warrantyUntil) : undefined,
    companyId: s.companyId,
    siteId: s.siteId,
    department: s.department,
    owner: s.owner,
    location: s.location,
    status: STATUS_FROM_SERVER[s.status] ?? 'In Service',
    frequency: s.frequency,
    documents: s.documents.map((d) => ({
      id: d.id, name: d.name, kind: d.kind as Asset['documents'][number]['kind'],
    })),
    lastInspectedAt: nu(s.lastInspectedAt),
    nextDueDate: asDate(s.nextDueDate),
    health: s.health,
    risk: s.risk,
    openDefects: s.openDefects,
    overdue: s.overdue,
    daysToDue: s.daysToDue,
    lastOutcome: s.lastOutcome,
    healthFactors: s.healthFactors,
  }
}

export function toInspection(s: ServerInspection): InspectionView {
  return {
    id: s.id,
    code: s.code,
    assetId: s.assetId,
    companyId: s.companyId,
    siteId: s.siteId,
    scheduledFor: asDate(s.scheduledFor),
    assignedTo: s.assignedTo,
    status: INSPECTION_STATUS[s.status] ?? 'Scheduled',
    completedAt: nu(s.completedAt),
    completedBy: nu(s.completedBy),
    outcome: nu(s.outcome),
    answers: nu(s.answers),
    comments: nu(s.comments),
    photoCount: s.photoCount,
    gps: nu(s.gps),
    signature: nu(s.signature),
    // The register renders codes; ids are no longer meaningful to it now that the
    // relationship lives on the action row.
    actionIds: s.actionCodes,
    assetName: s.assetName,
    assetCode: s.assetCode,
    category: s.category,
    department: s.department,
    overdue: s.overdue,
    daysToDue: s.daysToDue,
    actionCodes: s.actionCodes,
  }
}

/** Server action → the CapaItem shape the asset drawer lists. */
function toOpenAction(a: ServerAction): CapaItem {
  const daysToDue = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400_000)
  const status: CapaItem['status'] =
    ({ open: 'Open', in_progress: 'In Progress', completed: 'Completed', verified: 'Verified', cancelled: 'Cancelled' } as Record<string, CapaItem['status']>)[a.status] ?? 'Open'
  const isOpen = status === 'Open' || status === 'In Progress'
  return {
    id: a.id,
    code: a.code,
    title: a.title,
    companyId: a.companyId,
    siteId: a.siteId,
    department: '',
    incidentId: null,
    owner: a.owner,
    priority: a.priority,
    dueDate: asDate(a.dueDate),
    createdAt: a.createdAt,
    status,
    derived: status === 'Completed' ? 'Waiting Verification' : status === 'In Progress' ? 'In Progress' : 'Assigned',
    overdue: isOpen && daysToDue < 0,
    daysToDue,
    progress: status === 'Open' ? 0 : status === 'In Progress' ? 50 : 100,
    evidenceRequired: true,
    evidenceNote: nu(a.evidenceNote),
    verifiedBy: nu(a.verifiedBy),
    verifiedAt: nu(a.verifiedAt),
    completedAt: nu(a.completedAt),
    notes: [],
    // The drawer lists open defects, not their history — the full trail is on the
    // Actions register, which reads the same rows.
    timeline: [],
  }
}

export const inspectionsApi = {
  /**
   * The checklist templates, from the server that validates the answers.
   *
   * Fetched rather than bundled. The runner used to read a copy compiled into the app,
   * which meant adding a category server-side rendered an empty checklist here and the
   * inspector signed off a form with nothing on it.
   */
  checklists(): Promise<Record<string, ChecklistItem[]>> {
    return request('/assets/checklists')
  },

  /** One page, with the server's true total — the input `drain` needs. */
  async listAssetsPage(
    companyId: string, filters: AssetFilters = {}, page = 1, pageSize = 200,
  ): Promise<{ rows: AssetView[]; total: number }> {
    const data = await request<Page<ServerAsset>>(`/assets?${qs({
      companyId,
      q: filters.q,
      siteId: filters.siteId ?? undefined,
      category: filters.category || undefined,
      status: filters.status ? STATUS_TO_SERVER[filters.status] : undefined,
      bucket: filters.bucket && filters.bucket !== 'all' ? filters.bucket : undefined,
      page,
      pageSize,
    })}`)
    return { rows: data.rows.map(toAsset), total: data.total }
  },

  /** Every asset matching the filter, not just the first page. See `paging.ts`. */
  async listAssets(companyId: string, filters: AssetFilters = {}): Promise<AssetView[]> {
    return drainRows((page, pageSize) => this.listAssetsPage(companyId, filters, page, pageSize))
  },

  async getAssetProfile(idOrQr: string) {
    const data = await request<{
      asset: ServerAsset; inspections: ServerInspection[]; openActions: ServerAction[]
    }>(`/assets/${encodeURIComponent(idOrQr)}`)
    return {
      asset: toAsset(data.asset),
      inspections: data.inspections.map(toInspection),
      openActions: data.openActions.map(toOpenAction),
    }
  },

  async createAsset(input: NewAssetInput): Promise<AssetView> {
    return toAsset(await request<ServerAsset>('/assets', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async scheduleInspection(assetId: string, date: string, inspector: string): Promise<InspectionView> {
    return toInspection(await request<ServerInspection>(`/assets/${assetId}/inspections`, {
      method: 'POST', body: JSON.stringify({ date, inspector }),
    }))
  },

  async completeInspection(
    inspectionId: string,
    input: CompleteInspectionInput,
  ): Promise<InspectionView> {
    return toInspection(await request<ServerInspection>(
      `/assets/inspections/${inspectionId}/complete`,
      { method: 'POST', body: JSON.stringify(input) },
    ))
  },

  async listInspections(companyId: string, filters: InspectionFilters = {}): Promise<InspectionView[]> {
    const data = await request<Page<ServerInspection>>(`/assets/inspections?${qs({
      companyId,
      q: filters.q,
      siteId: filters.siteId ?? undefined,
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
      pageSize: 200,
    })}`)
    return data.rows.map(toInspection)
  },

  async assetStats(companyId: string, siteId?: string | null): Promise<AssetStats> {
    return request<AssetStats>(`/assets/stats?${qs({ companyId, siteId: siteId ?? undefined })}`)
  },
}
