/**
 * Loads a year of operations at a realistic mid-size-customer volume, for measuring
 * behaviour under load. Point DATABASE_URL at a scratch database before running — this
 * writes tens of thousands of rows and is not meant for the working one.
 *
 *   DATABASE_URL=...safeops_migtest tsx scripts/load-scale.ts
 *
 * Volume is set to what a 3,000-person industrial group produces annually: roughly
 * 5,000 incident reports, 4,000 corrective actions, 1,500 permits, 900 assets on
 * recurring inspection, 300 audits and a certificate per person per required course.
 */
import { PrismaClient, type IncidentSeverity, type IncidentStage, type IncidentType } from '@prisma/client'

const db = new PrismaClient()
const COMPANY = 'big'
const DAY = 86400_000

const INCIDENTS = 5000
const ACTIONS = 4000
const PERMITS = 1500
const ASSETS = 900
const AUDITS = 300
const CERTS = 6000

const TYPES: IncidentType[] = ['near_miss', 'first_aid', 'mtc', 'unsafe_act', 'unsafe_condition', 'property_damage', 'environmental', 'vehicle']
const SEVERITIES: IncidentSeverity[] = ['Minor', 'Moderate', 'Serious', 'Critical']
const STAGES: IncidentStage[] = ['reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed']

const ago = (d: number) => new Date(Date.now() - d * DAY)
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

const sites = (await db.site.findMany({ where: { companyId: COMPANY }, select: { id: true } })).map((s) => s.id)
const employees = await db.employee.findMany({ where: { companyId: COMPANY }, select: { id: true } })
if (sites.length === 0) {
  console.error('Run the base seed first.')
  process.exit(1)
}
const site = (i: number) => sites[i % sites.length]

const t0 = Date.now()

// createMany is used throughout: one round trip per batch instead of per row, which is
// the difference between a minute and an hour at this volume.
console.log(`loading ${INCIDENTS} incidents…`)
await db.incident.createMany({
  data: Array.from({ length: INCIDENTS }, (_, i) => ({
    number: `INC-S${i}`,
    companyId: COMPANY,
    siteId: site(i),
    title: `Scale incident ${i}`,
    description: 'Generated for load measurement.',
    type: TYPES[i % TYPES.length],
    severity: SEVERITIES[i % SEVERITIES.length],
    stage: STAGES[i % STAGES.length],
    department: 'Production',
    location: `Area ${i % 40}`,
    reporter: `Reporter ${i % 60}`,
    highRisk: i % 25 === 0,
    occurredAt: ago(i % 365),
    reportedAt: ago(i % 365),
    closedAt: i % 8 === 7 ? ago((i % 365) - 5) : null,
  })),
})

console.log(`loading ${ACTIONS} corrective actions…`)
await db.correctiveAction.createMany({
  data: Array.from({ length: ACTIONS }, (_, i) => ({
    code: `CA-S${i}`,
    companyId: COMPANY,
    siteId: site(i),
    source: 'manual' as const,
    title: `Scale action ${i}`,
    owner: `Owner ${i % 60}`,
    dueDate: utcDay(new Date(Date.now() + ((i % 120) - 60) * DAY)),
    priority: (['High', 'Medium', 'Low'] as const)[i % 3],
    status: (['open', 'in_progress', 'completed', 'verified'] as const)[i % 4],
    createdBy: 'scale',
  })),
})

console.log(`loading ${PERMITS} permits…`)
await db.permit.createMany({
  data: Array.from({ length: PERMITS }, (_, i) => ({
    code: `PTW-S${i}`,
    companyId: COMPANY,
    siteId: site(i),
    type: (['hot_work', 'confined_space', 'working_at_height', 'lifting_operation'] as const)[i % 4],
    title: `Scale permit ${i}`,
    department: 'Maintenance',
    location: `Unit ${i % 30}`,
    applicant: `Applicant ${i % 40}`,
    validFrom: ago(i % 200),
    validTo: new Date(ago(i % 200).getTime() + 8 * 3600_000),
    status: (['draft', 'submitted', 'approved', 'active', 'closed'] as const)[i % 5],
    createdBy: 'scale',
  })),
})

