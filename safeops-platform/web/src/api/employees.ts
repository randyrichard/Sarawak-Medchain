// ─── Workforce register domain types ─────────────────────────────────────────
// Every other module points at a person. These are the shapes the register serves.

/** Derived on the server from the expiry date and today — never stored. */
export type MedicalStatus = 'valid' | 'expiring' | 'expired' | 'missing'

export const MEDICAL_FILTERS = ['all', 'valid', 'expiring', 'expired', 'missing'] as const
export type MedicalFilter = (typeof MEDICAL_FILTERS)[number]

export const MEDICAL_LABEL: Record<MedicalStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Not Recorded',
}

export const EMPLOYEE_SORTS = ['name', 'employeeNo', 'position', 'medicalExpiry', 'hireDate'] as const
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number]

export interface EmployeeRow {
  id: string
  employeeNo: string
  companyId: string
  siteId: string
  name: string
  position: string
  department: string
  departmentId: string | null
  teamId: string | null
  email: string | null
  phone: string | null
  active: boolean
  hireDate: string | null
  /** Null for roles that may not see medical detail. */
  bloodGroup: string | null
  medicalExpiry: string | null
  medicalNotes: string | null
  /** Visible to everyone: a supervisor has to know whether someone may enter a vessel. */
  medicalStatus: MedicalStatus
  daysToMedicalExpiry: number | null
  certificateCount: number
  ppeCount: number
  createdAt: string
  updatedAt: string
}

export interface EmergencyContact {
  id: string
  employeeId: string
  name: string
  relationship: string
  phone: string
  altPhone: string | null
  isPrimary: boolean
}

export interface PpeIssue {
  id: string
  employeeId: string
  item: string
  size: string
  serialNumber: string | null
  issuedAt: string
  issuedBy: string
  replaceDue: string | null
  returnedAt: string | null
  notes: string | null
  overdue: boolean
  daysToReplace: number | null
}

export interface EmployeeCertificate {
  id: string
  number: string
  courseName: string
  issueDate: string
  expiryDate: string | null
  daysToExpiry: number | null
}

export interface EmployeeTrainingRecord {
  id: string
  sessionId: string
  code: string
  courseName: string
  scheduledFor: string
  present: boolean
  result: string | null
  score: number | null
}

export interface EmployeeDetail extends EmployeeRow {
  emergencyContacts: EmergencyContact[]
  ppeIssues: PpeIssue[]
  certificates: EmployeeCertificate[]
  trainingHistory: EmployeeTrainingRecord[]
}

export interface EmployeeStats {
  headcount: number
  inactive: number
  medicalExpired: number
  medicalExpiring: number
  medicalMissing: number
  ppeOverdue: number
}

export interface EmployeeFilters {
  q?: string
  siteId?: string
  department?: string
  status?: 'active' | 'inactive' | 'all'
  medical?: MedicalFilter
  sort?: EmployeeSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface NewEmployeeInput {
  name: string
  siteId: string
  position?: string
  department?: string
  email?: string
  phone?: string
  hireDate?: string
  bloodGroup?: string
  medicalExpiry?: string
  medicalNotes?: string
}

/**
 * An edit. Nullable where the create form is merely optional, because clearing a field
 * is a real intent the server has to be able to tell apart from "not mentioned".
 */
export interface EmployeePatch {
  name?: string
  siteId?: string
  position?: string
  department?: string
  email?: string | null
  phone?: string | null
  hireDate?: string | null
  bloodGroup?: string | null
  medicalExpiry?: string | null
  medicalNotes?: string | null
}

export interface NewContactInput {
  name: string
  relationship?: string
  phone: string
  altPhone?: string
  isPrimary?: boolean
}

export interface NewPpeInput {
  item: string
  size?: string
  serialNumber?: string
  replaceDue?: string
  notes?: string
}

/**
 * The PPE a site actually issues, offered as suggestions on the issue form.
 *
 * A free-text field produces "harness", "Harness", "full body harness" and three
 * different answers to "how many harnesses are overdue".
 */
export const PPE_ITEMS = [
  'Safety helmet',
  'Safety boots',
  'High-visibility vest',
  'Safety glasses',
  'Hearing protection',
  'Full body harness',
  'Respirator (half-face)',
  'Respirator (full-face)',
  'Chemical gloves',
  'Cut-resistant gloves',
  'Welding shield',
  'Fire-retardant coverall',
] as const
