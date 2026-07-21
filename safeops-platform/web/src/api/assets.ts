// ─── Asset & Inspection domain ───────────────────────────────────────────────
// Assets are inspected on a schedule; failed checklist items auto-create
// corrective actions in the CAPA module. One store owns all of it.

export const ASSET_CATEGORIES = [
  'fire_extinguisher', 'forklift', 'ladder', 'scaffolding', 'machinery', 'electrical_panel',
  'emergency_lighting', 'first_aid_kit', 'ppe', 'vehicle', 'pressure_vessel', 'custom',
] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  fire_extinguisher: 'Fire Extinguisher',
  forklift: 'Forklift',
  ladder: 'Ladder',
  scaffolding: 'Scaffolding',
  machinery: 'Machinery',
  electrical_panel: 'Electrical Panel',
  emergency_lighting: 'Emergency Lighting',
  first_aid_kit: 'First Aid Kit',
  ppe: 'PPE Inventory',
  vehicle: 'Vehicle',
  pressure_vessel: 'Pressure Vessel',
  custom: 'Custom Asset',
}

export type AssetStatus = 'In Service' | 'Under Maintenance' | 'Out of Service' | 'Retired'
export type InspectionFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

export const FREQUENCY_LABEL: Record<InspectionFrequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
}
export const FREQUENCY_DAYS: Record<InspectionFrequency, number> = {
  daily: 1, weekly: 7, monthly: 30, quarterly: 91, annual: 365,
}

export interface AssetDocument {
  id: string
  name: string
  kind: 'pdf' | 'image' | 'certificate'
}

export interface Asset {
  id: string
  code: string // AST-####
  qrKey: string // payload of the printed QR label
  name: string
  category: AssetCategory
  customCategory?: string
  serialNumber: string
  manufacturer: string
  model: string
  purchaseDate?: string
  commissionDate?: string
  warrantyUntil?: string
  companyId: string
  siteId: string
  department: string
  owner: string
  location: string
  status: AssetStatus
  frequency: InspectionFrequency
  documents: AssetDocument[]
  lastInspectedAt?: string
  /** date the next inspection is due (kept in sync by the store) */
  nextDueDate: string
}

export type RiskLevel = 'Low' | 'Medium' | 'High'

/** Asset + everything computed the UI needs. */
export interface AssetView extends Asset {
  health: number // 0–100
  risk: RiskLevel
  openDefects: number
  overdue: boolean
  daysToDue: number
  lastOutcome?: 'passed' | 'failed'
  healthFactors: { label: string; delta: number }[]
}

export type ChecklistResult = 'pass' | 'fail' | 'na'

export interface ChecklistItem {
  id: string
  label: string
  /** optional measurement prompt, e.g. "Tread depth (mm)" */
  measure?: string
}

export interface ChecklistAnswer {
  itemId: string
  label: string
  result: ChecklistResult
  comment?: string
  measurement?: string
}

export type InspectionStatus = 'Scheduled' | 'Completed' | 'Cancelled'

export interface Inspection {
  id: string
  code: string // INS-####
  assetId: string
  companyId: string
  siteId: string
  scheduledFor: string // date
  assignedTo: string
  status: InspectionStatus
  // completion
  completedAt?: string
  completedBy?: string
  outcome?: 'passed' | 'failed'
  answers?: ChecklistAnswer[]
  comments?: string
  photoCount?: number
  gps?: string
  signature?: string
  /** corrective actions auto-created from failed items */
  actionIds: string[]
}

export interface InspectionView extends Inspection {
  assetName: string
  assetCode: string
  category: AssetCategory
  department: string
  overdue: boolean
  daysToDue: number
  actionCodes: string[]
}

export interface AssetFilters {
  q?: string
  siteId?: string
  category?: AssetCategory | ''
  status?: AssetStatus | ''
  bucket?: 'all' | 'overdue' | 'due_week' | 'high_risk' | 'defects'
}

export interface InspectionFilters {
  q?: string
  siteId?: string
  status?: 'all' | 'scheduled' | 'overdue' | 'completed' | 'failed'
}

export interface NewAssetInput {
  name: string
  category: AssetCategory
  customCategory?: string
  serialNumber: string
  manufacturer: string
  model: string
  companyId: string
  siteId: string
  department: string
  owner: string
  location: string
  frequency: InspectionFrequency
  commissionDate?: string
  warrantyUntil?: string
}

export interface CompleteInspectionInput {
  answers: ChecklistAnswer[]
  comments?: string
  photoCount: number
  gps?: string
  signature: string
}

export interface AssetStats {
  totalAssets: number
  complianceRate: number // % of assets not overdue for inspection
  overdueInspections: number
  dueThisWeek: number
  openDefects: number
  avgHealth: number
  highestRisk: { code: string; name: string; health: number; siteId: string }[]
  bySiteHealth: { name: string; value: number }[]
  monthlyTrend: { month: string; Completed: number; Failed: number }[]
}
