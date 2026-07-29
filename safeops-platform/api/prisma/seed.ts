import { PrismaClient, type Role } from '@prisma/client'
import { hashPassword } from '../src/lib/password.js'

/**
 * Seeds the demo workspace. Passwords are hashed with Argon2id here — the plaintext
 * exists only in this file as a known demo credential and is never stored.
 */
const prisma = new PrismaClient()

const DEMO_PASSWORD = 'SafeOpsPlatform2026'

const USERS: { email: string; name: string; title: string; role: Role; companies: string[] }[] = [
  { email: 'ceo@demo.safeops.app', name: 'Faridah Abdullah', title: 'Group Managing Director', role: 'ceo', companies: ['big', 'kcs'] },
  { email: 'admin@demo.safeops.app', name: 'Randy Richard', title: 'Platform Administrator', role: 'admin', companies: ['big', 'kcs'] },
  { email: 'hse@demo.safeops.app', name: 'Marcus Tan', title: 'Group HSE Manager', role: 'hse_manager', companies: ['big'] },
  { email: 'officer@demo.safeops.app', name: 'Amirul Hassan', title: 'Site Safety Officer — Bintulu', role: 'safety_officer', companies: ['big'] },
  { email: 'supervisor@demo.safeops.app', name: 'Ganesh Pillai', title: 'Maintenance Supervisor — Kuching', role: 'supervisor', companies: ['big'] },
  { email: 'employee@demo.safeops.app', name: 'Melissa Bong', title: 'Store Keeper — Kuching', role: 'employee', companies: ['big'] },
]


const COMPANIES = [
  { id: 'big', name: 'Borneo Industrial Group', industry: 'Diversified Industrial', plan: 'enterprise', logoInitials: 'BI' },
  { id: 'kcs', name: 'Kenyalang Construction Sdn Bhd', industry: 'Construction', plan: 'standard', logoInitials: 'KC' },
]

const SITES = [
  { id: 'kch', companyId: 'big', name: 'Kuching Assembly Plant', short: 'Kuching', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 1240 },
  { id: 'btu', companyId: 'big', name: 'Bintulu LNG Terminal', short: 'Bintulu', city: 'Bintulu', timezone: 'Asia/Kuching', headcount: 860 },
  { id: 'mri', companyId: 'big', name: 'Miri Fabrication Yard', short: 'Miri', city: 'Miri', timezone: 'Asia/Kuching', headcount: 620 },
  { id: 'sbu', companyId: 'big', name: 'Sibu Logistics Hub', short: 'Sibu', city: 'Sibu', timezone: 'Asia/Kuching', headcount: 430 },
  { id: 'twu', companyId: 'big', name: 'Tawau Plantation Estate', short: 'Tawau', city: 'Tawau', timezone: 'Asia/Kuching', headcount: 980 },
  { id: 'sen', companyId: 'big', name: 'Senari Warehouse Complex', short: 'Senari', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 310 },
  { id: 'kcs-1', companyId: 'kcs', name: 'Kuching Central Project', short: 'Central', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 220 },
  { id: 'pjy', companyId: 'kcs', name: 'Petra Jaya Township Project', short: 'Petra Jaya', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 480 },
  { id: 'smh', companyId: 'kcs', name: 'Samalaju Plant Expansion', short: 'Samalaju', city: 'Bintulu', timezone: 'Asia/Kuching', headcount: 350 },
]

const DEPARTMENTS = [
  { id: 'kch-prod', siteId: 'kch', name: 'Production' },
  { id: 'kch-mnt', siteId: 'kch', name: 'Maintenance' },
  { id: 'kch-whs', siteId: 'kch', name: 'Warehouse & Stores' },
  { id: 'btu-ops', siteId: 'btu', name: 'Field Operations' },
  { id: 'btu-mnt', siteId: 'btu', name: 'Maintenance' },
  { id: 'btu-hse', siteId: 'btu', name: 'HSE' },
  { id: 'mri-fab', siteId: 'mri', name: 'Fabrication' },
  { id: 'mri-ctr', siteId: 'mri', name: 'Contractors' },
  { id: 'sbu-log', siteId: 'sbu', name: 'Logistics & Transport' },
  { id: 'twu-fld', siteId: 'twu', name: 'Field Operations' },
  { id: 'twu-mil', siteId: 'twu', name: 'Mill' },
  { id: 'sen-whs', siteId: 'sen', name: 'Warehouse' },
  { id: 'pjy-civ', siteId: 'pjy', name: 'Civil Works' },
  { id: 'smh-mep', siteId: 'smh', name: 'M&E Installation' },
]

const TEAMS = [
  { id: 't1', departmentId: 'kch-prod', name: 'Line 1 (Day)', lead: 'Sarah Wong' },
  { id: 't2', departmentId: 'kch-prod', name: 'Line 2 (Night)', lead: 'Jason Ngu' },
  { id: 't3', departmentId: 'kch-mnt', name: 'Mechanical', lead: 'Ganesh Pillai' },
  { id: 't4', departmentId: 'btu-ops', name: 'Jetty & Loading', lead: 'Rashid Karim' },
  { id: 't5', departmentId: 'btu-mnt', name: 'Rotating Equipment', lead: 'Faizal Omar' },
  { id: 't6', departmentId: 'mri-ctr', name: 'Scaffolding Crew A', lead: 'Vincent Chai' },
  { id: 't7', departmentId: 'twu-fld', name: 'Harvest Block 12-16', lead: 'Dayang Nurul' },
  { id: 't8', departmentId: 'sen-whs', name: 'Inbound Shift', lead: 'Grace Lim' },
]

