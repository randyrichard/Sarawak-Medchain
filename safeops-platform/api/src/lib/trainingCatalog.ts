// ─── Training catalogue ──────────────────────────────────────────────────────
// The standard competency set every workspace starts with.
//
// Same arrangement as the audit templates: these ship with the product and are the
// same for everyone, so they are constants rather than rows; a workspace's own courses
// are TrainingCourse rows and the service returns the union.
//
// `applies` is matched against the employee's department name, which is why the
// keywords are fragments rather than exact names — "Warehouse & Stores" has to match
// both "Warehouse" and "Stores".

import type { CourseCategory, DeliveryMode } from '@prisma/client'

export interface CourseShape {
  id: string
  code: string
  name: string
  category: CourseCategory
  description: string
  mandatory: boolean
  /** Null means a one-time competency that never expires. */
  validityMonths: number | null
  durationHours: number
  deliveryModes: DeliveryMode[]
  competency: string
  passMark: number
  /** Empty means the whole workforce. */
  applies: string[]
  custom?: boolean
}

export const TRAINING_COURSES: CourseShape[] = [
  {
    id: 'trn-101', code: 'TRN-101', name: 'Safety Induction', category: 'induction',
    description: 'Site HSE rules, hazards, emergency procedures and worker rights. Required before any site access.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Site-safe worker', passMark: 80, applies: [],
  },
  {
    id: 'trn-102', code: 'TRN-102', name: 'Working at Height', category: 'safety',
    description: 'Fall-arrest systems, anchor points, ladder & scaffold safety, rescue awareness.',
    mandatory: true, validityMonths: 24, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Authorised for work at height', passMark: 80,
    applies: ['Maintenance', 'Contractors', 'Field', 'Civil', 'M&E'],
  },
  {
    id: 'trn-103', code: 'TRN-103', name: 'Confined Space Entry', category: 'safety',
    description: 'Atmospheric testing, entry permits, ventilation and standby-person duties.',
    mandatory: true, validityMonths: 24, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Confined space entrant', passMark: 85, applies: ['Field', 'Maintenance'],
  },
  {
    id: 'trn-104', code: 'TRN-104', name: 'Lockout / Tagout (LOTO)', category: 'safety',
    description: 'Isolation of hazardous energy, group lockout, verification and restoration.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Authorised isolator', passMark: 80, applies: ['Maintenance', 'Production', 'Mill'],
  },
  {
    id: 'trn-105', code: 'TRN-105', name: 'Forklift Operation', category: 'equipment',
    description: 'Powered industrial truck operation, load handling, pedestrian safety and daily checks.',
    mandatory: true, validityMonths: 36, durationHours: 16, deliveryModes: ['physical'],
    competency: 'Licensed forklift operator', passMark: 80, applies: ['Warehouse', 'Logistics', 'Stores'],
  },
  {
    id: 'trn-106', code: 'TRN-106', name: 'Chemical Handling (USECHH)', category: 'health',
    description: 'Safe handling, SDS interpretation, spill response and PPE for hazardous chemicals.',
    mandatory: true, validityMonths: 24, durationHours: 6, deliveryModes: ['physical', 'online'],
    competency: 'Chemical handler', passMark: 80, applies: ['Production', 'Mill', 'Field'],
  },
  {
    id: 'trn-107', code: 'TRN-107', name: 'Fire Warden', category: 'emergency',
    description: 'Evacuation coordination, extinguisher use, headcount and assembly-point duties.',
    mandatory: false, validityMonths: 12, durationHours: 4, deliveryModes: ['physical'],
    competency: 'Appointed fire warden', passMark: 80, applies: ['Warehouse', 'Production', 'HSE'],
  },
  {
    id: 'trn-108', code: 'TRN-108', name: 'Emergency Response Team', category: 'emergency',
    description: 'ERT roles, casualty handling, breathing apparatus awareness and incident command.',
    mandatory: false, validityMonths: 12, durationHours: 16, deliveryModes: ['physical'],
    competency: 'ERT member', passMark: 85, applies: ['HSE', 'Field'],
  },
  {
    id: 'trn-109', code: 'TRN-109', name: 'First Aid & CPR', category: 'health',
    description: 'Primary survey, CPR, bleeding control and workplace first-aid response (MRC certified).',
    mandatory: false, validityMonths: 24, durationHours: 16, deliveryModes: ['physical'],
    competency: 'Certified first aider', passMark: 80, applies: ['HSE', 'Warehouse', 'Mill'],
  },
  {
    id: 'trn-110', code: 'TRN-110', name: 'Permit-to-Work Authorisation', category: 'safety',
    description: 'Issuing and receiving permits, isolation confirmation, gas testing and sign-off.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Permit authoriser', passMark: 85, applies: ['Field', 'Maintenance'],
  },
  /*
   * The competencies the permit rules ask for (permitPeople.ts REQUIRED_COMPETENCY). They
   * were missing from the catalogue, so no employee could ever hold one: hot work, electrical
   * isolation, LOTO, lifting and radiography permits could never be started with your own
   * staff named on them. trainingCatalog.test.ts now fails if the two lists drift apart.
   */
  {
    id: 'trn-111', code: 'TRN-111', name: 'Hot Work Safety', category: 'safety',
    description: 'Fire triangle, combustibles control, fire watch duties, gas testing before and during hot work.',
    mandatory: false, validityMonths: 24, durationHours: 4, deliveryModes: ['physical'],
    competency: 'Authorised for hot work', passMark: 80,
    applies: ['Maintenance', 'Fabrication', 'Contractors', 'M&E'],
  },
  {
    id: 'trn-112', code: 'TRN-112', name: 'Electrical Safety & Isolation', category: 'safety',
    description: 'Electrical hazards, safe isolation, prove-dead testing, lock-out and permit interfaces.',
    mandatory: false, validityMonths: 24, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Authorised for electrical isolation', passMark: 85,
    applies: ['Maintenance', 'M&E'],
  },
  {
    id: 'trn-113', code: 'TRN-113', name: 'Rigging & Slinging', category: 'equipment',
    description: 'Load estimation, sling selection and inspection, hand signals, lift plans and exclusion zones.',
    mandatory: false, validityMonths: 36, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Competent rigger', passMark: 80,
    applies: ['Contractors', 'Civil', 'Fabrication', 'Warehouse'],
  },
  {
    id: 'trn-114', code: 'TRN-114', name: 'Radiation Protection (Industrial Radiography)', category: 'health',
    description: 'Ionising radiation hazards, dose limits, barriers and survey meters, under the Atomic Energy Licensing Act 1984.',
    mandatory: false, validityMonths: 36, durationHours: 16, deliveryModes: ['physical'],
    competency: 'Radiation worker', passMark: 85,
    applies: ['Inspection', 'Radiography'],
  },
]

export const BUILT_IN_COURSE_IDS = new Set(TRAINING_COURSES.map((c) => c.id))

/**
 * Whether a course applies to a department.
 *
 * Substring rather than exact match, deliberately: departments are named for how the
 * site talks about them ("Warehouse & Stores", "M&E Installation"), and a competency
 * requirement that only fires on an exact string is one that silently applies to nobody.
 */
export function courseApplies(course: { applies: string[] }, departmentName: string): boolean {
  if (course.applies.length === 0) return true
  const dept = departmentName.toLowerCase()
  return course.applies.some((kw) => dept.includes(kw.toLowerCase()))
}

/** Days before expiry at which a certificate starts reading as "expiring". */
export const EXPIRING_WINDOW_DAYS = 90

/** Days a training-lapse corrective action gets before it falls due. */
export const TRAINING_ACTION_DUE_DAYS = 21
