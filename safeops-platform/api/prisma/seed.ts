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
  { id: 'big', name: 'Borneo Industrial Group' },
  { id: 'kcs', name: 'Kuching Construction Services' },
]

const SITES = [
  { id: 'kch', companyId: 'big', name: 'Kuching Assembly Plant' },
  { id: 'btu', companyId: 'big', name: 'Bintulu LNG Terminal' },
  { id: 'mri', companyId: 'big', name: 'Miri Fabrication Yard' },
  { id: 'sbu', companyId: 'big', name: 'Sibu Logistics Hub' },
  { id: 'twu', companyId: 'big', name: 'Tawau Plantation Estate' },
  { id: 'sen', companyId: 'big', name: 'Senari Warehouse Complex' },
  { id: 'kcs-1', companyId: 'kcs', name: 'Kuching Central Project' },
  { id: 'pjy', companyId: 'kcs', name: 'Petra Jaya Township Project' },
  { id: 'smh', companyId: 'kcs', name: 'Samalaju Plant Expansion' },
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
    await prisma.company.upsert({ where: { id: c.id }, update: { name: c.name }, create: c })
  }
  for (const s of SITES) {
    await prisma.site.upsert({ where: { id: s.id }, update: { name: s.name }, create: s })
  }
  for (const e of EMPLOYEES) {
    await prisma.employee.upsert({
      where: { id: e.id },
      update: { name: e.name, position: e.position, department: e.department, siteId: e.siteId },
      create: e,
    })
  }
  console.log(
    `Seeded ${COMPANIES.length} companies, ${SITES.length} sites and ${EMPLOYEES.length} employees.`,
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