/**
 * The workforce. Training hangs off real people, so the roster is seeded rather than
 * living in the browser. `department` is the resolved name because course applicability
 * matches on it — departments become their own table with the organisation migration.
 */
const EMPLOYEES: {
  id: string; companyId: string; siteId: string; departmentId: string
  department: string; name: string; position: string
}[] = [
  { id: 'e01', companyId: 'big', siteId: 'kch', departmentId: 'kch-prod', department: 'Production', name: 'Sarah Wong', position: 'Production Supervisor' },
  { id: 'e02', companyId: 'big', siteId: 'kch', departmentId: 'kch-prod', department: 'Production', name: 'Jason Ngu', position: 'Shift Supervisor' },
  { id: 'e03', companyId: 'big', siteId: 'kch', departmentId: 'kch-mnt', department: 'Maintenance', name: 'Ganesh Pillai', position: 'Maintenance Supervisor' },
  { id: 'e04', companyId: 'big', siteId: 'btu', departmentId: 'btu-ops', department: 'Field Operations', name: 'Rashid Karim', position: 'Loading Master' },
  { id: 'e05', companyId: 'big', siteId: 'btu', departmentId: 'btu-mnt', department: 'Maintenance', name: 'Faizal Omar', position: 'Rotating Equipment Engineer' },
  { id: 'e06', companyId: 'big', siteId: 'btu', departmentId: 'btu-hse', department: 'HSE', name: 'Amirul Hassan', position: 'Site Safety Officer' },
  { id: 'e07', companyId: 'big', siteId: 'mri', departmentId: 'mri-ctr', department: 'Contractors', name: 'Vincent Chai', position: 'Contracts HSE Coordinator' },
  { id: 'e08', companyId: 'big', siteId: 'twu', departmentId: 'twu-fld', department: 'Field Operations', name: 'Dayang Nurul', position: 'Estate Safety Officer' },
  { id: 'e09', companyId: 'big', siteId: 'sen', departmentId: 'sen-whs', department: 'Warehouse', name: 'Grace Lim', position: 'Warehouse Safety Officer' },
  { id: 'e10', companyId: 'big', siteId: 'kch', departmentId: 'kch-whs', department: 'Warehouse & Stores', name: 'Melissa Bong', position: 'Store Keeper' },
  { id: 'e11', companyId: 'kcs', siteId: 'pjy', departmentId: 'pjy-civ', department: 'Civil Works', name: 'Azlan Mahmud', position: 'Site Agent' },
  { id: 'e12', companyId: 'kcs', siteId: 'smh', departmentId: 'smh-mep', department: 'M&E Installation', name: 'Lau Tze Ming', position: 'M&E Supervisor' },
  { id: 'e13', companyId: 'big', siteId: 'kch', departmentId: 'kch-prod', department: 'Production', name: 'Rosli Ahmad', position: 'Machine Operator' },
  { id: 'e14', companyId: 'big', siteId: 'kch', departmentId: 'kch-mnt', department: 'Maintenance', name: 'Kenny Lau', position: 'Maintenance Technician' },
  { id: 'e15', companyId: 'big', siteId: 'sen', departmentId: 'sen-whs', department: 'Warehouse', name: 'Siti Aminah', position: 'Forklift Operator' },
  { id: 'e16', companyId: 'big', siteId: 'sen', departmentId: 'sen-whs', department: 'Warehouse', name: 'Bong Chin Hui', position: 'Forklift Operator' },
  { id: 'e17', companyId: 'big', siteId: 'btu', departmentId: 'btu-ops', department: 'Field Operations', name: 'Hafiz Rahman', position: 'Process Technician' },
  { id: 'e18', companyId: 'big', siteId: 'btu', departmentId: 'btu-hse', department: 'HSE', name: 'Nurul Izzah', position: 'Emergency Response Lead' },
  { id: 'e19', companyId: 'big', siteId: 'mri', departmentId: 'mri-ctr', department: 'Contractors', name: 'Kumar Raj', position: 'Scaffolder' },
  { id: 'e20', companyId: 'big', siteId: 'twu', departmentId: 'twu-mil', department: 'Mill', name: 'Lim Boon Keat', position: 'Mill Operator' },
]

async function seedOrg() {
  for (const c of COMPANIES) {
    await prisma.company.upsert({ where: { id: c.id }, update: c, create: c })
  }
  for (const s of SITES) {
    await prisma.site.upsert({ where: { id: s.id }, update: s, create: s })
  }
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { id: d.id }, update: { name: d.name }, create: d })
  }
  for (const t of TEAMS) {
    await prisma.team.upsert({ where: { id: t.id }, update: { name: t.name, lead: t.lead }, create: t })
  }
  for (const e of EMPLOYEES) {
    await prisma.employee.upsert({
      where: { id: e.id },
      update: { name: e.name, position: e.position, department: e.department, siteId: e.siteId },
      create: e,
    })
  }
  console.log(
    `Seeded ${COMPANIES.length} companies, ${SITES.length} sites, ${DEPARTMENTS.length} departments, ` +
      `${TEAMS.length} teams and ${EMPLOYEES.length} employees.`,
  )
}

async function main() {
  await seedOrg()

  const passwordHash = await hashPassword(DEMO_PASSWORD)

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, title: u.title },
      create: { email: u.email, name: u.name, title: u.title, passwordHash, status: 'active' },
    })

    for (const companyId of u.companies) {
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId } },
        update: { role: u.role },
        create: { userId: user.id, companyId, role: u.role, siteIds: [] },
      })
    }
  }

  console.log(`Seeded ${USERS.length} demo users (Argon2id hashed).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
