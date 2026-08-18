import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * The demo seed must not run against a production database.
 *
 * It creates six accounts - one of them an administrator - that share a password committed
 * to this repository, and `npm run dev` runs it automatically. Pointed at a customer's
 * database by a stray NODE_ENV or a copied command, it would hand a full-access login to
 * anyone who has read the source.
 *
 * The guard is asserted by actually running the script, because a unit test of a copy of
 * the condition would keep passing after somebody moved or removed the real one. Nothing
 * here touches the database: the process is expected to exit before it connects.
 */
const seed = resolve(process.cwd(), 'prisma/seed.ts')
const demo = resolve(process.cwd(), 'prisma/demo.ts')

function run(script: string, env: Record<string, string | undefined>) {
  return spawnSync('npx', ['tsx', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60_000,
  })
}

const runSeed = (env: Record<string, string | undefined>) => run(seed, env)
const runDemo = (env: Record<string, string | undefined>) => run(demo, env)

/*
 * A longer per-test timeout than vitest's 5s default, because every test in this file
 * spawns `npx tsx` and waits for a real process.
 *
 * Idle, each takes about 3 seconds. Under load - a Docker build alongside, or the other
 * 36 suites running in parallel - a cold TypeScript start comfortably doubles that and
 * crosses 5s, so the harness killed tests that would have passed. Observed as roughly one
 * failure in three full-suite runs, which is exactly the kind of intermittently red
 * pipeline that teaches people to ignore CI.
 *
 * This changes no assertion. It only stops the runner giving up before the process does.
 */
const SPAWN_TIMEOUT = 30_000

describe('demo seed production guard', { timeout: SPAWN_TIMEOUT }, () => {
  it('refuses to run when NODE_ENV is production', () => {
    const r = runSeed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: undefined })

    expect(r.status).toBe(1)
    const said = `${r.stdout}${r.stderr}`
    expect(said).toMatch(/Refusing to seed/i)
    // The message has to explain the risk, or somebody will just set the override.
    expect(said).toMatch(/administrator/i)
    expect(said).toMatch(/SEED_ALLOW_PRODUCTION/)
  })

  it('names the override rather than making it a secret', () => {
    // A deliberate demo tenant on production infrastructure is a real use; it just has to
    // be an explicit act rather than an accident.
    const r = runSeed({ NODE_ENV: 'production' })
    expect(`${r.stdout}${r.stderr}`).toContain('SEED_ALLOW_PRODUCTION=yes')
  })

  it('does not leak the demo password in the refusal', () => {
    const r = runSeed({ NODE_ENV: 'production' })
    // The refusal is likely to end up in a deployment log.
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/SafeOpsPlatform/)
  })
})

describe('demo dataset production guard', { timeout: SPAWN_TIMEOUT }, () => {
  /*
   * Guarded for a sharper reason than the base seed. That one creates logins; this writes
   * a month of fabricated incidents, permits, audits and training records. In a system a
   * company keeps for regulatory reasons, invented safety records sit in the same register
   * an inspector reads.
   */
  it('refuses to run when NODE_ENV is production', () => {
    const r = runDemo({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: undefined })

    expect(r.status).toBe(1)
    const said = `${r.stdout}${r.stderr}`
    expect(said).toMatch(/Refusing to load the demo dataset/i)
    expect(said).toMatch(/SEED_ALLOW_PRODUCTION/)
  })

  it('explains why rather than only refusing', () => {
    // An operator who cannot see the risk will just set the override.
    const r = runDemo({ NODE_ENV: 'production' })
    expect(`${r.stdout}${r.stderr}`).toMatch(/fabricated|compliance/i)
  })

  it('does not leak the demo password in the refusal', () => {
    const r = runDemo({ NODE_ENV: 'production' })
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/SafeOpsPlatform/)
  })
})
