// ─── Audit templates + audit/compliance/document seeds ───────────────────────

import type {
  Audit, AuditTemplate, ComplianceDocument, ComplianceObligation,
} from '../audits'

export const AUDIT_TEMPLATES: AuditTemplate[] = [
  {
    id: 'tpl-iso45001', name: 'ISO 45001:2018 Internal Audit', type: 'iso45001',
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
    id: 'tpl-dosh', name: 'DOSH / OSHA 1994 Readiness Walk', type: 'dosh',
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
    id: 'tpl-contractor', name: 'Contractor HSE Audit', type: 'contractor',
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
    id: 'tpl-env', name: 'Environmental Compliance Audit', type: 'environmental',
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
    id: 'tpl-5s', name: '5S / Housekeeping Quality Walk', type: 'quality',
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

const day = 86400_000
const dISO = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10)
const tISO = (offset: number) => new Date(Date.now() + offset * day).toISOString()

let n = 0
const tl = (at: string, actor: string, action: string, detail?: string) => ({ id: `atl${++n}`, at, actor, action, detail })

export function buildAuditSeeds(): Audit[] {
  return [
    {
      id: 'aud-3001', code: 'AUD-3001', title: 'ISO 45001 internal pre-audit — Kuching',
      type: 'iso45001', companyId: 'big', siteId: 'kch', department: 'Site-wide',
      leadAuditor: 'Marcus Tan', team: ['Sarah Wong'], templateId: 'tpl-iso45001',
      scheduledFor: dISO(-3), durationDays: 2, priority: 'High', status: 'Completed',
      startedAt: tISO(-3), completedAt: tISO(-2), score: 83,
      signature: 'Marcus Tan', gps: '1.5533° N, 110.3592° E',
      answers: undefined, // condensed seed — full answers captured for new audits
      findings: [
        {
          id: 'f-3001-1', code: 'F-3101', category: 'Operation (Cl. 8)',
          description: 'Two live hot-work permits missing gas-test entries at reissue.',
          severity: 'Major', photoCount: 2, actionId: 'sa-aud-1',
          raisedBy: 'Marcus Tan', raisedAt: tISO(-2),
        },
        {
          id: 'f-3001-2', code: 'F-3102', category: 'Planning & Support (Cl. 6–7)',
          description: 'Training matrix missing forklift refresher dates for 3 operators.',
          severity: 'Minor', photoCount: 1, actionId: 'sa-aud-2',
          raisedBy: 'Sarah Wong', raisedAt: tISO(-2),
        },
      ],
      timeline: [
        tl(tISO(-10), 'Marcus Tan', 'Audit created', 'ISO 45001 internal pre-audit'),
        tl(tISO(-3), 'Marcus Tan', 'Audit started'),
        tl(tISO(-2), 'Marcus Tan', 'Finding raised', 'F-3101 · Major — permit gas tests'),
        tl(tISO(-2), 'Sarah Wong', 'Finding raised', 'F-3102 · Minor — training matrix'),
        tl(tISO(-2), 'Marcus Tan', 'Audit completed', 'Score 83% · 2 finding(s)'),
      ],
    },
    {
      id: 'aud-3002', code: 'AUD-3002', title: 'DOSH readiness walk — Bintulu terminal',
      type: 'dosh', companyId: 'big', siteId: 'btu', department: 'Site-wide',
      leadAuditor: 'Amirul Hassan', team: ['Faizal Omar'], templateId: 'tpl-dosh',
      scheduledFor: dISO(-1), durationDays: 1, priority: 'High', status: 'In Progress',
      startedAt: tISO(-1),
      findings: [],
      timeline: [
        tl(tISO(-8), 'Marcus Tan', 'Audit created', 'DOSH readiness ahead of CIMAH visit'),
        tl(tISO(-1), 'Amirul Hassan', 'Audit started'),
      ],
    },
    {
      id: 'aud-3003', code: 'AUD-3003', title: 'Contractor HSE audit — scaffold crews',
      type: 'contractor', companyId: 'big', siteId: 'mri', department: 'Contractors',
      leadAuditor: 'Vincent Chai', team: [], templateId: 'tpl-contractor',
      scheduledFor: dISO(6), durationDays: 1, priority: 'Medium', status: 'Planned',
      findings: [],
      timeline: [tl(tISO(-4), 'Marcus Tan', 'Audit created', 'Post-DROPS refresher effectiveness check')],
    },
    {
      id: 'aud-3004', code: 'AUD-3004', title: 'Environmental audit — scheduled waste',
      type: 'environmental', companyId: 'big', siteId: 'twu', department: 'Mill',
      leadAuditor: 'Dayang Nurul', team: [], templateId: 'tpl-env',
      scheduledFor: dISO(12), durationDays: 1, priority: 'Medium', status: 'Planned',
      findings: [],
      timeline: [tl(tISO(-2), 'Marcus Tan', 'Audit created', 'DOE licence condition check')],
    },
    {
      id: 'aud-3005', code: 'AUD-3005', title: 'CIMAH mock external audit',
      type: 'external', companyId: 'big', siteId: 'btu', department: 'Site-wide',
      leadAuditor: 'Marcus Tan', team: ['Amirul Hassan', 'Faizal Omar'], templateId: 'tpl-dosh',
      scheduledFor: dISO(20), durationDays: 3, priority: 'High', status: 'Planned',
      findings: [],
      timeline: [tl(tISO(-6), 'Marcus Tan', 'Audit created', 'Dry run ahead of the 22 Aug CIMAH audit')],
    },
    {
      id: 'aud-3006', code: 'AUD-3006', title: '5S quality walk — Senari warehouse',
      type: 'quality', companyId: 'big', siteId: 'sen', department: 'Warehouse',
      leadAuditor: 'Grace Lim', team: [], templateId: 'tpl-5s',
      scheduledFor: dISO(-16), durationDays: 1, priority: 'Low', status: 'Closed',
      startedAt: tISO(-16), completedAt: tISO(-16), closedAt: tISO(-9), score: 92,
      signature: 'Grace Lim',
      findings: [
        {
          id: 'f-3006-1', code: 'F-3103', category: 'Workplace Organisation',
          description: 'Shadow board incomplete at charging bay — two tools unlabelled.',
          severity: 'Observation', photoCount: 1, actionId: 'sa-aud-3',
          raisedBy: 'Grace Lim', raisedAt: tISO(-16),
        },
      ],
      timeline: [
        tl(tISO(-20), 'Marcus Tan', 'Audit created'),
        tl(tISO(-16), 'Grace Lim', 'Audit started'),
        tl(tISO(-16), 'Grace Lim', 'Finding raised', 'F-3103 · Observation — shadow board'),
        tl(tISO(-16), 'Grace Lim', 'Audit completed', 'Score 92% · 1 finding(s)'),
        tl(tISO(-9), 'Marcus Tan', 'Audit closed', 'All findings verified'),
      ],
    },
    {
      id: 'aud-k30', code: 'AUD-K30', title: 'Client HSE compliance audit',
      type: 'customer', companyId: 'kcs', siteId: 'smh', department: 'Site-wide',
      leadAuditor: 'Azlan Mahmud', team: ['Lau Tze Ming'], templateId: 'tpl-contractor',
      scheduledFor: dISO(9), durationDays: 2, priority: 'High', status: 'Planned',
      findings: [],
      timeline: [tl(tISO(-3), 'Azlan Mahmud', 'Audit created', 'Client-mandated annual audit')],
    },
  ]
}

export function buildObligationSeeds(): ComplianceObligation[] {
  const mk = (o: Omit<ComplianceObligation, 'id'>): ComplianceObligation => ({ ...o, id: `ob-${++n}` })
  return [
    mk({ regulation: 'CIMAH Regulations 1996', requirement: 'Safety report revalidation (5-yearly)', responsible: 'Marcus Tan', companyId: 'big', siteId: 'btu', nextDue: dISO(34), evidenceDoc: 'Safety Report rev 3', notes: 'MOC for export compressor must be reflected before submission.' }),
    mk({ regulation: 'FMA 1967 (PMA)', requirement: 'Air receiver AR-2 certificate of fitness', responsible: 'Ganesh Pillai', companyId: 'big', siteId: 'kch', nextDue: dISO(40), expiryDate: dISO(40), evidenceDoc: 'PMA certificate PMT-4/2026' }),
    mk({ regulation: 'FMA 1967 (PMA)', requirement: 'Overhead crane KCH-OHC-02 certificate', responsible: 'Ganesh Pillai', companyId: 'big', siteId: 'kch', nextDue: dISO(75), expiryDate: dISO(75) }),
    mk({ regulation: 'OSHA 1994 s.29A', requirement: 'OSH coordinator appointment (Senari)', responsible: 'Grace Lim', companyId: 'big', siteId: 'sen', nextDue: dISO(11), notes: 'Appointment letter drafted, pending MD signature.' }),
    mk({ regulation: 'Fire Services Act 1988', requirement: 'Fire certificate renewal (Sibu hub)', responsible: 'Grace Lim', companyId: 'big', siteId: 'sbu', nextDue: dISO(21), expiryDate: dISO(21) }),
    mk({ regulation: 'DOSH (Competency)', requirement: 'Forklift operator competency refreshers', responsible: 'Grace Lim', companyId: 'big', siteId: 'sen', nextDue: dISO(14), notes: '12 operators — booked for 8 Aug.' }),
    mk({ regulation: 'CIMAH Regulations 1996', requirement: 'ERT respirator fit-tests (8 personnel)', responsible: 'Amirul Hassan', companyId: 'big', siteId: 'btu', nextDue: dISO(-5), notes: 'Overdue — vendor slot confirmed for this week.' }),
    mk({ regulation: 'USECHH 2000', requirement: 'Chemical register annual review', responsible: 'Dayang Nurul', companyId: 'big', siteId: 'twu', nextDue: dISO(58) }),
    mk({ regulation: 'EQA 1974 (DOE)', requirement: 'Scheduled waste e-consignment returns', responsible: 'Dayang Nurul', companyId: 'big', siteId: 'twu', nextDue: dISO(8), notes: 'Monthly return cycle.' }),
    mk({ regulation: 'OSHA 1994 (First Aid)', requirement: 'Certified first-aider coverage all shifts', responsible: 'Marcus Tan', companyId: 'big', siteId: null, nextDue: dISO(90) }),
    mk({ regulation: 'CIDB Act 520', requirement: 'Green card currency — all site workers', responsible: 'Lau Tze Ming', companyId: 'kcs', siteId: 'pjy', nextDue: dISO(13) }),
    mk({ regulation: 'JKKP (Notification)', requirement: 'NADOPOD accident register maintenance', responsible: 'Azlan Mahmud', companyId: 'kcs', siteId: null, nextDue: dISO(45) }),
  ]
}

export function buildDocumentSeeds(): ComplianceDocument[] {
  const mk = (d: Omit<ComplianceDocument, 'id'>): ComplianceDocument => ({ ...d, id: `doc-${++n}` })
  return [
    mk({ name: 'Group OH&S Policy', kind: 'policy', version: '4.0', status: 'Approved', owner: 'Marcus Tan', companyId: 'big', siteId: null, sizeKb: 310, updatedAt: tISO(-90), approvedBy: 'Faridah Abdullah', approvedAt: tISO(-88), history: [{ version: '4.0', at: tISO(-90), by: 'Marcus Tan', note: 'Annual review — no material change' }, { version: '3.2', at: tISO(-455), by: 'Marcus Tan', note: 'Added contractor clause' }] }),
    mk({ name: 'HIRARC Procedure', kind: 'sop', version: '2.1', status: 'Pending Approval', owner: 'Sarah Wong', companyId: 'big', siteId: null, sizeKb: 840, updatedAt: tISO(-2), history: [{ version: '2.1', at: tISO(-2), by: 'Sarah Wong', note: 'Added task-based re-assessment triggers' }, { version: '2.0', at: tISO(-300), by: 'Marcus Tan', note: 'Major rewrite' }] }),
    mk({ name: 'Permit-to-Work Procedure', kind: 'sop', version: '3.3', status: 'Approved', owner: 'Amirul Hassan', companyId: 'big', siteId: null, sizeKb: 1220, updatedAt: tISO(-30), approvedBy: 'Marcus Tan', approvedAt: tISO(-29), history: [{ version: '3.3', at: tISO(-30), by: 'Amirul Hassan', note: 'Barrier reinstatement sign-back added (INC-2606)' }] }),
    mk({ name: 'PMA certificate PMT-4/2026 (AR-2)', kind: 'certificate', version: '2026', status: 'Approved', owner: 'Ganesh Pillai', companyId: 'big', siteId: 'kch', sizeKb: 180, updatedAt: tISO(-325), approvedBy: 'DOSH', approvedAt: tISO(-325), history: [{ version: '2026', at: tISO(-325), by: 'Ganesh Pillai', note: 'Annual COF issued' }] }),
    mk({ name: 'Emergency Response Plan — Bintulu', kind: 'sop', version: '5.0', status: 'Approved', owner: 'Amirul Hassan', companyId: 'big', siteId: 'btu', sizeKb: 2100, updatedAt: tISO(-60), approvedBy: 'Marcus Tan', approvedAt: tISO(-58), history: [{ version: '5.0', at: tISO(-60), by: 'Amirul Hassan', note: 'Off-site scenarios expanded for CIMAH' }] }),
    mk({ name: 'Hot work permit HW-2231 (closed)', kind: 'permit', version: '1.0', status: 'Approved', owner: 'Rashid Karim', companyId: 'big', siteId: 'btu', sizeKb: 95, updatedAt: tISO(-6), approvedBy: 'Amirul Hassan', approvedAt: tISO(-6), history: [{ version: '1.0', at: tISO(-6), by: 'Rashid Karim', note: 'Filed on closure' }] }),
    mk({ name: 'Forklift refresher — attendance & assessments', kind: 'training_record', version: 'Jul-2026', status: 'Approved', owner: 'Grace Lim', companyId: 'big', siteId: 'sen', sizeKb: 460, updatedAt: tISO(-12), approvedBy: 'Marcus Tan', approvedAt: tISO(-11), history: [{ version: 'Jul-2026', at: tISO(-12), by: 'Grace Lim', note: 'Batch 1 of 3' }] }),
    mk({ name: 'AUD-3006 5S walk report — Senari', kind: 'audit_report', version: '1.0', status: 'Approved', owner: 'Grace Lim', companyId: 'big', siteId: 'sen', sizeKb: 380, updatedAt: tISO(-15), approvedBy: 'Marcus Tan', approvedAt: tISO(-14), history: [{ version: '1.0', at: tISO(-15), by: 'Grace Lim', note: 'Final report' }] }),
    mk({ name: 'Genset INS-2043 inspection report', kind: 'inspection_report', version: '1.0', status: 'Approved', owner: 'Dayang Nurul', companyId: 'big', siteId: 'twu', sizeKb: 250, updatedAt: tISO(-4), approvedBy: 'Marcus Tan', approvedAt: tISO(-3), history: [{ version: '1.0', at: tISO(-4), by: 'Dayang Nurul', note: 'Failed — 2 defects' }] }),
    mk({ name: 'Site HSE Plan — Samalaju', kind: 'policy', version: '1.2', status: 'Approved', owner: 'Azlan Mahmud', companyId: 'kcs', siteId: 'smh', sizeKb: 900, updatedAt: tISO(-40), approvedBy: 'Client rep', approvedAt: tISO(-38), history: [{ version: '1.2', at: tISO(-40), by: 'Azlan Mahmud', note: 'Client comments incorporated' }] }),
  ]
}