console.log(`loading ${ASSETS} assets and their inspections…`)
await db.asset.createMany({
  data: Array.from({ length: ASSETS }, (_, i) => ({
    code: `AST-S${i}`,
    qrKey: `AST-S${i}`,
    companyId: COMPANY,
    siteId: site(i),
    name: `Scale asset ${i}`,
    category: (['forklift', 'ladder', 'machinery', 'fire_extinguisher', 'electrical_panel'] as const)[i % 5],
    serialNumber: `SN-S${i}`,
    department: 'Maintenance',
    owner: `Owner ${i % 60}`,
    location: `Bay ${i % 25}`,
    frequency: (['weekly', 'monthly', 'quarterly', 'annual'] as const)[i % 4],
    nextDueDate: utcDay(new Date(Date.now() + ((i % 90) - 30) * DAY)),
    lastInspectedAt: ago(i % 60),
    createdBy: 'scale',
  })),
})
const assetIds = (await db.asset.findMany({ where: { createdBy: 'scale' }, select: { id: true, siteId: true } }))
await db.inspection.createMany({
  data: assetIds.flatMap((a, i) => [
    { code: `INS-S${i}a`, assetId: a.id, companyId: COMPANY, siteId: a.siteId, scheduledFor: utcDay(new Date(Date.now() + (i % 60) * DAY)), assignedTo: `Owner ${i % 60}` },
    { code: `INS-S${i}b`, assetId: a.id, companyId: COMPANY, siteId: a.siteId, scheduledFor: utcDay(ago(i % 90)), assignedTo: `Owner ${i % 60}`, status: 'completed' as const, completedAt: ago(i % 90), completedBy: `Owner ${i % 60}`, outcome: (i % 9 === 0 ? 'failed' : 'passed') as 'failed' | 'passed' },
  ]),
})

console.log(`loading ${AUDITS} audits…`)
await db.audit.createMany({
  data: Array.from({ length: AUDITS }, (_, i) => ({
    code: `AUD-S${i}`,
    companyId: COMPANY,
    siteId: site(i),
    title: `Scale audit ${i}`,
    type: (['internal', 'dosh', 'contractor', 'environmental'] as const)[i % 4],
    department: 'Site-wide',
    leadAuditor: `Auditor ${i % 12}`,
    team: [],
    templateId: 'tpl-iso45001',
    scheduledFor: utcDay(new Date(Date.now() + ((i % 200) - 150) * DAY)),
    status: (['planned', 'in_progress', 'completed', 'closed'] as const)[i % 4],
    score: i % 4 >= 2 ? 70 + (i % 30) : null,
    completedAt: i % 4 >= 2 ? ago(i % 150) : null,
    createdBy: 'scale',
  })),
})

if (employees.length > 0) {
  console.log(`loading ${CERTS} certificates…`)
  await db.certificate.createMany({
    data: Array.from({ length: CERTS }, (_, i) => ({
      number: `CERT-SCALE-${i}`,
      qrKey: `CERT-SCALE-${i}`,
      employeeId: employees[i % employees.length].id,
      companyId: COMPANY,
      courseId: `trn-10${(i % 6) + 1}`,
      courseName: `Scale course ${(i % 6) + 1}`,
      issueDate: utcDay(ago(400 + (i % 200))),
      expiryDate: utcDay(new Date(Date.now() + ((i % 500) - 100) * DAY)),
      issuedBy: 'Scale loader',
      docName: 'scale',
    })),
  })
}

const totals = {
  incidents: await db.incident.count({ where: { companyId: COMPANY } }),
  actions: await db.correctiveAction.count({ where: { companyId: COMPANY } }),
  permits: await db.permit.count({ where: { companyId: COMPANY } }),
  assets: await db.asset.count({ where: { companyId: COMPANY } }),
  inspections: await db.inspection.count({ where: { companyId: COMPANY } }),
  audits: await db.audit.count({ where: { companyId: COMPANY } }),
  certificates: await db.certificate.count({ where: { companyId: COMPANY } }),
}
console.log(`\nloaded in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(totals))
await db.$disconnect()
