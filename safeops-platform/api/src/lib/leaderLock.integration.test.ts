import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { LOCK_SCHEDULER_SWEEP, LOCK_WEBHOOK_DELIVERY, withLeaderLock } from './leaderLock.js'
import { Scheduler } from './scheduler.js'

/**
 * One instance at a time, against a REAL PostgreSQL database.
 *
 * Advisory locks are a database feature; a mock would only test the mock. Two Prisma
 * clients stand in for two API replicas - separate connection pools, exactly as two
 * processes would have.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const replicaA = new PrismaClient()
const replicaB = new PrismaClient()

/** A promise the test resolves by hand, to hold a lock open for exactly as long as needed. */
function gate() {
  let open!: () => void
  const closed = new Promise<void>((r) => { open = r })
  return { closed, open }
}

// A key no other suite uses, so these tests never contend with a real scheduler lock.
const TEST_KEY = 0x5AFE0_7E57n

d('withLeaderLock — integration (real Postgres)', () => {
  afterAll(async () => {
    await replicaA.$disconnect()
    await replicaB.$disconnect()
  })

  it('lets one replica in and turns the other away while it holds the lock', async () => {
    const g = gate()
    let entered!: () => void
    const inside = new Promise<void>((r) => { entered = r })

    const first = withLeaderLock(replicaA, TEST_KEY, async () => { entered(); await g.closed; return 'A' })
    await inside

    const second = await withLeaderLock(replicaB, TEST_KEY, async () => 'B')
    expect(second).toEqual({ ran: false })

    g.open()
    expect(await first).toEqual({ ran: true, value: 'A' })
  })

  it('releases the lock when the holder finishes, so the next pass runs', async () => {
    await withLeaderLock(replicaA, TEST_KEY, async () => 'A')
    expect(await withLeaderLock(replicaB, TEST_KEY, async () => 'B')).toEqual({ ran: true, value: 'B' })
  })

  it('releases the lock when the holder throws', async () => {
    await expect(withLeaderLock(replicaA, TEST_KEY, async () => { throw new Error('sweep blew up') }))
      .rejects.toThrow('sweep blew up')
    expect(await withLeaderLock(replicaB, TEST_KEY, async () => 'B')).toEqual({ ran: true, value: 'B' })
  })

  it('keeps different jobs independent', async () => {
    const g = gate()
    let entered!: () => void
    const inside = new Promise<void>((r) => { entered = r })
    const holding = withLeaderLock(replicaA, TEST_KEY, async () => { entered(); await g.closed })
    await inside

    expect(await withLeaderLock(replicaB, TEST_KEY + 1n, async () => 'other')).toEqual({ ran: true, value: 'other' })

    g.open()
    await holding
  })

  it('makes a second scheduler skip the pass another replica is running', async () => {
    const g = gate()
    let entered!: () => void
    const inside = new Promise<void>((r) => { entered = r })
    // Replica A is mid-pass: it holds both scheduler locks.
    const holding = withLeaderLock(replicaA, LOCK_SCHEDULER_SWEEP, () =>
      withLeaderLock(replicaA, LOCK_WEBHOOK_DELIVERY, async () => { entered(); await g.closed }))
    await inside

    const b = new Scheduler(replicaB)
    expect(await b.sweepIfLeader()).toBeNull()
    expect(await b.deliverIfLeader()).toBeNull()

    g.open()
    await holding

    // Once A is done, B takes the next pass.
    expect(await b.deliverIfLeader()).not.toBeNull()
  })
})
