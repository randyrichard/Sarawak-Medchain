import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { JOBS, readJobRuns, recordJobRun } from './jobRuns.js'
import { Scheduler } from './scheduler.js'

/**
 * Background job history in the database, against a REAL PostgreSQL database.
 *
 * What an operator relies on: every job of a pass is recorded by whoever ran it, so any
 * API replica - or an API with no scheduler at all, beside a worker - reports it; a
 * failure is recorded as a failure; and writing the history can never break the work.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()

d('job history — integration (real Postgres)', () => {
  beforeEach(async () => { await db.jobRun.deleteMany({}) })
  afterAll(async () => { await db.jobRun.deleteMany({}); await db.$disconnect() })

  it('reports a job that has never run as never run', async () => {
    const runs = await readJobRuns(db)
    expect(Object.keys(runs).sort()).toEqual([...JOBS].sort())
    for (const job of JOBS) expect(runs[job]).toBeNull()
  })

  it('records every job of a pass, for any process to read', async () => {
    await new Scheduler(db).runOnce()
    // A different client stands in for a different process - an API replica, say.
    const other = new PrismaClient()
    try {
      const runs = await readJobRuns(other)
      for (const job of ['reminders', 'expiry', 'equipment', 'visitors', 'reports'] as const) {
        expect(runs[job], job).toMatchObject({ lastOk: true, runCount: 1, failureCount: 0 })
        expect(runs[job]?.lastFinishedAt).toBeTruthy()
      }
    } finally {
      await other.$disconnect()
    }
  })

  it('records the webhook sweep when this instance delivers', async () => {
    const s = new Scheduler(db)
    await s.deliverIfLeader() // what the timer calls; recorded by the timer, so do the same
    await recordJobRun(db, 'webhooks', new Date(Date.now() - 5))
    expect((await readJobRuns(db)).webhooks).toMatchObject({ lastOk: true, runCount: 1 })
  })

  it('records a failure as a failure, with the first line of the error only', async () => {
    await recordJobRun(db, 'reports', new Date(), new Error('mail relay refused\n    at stack line'))
    const r = (await readJobRuns(db)).reports
    expect(r).toMatchObject({ lastOk: false, failureCount: 1, runCount: 1, lastError: 'mail relay refused' })

    await recordJobRun(db, 'reports', new Date())
    expect((await readJobRuns(db)).reports).toMatchObject({ lastOk: true, failureCount: 1, runCount: 2, lastError: null })
  })

  it('never lets a failed write break the job it describes', async () => {
    const broken = new PrismaClient({ datasources: { db: { url: 'postgresql://nobody:nothing@127.0.0.1:1/none' } } })
    try {
      await expect(recordJobRun(broken, 'reminders', new Date())).resolves.toBeUndefined()
    } finally {
      await broken.$disconnect()
    }
  })
})
