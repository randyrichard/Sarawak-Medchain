/**
 * Go-live readiness: email, backups, demo accounts, the worker, the database role, MFA.
 * Exits 1 when anything is FAIL, so it can gate a deployment script.
 *
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/cli/goLive.js
 *
 * The checks and why each matters: lib/goLive.ts.
 */
import { PrismaClient } from '@prisma/client'
import { evaluate, gatherFacts } from '../lib/goLive.js'

const MARK = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' } as const

async function main() {
  const db = new PrismaClient()
  try {
    const checks = evaluate(await gatherFacts(db))
    console.log('\nSafeOps go-live readiness\n')
    for (const c of checks) {
      console.log(`  ${MARK[c.level]}  ${c.title}`)
      if (c.detail && c.level !== 'pass') console.log(`        ${c.detail}`)
    }
    const fails = checks.filter((c) => c.level === 'fail').length
    const warns = checks.filter((c) => c.level === 'warn').length
    console.log(`\n${fails} to fix, ${warns} to decide on.\n`)
    process.exitCode = fails > 0 ? 1 : 0
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exitCode = 2 })
