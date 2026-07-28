// ─── Audit catalogue ─────────────────────────────────────────────────────────
// The built-in checklist templates every workspace can run, plus the escalation the
// severity of a finding buys its corrective action.
//
// Built-ins are constants rather than rows: they are the same for every tenant, they
// ship with the product, and a template a customer never wrote is not theirs to edit.
// Tenant-authored templates are AuditTemplate rows; the service returns the union.
//
// This is the authoritative copy. Completion is validated against it, so a client that
// submits a short or invented checklist is rejected rather than scored.

import type { AuditType, FindingSeverity } from '@prisma/client'

export const AUDIT_TYPES = [
  'internal', 'external', 'dosh', 'iso45001', 'customer', 'contractor',
  'supplier', 'environmental', 'quality', 'custom',
] as const satisfies readonly AuditType[]

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  internal: 'Internal Audit',
  external: 'External Audit',
  dosh: 'DOSH Inspection',
  iso45001: 'ISO 45001 Audit',
  customer: 'Customer Audit',
  contractor: 'Contractor Audit',
  supplier: 'Supplier Audit',
  environmental: 'Environmental Audit',
  quality: 'Quality Audit',
  custom: 'Custom Audit',
}

/**
 * Days a finding's corrective action gets before it falls due.
 *
 * The gradient is the point: a Critical finding that sat in the same 30-day queue as an
 * Observation is a Critical finding nobody treated as critical.
 */
export const SEVERITY_DUE_DAYS: Record<FindingSeverity, number> = {
  Critical: 7,
  Major: 14,
  Minor: 30,
  Observation: 45,
}

/** Finding severity → the priority its corrective action carries on the CAPA register. */
export const SEVERITY_PRIORITY: Record<FindingSeverity, 'High' | 'Medium' | 'Low'> = {
  Critical: 'High',
  Major: 'High',
  Minor: 'Medium',
  Observation: 'Low',
}

export interface TemplateItem {
  id: string
  text: string
  guidance?: string
}

export interface TemplateSection {
  title: string
  items: TemplateItem[]
}

export interface AuditTemplateShape {
  id: string
  name: string
  type: AuditType
  sections: TemplateSection[]
  custom?: boolean
}

