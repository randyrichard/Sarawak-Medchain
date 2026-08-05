// ─── Contractor domain types ─────────────────────────────────────────────────
// Contracting firms working on the tenant's sites, and the people they send.

/** Derived on the server from the date and today — never stored. */
export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'missing'

export const COMPLIANCE_FILTERS = ['all', 'valid', 'expiring', 'expired', 'missing'] as const
export type ComplianceFilter = (typeof COMPLIANCE_FILTERS)[number]

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Not recorded',
}

export type ContractorStatus = 'active' | 'suspended'

export const WORKER_SORTS = ['name', 'workerNo', 'medicalExpiry', 'inductionExpiry'] as const
export type WorkerSort = (typeof WORKER_SORTS)[number]

export const CONTRACTOR_SORTS = ['name', 'code', 'insuranceExpiry'] as const
export type ContractorSort = (typeof CONTRACTOR_SORTS)[number]

export interface ContractorCompanyRow {
  id: string
  companyId: string
  code: string
  name: string
  registrationNumber: string
  contactPerson: string
  phone: string
  email: string | null
  address: string
  insuranceExpiry: string | null
  insuranceStatus: ExpiryStatus
  daysToInsuranceExpiry: number | null
  status: ContractorStatus
  workerCount: number
  onSiteCount: number
  createdAt: string
  updatedAt: string
}

export interface ContractorWorkerRow {
  id: string
  companyId: string
  workerNo: string
  name: string
  icPassport: string
  position: string
  siteId: string
  contractorCompanyId: string
  contractorName: string
  contractorCode: string
  contractorSuspended: boolean
  medicalExpiry: string | null
  medicalStatus: ExpiryStatus
  daysToMedicalExpiry: number | null
  inductionExpiry: string | null
  inductionStatus: ExpiryStatus
  daysToInductionExpiry: number | null
  emergencyName: string
  emergencyPhone: string
  emergencyRelation: string
  onSite: boolean
  checkedInAt: string | null
  active: boolean
  certificateCount: number
  /** Whether the gate may admit them right now. Derived server-side, never stored. */
  clearedForSite: boolean
  createdAt: string
  updatedAt: string
}

export interface ContractorCertificate {
  id: string
  workerId: string
  name: string
  issuedBy: string
  issueDate: string | null
  expiryDate: string | null
  reference: string | null
  status: ExpiryStatus
  daysToExpiry: number | null
}

export interface ContractorWorkerDetail extends ContractorWorkerRow {
  certificates: ContractorCertificate[]
}

export interface ContractorStats {
  contractorCompanies: number
  activeContractors: number
  suspendedContractors: number
  activeWorkers: number
  onSite: number
  medicalExpired: number
  inductionExpired: number
  insuranceExpired: number
  insuranceExpiring: number
}

export interface NewContractorInput {
  name: string
  registrationNumber?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  insuranceExpiry?: string
}

export interface ContractorPatch {
  name?: string
  registrationNumber?: string
  contactPerson?: string
  phone?: string
  email?: string | null
  address?: string
  insuranceExpiry?: string | null
  status?: ContractorStatus
}

export interface NewWorkerInput {
  contractorCompanyId: string
  siteId: string
  name: string
  icPassport?: string
  position?: string
  medicalExpiry?: string
  inductionExpiry?: string
  emergencyName?: string
  emergencyPhone?: string
  emergencyRelation?: string
}

export interface WorkerPatch {
  contractorCompanyId?: string
  siteId?: string
  name?: string
  icPassport?: string
  position?: string
  medicalExpiry?: string | null
  inductionExpiry?: string | null
  emergencyName?: string
  emergencyPhone?: string
  emergencyRelation?: string
}

export interface WorkerFilters {
  q?: string
  siteId?: string
  contractorCompanyId?: string
  status?: 'active' | 'inactive' | 'all'
  medical?: ComplianceFilter
  induction?: ComplianceFilter
  onSite?: boolean
  sort?: WorkerSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface NewCompetencyInput {
  name: string
  issuedBy?: string
  issueDate?: string
  expiryDate?: string
  reference?: string
}

/**
 * Competencies a contractor is usually asked to evidence, offered as suggestions.
 *
 * A free-text field produces three spellings of "working at height" and three different
 * answers to how many riggers are certified.
 */
export const COMPETENCIES = [
  'Working at Height',
  'Confined Space Entry',
  'Scaffolding (Erector)',
  'Rigging & Slinging',
  'Mobile Crane Operator',
  'Forklift Operator',
  'Hot Work / Welding',
  'Electrical Competency (Chargeman)',
  'First Aid & CPR',
  'Gas Testing',
  'Banksman / Signaller',
  'Site Safety Supervisor',
] as const
