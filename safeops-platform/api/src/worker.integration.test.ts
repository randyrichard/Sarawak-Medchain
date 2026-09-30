import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * The worker as a real process, against a REAL PostgreSQL database.
 *
 * Its first version ran one pass and exited: the scheduler's timers are unref'd (so they
 * never hold an API open on shutdown) and the worker, unlike the API, has no HTTP server
 * to keep it alive. Every unit and integration test passed; only running it showed it.
 * This runs it.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

d('worker process', () => {
  it('keeps running after its first pass, and stops cleanly when told to', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', resolve(__dirname, 'worker.ts')], {
      env: { ...process.env, WORKER_DB_POOL_SIZE: '2' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (b) => { out += b })
    child.stderr.on('data', (b) => { out += b })
    const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)))

    // Long enough for startup and the first pass to finish.
    const early = await Promise.race([exited.then(() => 'exited'), new Promise((r) => setTimeout(() => r('alive'), 8_000))])
    expect(early, out).toBe('alive')
    expect(out).toContain('scheduler running')

    child.kill('SIGTERM')
    expect(await exited).toBe(0)
    expect(out).toMatch(/idle, stopping|stopping anyway/)
  }, 60_000)
})