export const AUDIT_TEMPLATES: AuditTemplateShape[] = [
  {
    id: 'tpl-iso45001',
    name: 'ISO 45001:2018 Internal Audit',
    type: 'iso45001',
    sections: [
      {
        title: 'Context & Leadership (Cl. 4–5)',
        items: [
          { id: 'i1', text: 'OH&S policy current, signed and communicated', guidance: 'Check notice boards and induction pack.' },
          { id: 'i2', text: 'Roles & responsibilities defined and understood', guidance: 'Interview two workers at random.' },
          { id: 'i3', text: 'Worker consultation mechanism active (committee minutes)' },
        ],
      },
      {
        title: 'Planning & Support (Cl. 6–7)',
        items: [
          { id: 'i4', text: 'HIRARC register current for all routine tasks' },
          { id: 'i5', text: 'Legal register reviewed within last 12 months' },
          { id: 'i6', text: 'Training matrix complete; competency records available' },
        ],
      },
      {
        title: 'Operation (Cl. 8)',
        items: [
          { id: 'i7', text: 'Permit-to-work operating per procedure', guidance: 'Sample two live permits.' },
          { id: 'i8', text: 'Contractor controls applied (inductions, supervision)' },
          { id: 'i9', text: 'Emergency plan tested within schedule' },
        ],
      },
      {
        title: 'Performance & Improvement (Cl. 9–10)',
        items: [
          { id: 'i10', text: 'Incident investigations completed with RCA' },
          { id: 'i11', text: 'Corrective actions verified and closed on time' },
          { id: 'i12', text: 'Management review conducted with outputs actioned' },
        ],
      },
    ],
  },
  {
    id: 'tpl-dosh',
    name: 'DOSH / OSHA 1994 Readiness Walk',
    type: 'dosh',
    sections: [
      {
        title: 'Statutory Documentation',
        items: [
          { id: 'd1', text: 'OSH coordinator/SHO appointment letters current' },
          { id: 'd2', text: 'JKKP registrations & certificates displayed (PMA/PMT)' },
          { id: 'd3', text: 'Accident reporting records (JKKP 6/7/8) complete' },
        ],
      },
      {
        title: 'Workplace Conditions',
        items: [
          { id: 'd4', text: 'Machine guarding intact on sampled equipment' },
          { id: 'd5', text: 'Chemical register & SDS accessible (USECHH)' },
          { id: 'd6', text: 'Welfare facilities clean and adequate' },
          { id: 'd7', text: 'Emergency exits clear, signage illuminated' },
        ],
      },
      {
        title: 'People',
        items: [
          { id: 'd8', text: 'Competent persons appointed for statutory equipment' },
          { id: 'd9', text: 'First aiders certified and coverage adequate' },
          { id: 'd10', text: 'PPE issued, worn and in serviceable condition' },
        ],
      },
    ],
  },
  {
    id: 'tpl-contractor',
    name: 'Contractor HSE Audit',
    type: 'contractor',
    sections: [
      {
        title: 'Mobilisation',
        items: [
          { id: 'c1', text: 'All workers inducted; green cards/passes current' },
          { id: 'c2', text: 'Method statements & JSAs approved before work' },
          { id: 'c3', text: 'Supervision ratio meets contract requirement' },
        ],
      },
      {
        title: 'Execution',
        items: [
          { id: 'c4', text: 'Tools & equipment inspected and tagged' },
          { id: 'c5', text: 'Work-at-height controls per site standard' },
          { id: 'c6', text: 'Housekeeping in work areas acceptable' },
          { id: 'c7', text: 'Toolbox talks recorded daily' },
          { id: 'c8', text: 'Incidents & near-misses reported same day' },
        ],
      },
    ],
  },
  {
    id: 'tpl-env',
    name: 'Environmental Compliance Audit',
    type: 'environmental',
    sections: [
      {
        title: 'Waste & Discharge',
        items: [
          { id: 'e1', text: 'Scheduled waste stored, labelled & manifested (Kualiti Alam)' },
          { id: 'e2', text: 'Effluent within discharge limits; records current' },
          { id: 'e3', text: 'Spill kits stocked at storage & transfer points' },
        ],
      },
      {
        title: 'Licences & Monitoring',
        items: [
          { id: 'e4', text: 'DOE licences current and conditions met' },
          { id: 'e5', text: 'Air emission / stack monitoring within schedule' },
          { id: 'e6', text: 'Chemical storage bunding intact (110% capacity)' },
          { id: 'e7', text: 'Environmental complaints log reviewed' },
        ],
      },
    ],
  },
  {
    id: 'tpl-5s',
    name: '5S / Housekeeping Quality Walk',
    type: 'quality',
    sections: [
      {
        title: 'Workplace Organisation',
        items: [
          { id: 'q1', text: 'Sort: no unneeded items in work areas' },
          { id: 'q2', text: 'Set: locations labelled; shadow boards complete' },
          { id: 'q3', text: 'Shine: equipment and floors clean' },
          { id: 'q4', text: 'Standardise: visual standards posted' },
          { id: 'q5', text: 'Sustain: last walk actions closed' },
          { id: 'q6', text: 'Walkways & exits unobstructed' },
        ],
      },
    ],
  },
]

export const BUILT_IN_TEMPLATE_IDS = new Set(AUDIT_TEMPLATES.map((t) => t.id))

/** Total checklist items in a template — the count completion is validated against. */
export const templateItemCount = (t: AuditTemplateShape) =>
  t.sections.reduce((n, s) => n + s.items.length, 0)
