import { afterAll, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Clears rate-limit counters before each test file.
 *
 * Needed because those counters became durable. They used to live in the API process's
 * memory, so every test file started with empty buckets whether it deserved to or not; now
 * they are rows in Postgres, which is the point — a limit that a restart resets is not a
 * limit — but it also means the suite accumulates its own hits and then throttles itself.
 *
 * Measured after one full run: `login:127.0.0.1` at 34 against a limit of 20, and
 * `reset:::ffff:127.0.0.1` at 29 against 15. Everything after that point in the run got a
 * 429 and failed on an assertion that had nothing to do with rate limiting. Worse, the rows
 * outlived the run, so a second pass started already over the limit and failed more tests
 * than the first — 9, then 16.
 *
 * Note what this does NOT do: it does not disable the limiter. Every request a test makes
 * still passes through it and still counts, so the middleware stays exercised and a bug in
 * it can still fail the suite. What is reset is the state carried in from *other* files and
 * *previous* runs, which is test isolation rather than a control being switched off. Turning
 * the limiter off under NODE_ENV=test would have been fewer lines and would have quietly
 * removed it from the path of every route test.
 *
 * Registered as a setupFile, so it runs once per test file rather than once per run — files
 * execute serially (see fileParallelism in vitest.config.ts) and each is entitled to a full
 * budget.
 */
const db = new PrismaClient()

beforeAll(async () => {
  // Integration suites skip themselves without a database; so does this.
  if (!process.env.DATABASE_URL) return
  try {
    await db.rateLimit.deleteMany({})
  } catch {
    // The table may not exist yet on a database that has not been migrated. That is the
    // migration's problem to report, not this hook's — failing here would mask it.
  }
})

afterAll(async () => {
  await db.$disconnect().catch(() => {})
})
