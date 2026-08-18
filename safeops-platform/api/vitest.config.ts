import { defineConfig } from 'vitest/config'

/**
 * Test harness configuration.
 *
 * This file exists because there wasn't one, and the default it was inheriting was wrong
 * for this suite.
 *
 * Vitest's default testTimeout is 5 seconds. That is a sensible budget for a unit test and
 * a badly wrong one here: a large part of this suite talks to a real PostgreSQL instance,
 * and a handful of tests spawn `npx tsx` and wait for a whole process to boot, validate its
 * environment and exit. Idle, those spawns take about three seconds. Under load - all 38
 * files running in parallel, or a Docker build happening alongside - a cold TypeScript
 * start comfortably doubles that and crosses the limit.
 *
 * The failure that produces is the worst kind: intermittent, unrelated to the code being
 * changed, and different files each run. It had already been patched three times by hand
 * with per-file `timeout:` options (grantPlatformAdmin, seedGuard, env.production), which
 * is the same fix applied one file at a time and only after that file had failed in front
 * of somebody. A pipeline that goes red for reasons nobody believes is a pipeline people
 * learn to re-run rather than read, and that is how a real failure gets waved through.
 *
 * Nothing here weakens a test. Not one assertion changes, and no failure is suppressed:
 * a test that is genuinely broken still fails, it just gets long enough to actually reach
 * its assertions first. The per-file overrides above are left where they are - they are
 * more specific than this and remain correct.
 */
export default defineConfig({
  test: {
    /*
     * 30s. Sized for the slowest legitimate case - a process spawn plus a cold Prisma
     * client against a real database - with room for a loaded CI runner, and still short
     * enough that a genuine hang is caught rather than blocking a run indefinitely.
     */
    testTimeout: 30_000,

    /*
     * Hooks get the same budget, and this is the half that was actually causing the
     * damage. Most of these suites open a Prisma connection and seed a tenant in
     * `beforeAll`; when that hook is killed the whole file is reported as failed with no
     * individual test named, which is why a run could show six failed files but only one
     * failed test. The five silent ones were hook timeouts.
     */
    hookTimeout: 30_000,

    /*
     * Teardown closes database connections. If it is cut short the process can be left
     * holding pool handles, which surfaces later as a connection-limit error in whichever
     * file happens to run next - a failure that points at innocent code.
     */
    teardownTimeout: 30_000,

    /*
     * One database, so one file at a time.
     *
     * Vitest runs test files in parallel by default. That is right when files are
     * independent, and wrong here: every integration suite shares a single PostgreSQL
     * instance, and several of the things under test are deliberately global. The
     * scheduler sweeps (`sweepCalibrations`, `sweepMaintenance` and the rest) scan every
     * company by design - that is what a scheduler does - and return a count of what they
     * raised.
     *
     * So a test asserting "sweeping twice raises nothing the second time" is only true if
     * no other file happens to create a lapsed asset in between. With files running
     * concurrently that is a race, and it fails as `expected 1 to be +0` in a file that
     * did nothing wrong. Confirmed rather than assumed: scheduler.integration.test.ts
     * fails inside a full parallel run and passes 37/37 on its own.
     *
     * This was invisible until recently. The integration suites skip themselves when
     * DATABASE_URL is unset, so a run without a database - which is what happens if you
     * forget to start one - skipped 140 tests and never had enough files touching Postgres
     * at once to collide.
     *
     * The alternative was giving every suite its own schema. That is the better answer for
     * a suite this size and worth doing later; it is a change to 38 files and their
     * fixtures, which is not a change to make on the way to a pilot deployment. Serialising
     * costs wall-clock time and buys determinism, and a suite that fails only sometimes is
     * worth less than a slower one that means what it says.
     */
    fileParallelism: false,
  },
})
