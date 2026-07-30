/**
 * Exercises the in-app backup and restore, and reports exactly what it covers.
 *
 * The drill: census the workspace, take a restore point, damage the data the way a bad
 * import would, restore, and census again. Anything that does not come back is a gap in
 * the snapshot — and the point of running this is to know precisely where those gaps are
 * before a customer finds one, not to produce a reassuring "restore succeeded".
 *
 *   tsx scripts/backup-restore-drill.ts
 */
import { PrismaClient } from '@prisma/client'
import { AdminService } from '../src/lib/adminService.js'
import type { Caller } from '../src/lib/incidentService.js'

const db = new PrismaClient()
const admin = new AdminService(db)

const COMPANY = 'big'
const caller: Caller = {
  userId: 'drill', name: 'Restore Drill',
  roles: [{ companyId: COMPANY, role: 'admin', siteIds: [] }],
}
const ctx = { ip: '127.0.0.1', device: 'drill' }

/** The entities the checklist asks about, counted for this workspace. */
const census = async () => ({
  users: await db.membership.count({ where: { companyId: COMPANY } }),
  companies: await db.company.count({ where: { id: COMPANY } }),
  sites: await db.site.count({ where: { companyId: COMPANY } }),
  employees: await db.employee.count({ where: { companyId: COMPANY } }),
  incidents: await db.incident.count({ where: { companyId: COMPANY } }),
  incidentEvents: await db.incidentEvent.count({ where: { incident: { companyId: COMPANY } } }),
  actions: await db.correctiveAction.count({ where: { companyId: COMPANY } }),
  permits: await db.permit.count({ where: { companyId: COMPANY } }),
  permitControls: await db.permitControl.count({ where: { permit: { companyId: COMPANY } } }),
  assets: await db.asset.count({ where: { companyId: COMPANY } }),
  inspections: await db.inspection.count({ where: { companyId: COMPANY } }),
  audits: await db.audit.count({ where: { companyId: COMPANY } }),
  auditFindings: await db.auditFinding.count({ where: { audit: { companyId: COMPANY } } }),
  obligations: await db.complianceObligation.count({ where: { companyId: COMPANY } }),
  documents: await db.complianceDocument.count({ where: { companyId: COMPANY } }),
  certificates: await db.certificate.count({ where: { companyId: COMPANY } }),
  trainingSessions: await db.trainingSession.count({ where: { companyId: COMPANY } }),
  notifications: await db.notification.count({ where: { companyId: COMPANY } }),
  activity: await db.adminAuditEntry.count({ where: { companyId: COMPANY } }),
})

type Census = Awaited<ReturnType<typeof census>>

const table = (before: Census, after: Census, label: string) => {
  console.log(`\nentity              before   ${label.padEnd(8)} verdict`)
  console.log('─'.repeat(56))
  const gaps: string[] = []
  for (const k of Object.keys(before) as (keyof Census)[]) {
    const b = before[k]
    const a = after[k]
    const verdict = a === b ? 'identical' : a < b ? `NOT RESTORED (-${b - a})` : `+${a - b}`
    if (a < b) gaps.push(`${k} (-${b - a})`)
    console.log(`${k.padEnd(20)} ${String(b).padStart(5)}   ${String(a).padStart(6)}   ${verdict}`)
  }
  return gaps
}

console.log('SafeOps backup / restore drill\n')

const before = await census()
console.log('Taking a restore point…')
const { backup } = await admin.createBackup(caller, COMPANY, ctx, 'Restore drill')
console.log(`  ${backup.id} · ${backup.sizeKb} kB · ${backup.note}`)

// Damage the workspace the way a bad bulk edit would: delete a slice of every module the
// snapshot claims to cover.
console.log('\nDamaging the workspace…')
const victims = {
  incidents: (await db.incident.findMany({ where: { companyId: COMPANY }, take: 5, select: { id: true } })).map((r) => r.id),
  permits: (await db.permit.findMany({ where: { companyId: COMPANY }, take: 3, select: { id: true } })).map((r) => r.id),
  assets: (await db.asset.findMany({ where: { companyId: COMPANY }, take: 4, select: { id: true } })).map((r) => r.id),
  audits: (await db.audit.findMany({ where: { companyId: COMPANY }, take: 2, select: { id: true } })).map((r) => r.id),
  certificates: (await db.certificate.findMany({ where: { companyId: COMPANY }, take: 10, select: { id: true } })).map((r) => r.id),
}
// Children first where the relation does not cascade from the parent being deleted.
await db.auditFinding.deleteMany({ where: { auditId: { in: victims.audits } } })
await db.correctiveAction.deleteMany({ where: { incidentId: { in: victims.incidents } } })
await db.incident.deleteMany({ where: { id: { in: victims.incidents } } })
await db.permit.deleteMany({ where: { id: { in: victims.permits } } })
await db.asset.deleteMany({ where: { id: { in: victims.assets } } })
await db.audit.deleteMany({ where: { id: { in: victims.audits } } })
await db.certificate.deleteMany({ where: { id: { in: victims.certificates } } })

const damaged = await census()
table(before, damaged, 'damaged')

console.log('\nRestoring…')
const result = await admin.restoreBackup(caller, COMPANY, ctx, backup.id)
console.log(`  ${JSON.stringify(result)}`)

const after = await census()
const gaps = table(before, after, 'restored')

console.log('\n' + '─'.repeat(56))
if (gaps.length === 0) {
  console.log('Everything counted above came back.')
} else {
  console.log(`NOT COVERED BY THE SNAPSHOT: ${gaps.join(' · ')}`)
  console.log('These need pg_dump, not the in-app restore point.')
}

await db.$disconnect()
