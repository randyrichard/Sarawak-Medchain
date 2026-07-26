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

async function main() {
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
