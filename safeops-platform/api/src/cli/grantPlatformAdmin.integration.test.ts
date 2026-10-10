import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

/**
 * The only way a fresh deployment gets its first platform administrator.
 *
 * Nothing in the product grants this - it is cross-tenant access to every customer on the
 * deployment, so it is deliberately an operator act at the server. That makes this command
 * load-bearing for go-live, and its refusals matter more than its successes: the failure
 * that costs something is not "it did not work", it is "it worked on the wrong account".
 *
 * Run by spawning the real script, the way the operator runs it, so that exit codes and
 * the actual database effect are what is asserted. A unit test of a copy of the logic
 * would keep passing after somebody changed the real thing.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const cli = resolve(process.cwd(), 'src/cli/grantPlatformAdmin.ts')
const PREFIX = 'grantcli-itest'
const ACTIVE = `${PREFIX}-active@itest.local`
const DEACTIVATED = `${PREFIX}-deactivated@itest.local`

function run(...args: string[]) {
  const r = spawnSync('npx', ['tsx', cli, ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 90_000,
  })
  return { status: r.status, said: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const flagFor = (email: string) =>
  db.user.findUniqueOrThrow({ where: { email }, select: { platformAdmin: true } })
    .then((u) => u.platformAdmin)

async function purge() {
  await db.platformAuditEntry.deleteMany({ where: { targetEmail: { startsWith: PREFIX } } })
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

/** The durable audit rows this command left behind, oldest first. */
const auditFor = (email: string) =>
  db.platformAuditEntry.findMany({ where: { targetEmail: email }, orderBy: { at: 'asc' } })

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

d('grantPlatformAdmin', { timeout: SPAWN_TIMEOUT }, () => {
  beforeAll(purge)
  afterAll(async () => { await purge(); await db.$disconnect() })

  beforeEach(async () => {
    await purge()
    await db.user.createMany({
      data: [
        { email: ACTIVE, name: 'Active Operator', passwordHash: 'x', status: 'active' },
        { email: DEACTIVATED, name: 'Former Operator', passwordHash: 'x', status: 'deactivated' },
      ],
    })
  })

  it('grants to an active account and reports it', async () => {
    const r = run(ACTIVE)
    expect(r.status).toBe(0)
    expect(r.said).toMatch(/is now a SafeChain platform administrator/)
    expect(await flagFor(ACTIVE)).toBe(true)
  })

  it('refuses more than one address rather than picking one', async () => {
    /*
     * It used to take the first non-flag argument and ignore the rest. A shell that
     * expanded something unexpectedly, or a second address typed by habit, would hand
     * access to every customer on the deployment to an account nobody had looked at.
     */
    const r = run(ACTIVE, DEACTIVATED)
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/Refusing/i)
    expect(await flagFor(ACTIVE), 'nothing may be granted on an ambiguous command').toBe(false)
    expect(await flagFor(DEACTIVATED)).toBe(false)
  })

  it('refuses an account that is not active', async () => {
    // The flag would be set and still not work: platform authorization checks status on
    // every request. Silence here sends the operator hunting the wrong problem.
    const r = run(DEACTIVATED)
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/deactivated/i)
    expect(await flagFor(DEACTIVATED)).toBe(false)
  })

  it('still revokes from an account that is not active', async () => {
    /*
     * The asymmetry is deliberate. Refusing to *grant* to a disabled account prevents a
     * confusing no-op; refusing to *revoke* from one would mean a privilege that cannot be
     * taken away, which is the worse failure by far.
     */
    await db.user.update({ where: { email: DEACTIVATED }, data: { platformAdmin: true } })
    const r = run('--revoke', DEACTIVATED)
    expect(r.status).toBe(0)
    expect(await flagFor(DEACTIVATED)).toBe(false)
  })

  it('refuses an address with no account, and creates nothing', async () => {
    const missing = `${PREFIX}-nobody@itest.local`
    const r = run(missing)
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/No account exists/i)
    // Granting a privilege must never be a way to open an account.
    expect(await db.user.count({ where: { email: missing } })).toBe(0)
  })

  it('is safe to run twice and says nothing changed', async () => {
    expect(run(ACTIVE).status).toBe(0)
    const again = run(ACTIVE)
    expect(again.status).toBe(0)
    expect(again.said).toMatch(/No change/i)
    expect(await flagFor(ACTIVE)).toBe(true)
  })

  it('round-trips grant and revoke', async () => {
    run(ACTIVE)
    expect(await flagFor(ACTIVE)).toBe(true)
    const r = run('--revoke', ACTIVE)
    expect(r.status).toBe(0)
    expect(await flagFor(ACTIVE)).toBe(false)
  })

  it('prints usage and changes nothing when given no address', async () => {
    const r = run()
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/Usage/i)
    expect(await flagFor(ACTIVE)).toBe(false)
  })

  it('leaves a findable record of the grant', async () => {
    // There is no company to hang an audit entry from - AdminAuditEntry is tenant-scoped
    // by a foreign key - so the container log is where this has to be recoverable from.
    const r = run(ACTIVE)
    const line = r.said.split('\n').find((l) => l.includes('platform_admin_granted'))
    expect(line, 'the grant should be greppable in the logs').toBeTruthy()
    const parsed = JSON.parse(line!) as { event: string; email: string; t: string }
    expect(parsed.event).toBe('platform_admin_granted')
    expect(parsed.email).toBe(ACTIVE)
    expect(Number.isNaN(Date.parse(parsed.t))).toBe(false)
  })

  it('opens the first account on a deployment that has none', async () => {
    /*
     * The bootstrap dead end. A fresh production install has no users: there is no public
     * sign-up, the demo seed refuses to run against production, and provisioning a customer
     * needs a platform administrator that nothing can create. The only way through was
     * hand-written SQL - exactly what the rest of this work removed.
     */
    const fresh = `${PREFIX}-first@itest.local`
    const r = run('--create', fresh)
    expect(r.status).toBe(0)

    const user = await db.user.findUniqueOrThrow({
      where: { email: fresh },
      select: { id: true, platformAdmin: true, status: true, mustChangePassword: true },
    })
    expect(user.platformAdmin).toBe(true)
    expect(user.status).toBe('active')
    // Until they choose one, the account carries a password nobody knows.
    expect(user.mustChangePassword).toBe(true)

    // And a single-use link to set it, stored only as a hash.
    const reset = await db.passwordResetToken.findFirst({ where: { userId: user.id } })
    expect(reset).toBeTruthy()
    expect(reset!.usedAt).toBeNull()
    expect(reset!.tokenHash).toHaveLength(64)
  })

  it('hands over a link, never a password', async () => {
    /*
     * The property the whole product rests on: whoever installs SafeChain must not end up
     * holding a working credential for it. The hash is random bytes nothing can reproduce,
     * and the raw reset token is printed once and never stored.
     */
    const fresh = `${PREFIX}-nopass@itest.local`
    const r = run('--create', fresh)

    expect(r.said).toMatch(/reset-password\?token=/)
    expect(r.said).not.toMatch(/passwordHash|\$2[aby]\$/)

    const printed = r.said.match(/reset-password\?token=([A-Za-z0-9_%-]+)/)?.[1]
    expect(printed).toBeTruthy()
    // What is stored is the digest, not the secret that was shown.
    const stored = await db.passwordResetToken.findFirst({
      where: { user: { email: fresh } }, select: { tokenHash: true },
    })
    expect(stored!.tokenHash).not.toBe(printed)
  })

  it('prints a link the web app can actually open', async () => {
    /*
     * This shipped broken. The token was correct and the API accepted it, so testing the
     * token passed while the *link* opened a not-found page - the web route is
     * `/reset-password` with no path parameter, and the page reads `?token=`. On a fresh
     * deployment that is the only way the first administrator ever sets a password, so a
     * malformed URL there means the deployment cannot be used at all.
     *
     * Pinned against the route in web/src/app/App.tsx and the link the admin console
     * builds in UsersSection.tsx. If either moves, this has to move with it.
     */
    const fresh = `${PREFIX}-linkshape@itest.local`
    const r = run('--create', fresh)

    const url = r.said.split('\n').map((l) => l.trim()).find((l) => l.includes('/reset-password'))
    expect(url, 'a reset link should be printed').toBeTruthy()
    expect(url).toContain('/reset-password?token=')
    // The shape that was broken: the token as a path segment matches no route.
    expect(url).not.toMatch(/reset-password\/[A-Za-z0-9_-]/)
  })

  it('does not open a second account when one already exists', async () => {
    // A typo in an address would otherwise create a second superuser beside the intended
    // one, and both would work.
    const before = await db.user.count({ where: { email: { startsWith: PREFIX } } })
    const r = run('--create', ACTIVE)
    expect(r.status).toBe(0)
    expect(r.said).toMatch(/already exists/i)
    expect(await db.user.count({ where: { email: { startsWith: PREFIX } } })).toBe(before)
  })

  it('refuses --create on an address that is not an email', async () => {
    const r = run('--create', 'not-an-email')
    expect(r.status).toBe(1)
    expect(await db.user.count({ where: { email: 'not-an-email' } })).toBe(0)
  })

  it('points at --create rather than leaving the operator stuck', async () => {
    // The message is the whole fix for somebody meeting the dead end at 2am.
    const r = run(`${PREFIX}-missing@itest.local`)
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/--create/)
  })

  it('writes a durable audit row for a grant and a revoke', async () => {
    /*
     * A log line lasts until somebody rotates the logs. This is the act that hands one
     * account read access to every customer on the deployment, so "who made this person
     * staff, and when" has to be answerable months later.
     */
    run(ACTIVE)
    run('--revoke', ACTIVE)

    const rows = await auditFor(ACTIVE)
    expect(rows.map((r) => `${r.action}:${r.outcome}`)).toEqual([
      'platform_admin_granted:applied',
      'platform_admin_revoked:applied',
    ])
    // Enough to investigate with: who, from where, and against which account.
    expect(rows[0].actor).toBeTruthy()
    expect(rows[0].source).toBe('cli')
    expect(rows[0].targetUserId).toBeTruthy()
  })

  it('records a refused grant, not just the successful ones', async () => {
    // An attempt to make an account staff that was turned down is exactly what an
    // investigation wants to see; only logging successes hides the interesting half.
    run(DEACTIVATED)
    const rows = await auditFor(DEACTIVATED)
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome).toBe('refused')
    expect(rows[0].detail).toMatch(/deactivated/)
  })

  it('records an idempotent re-run as no_change rather than a second grant', async () => {
    // Otherwise the trail reads as two separate privilege escalations.
    run(ACTIVE)
    run(ACTIVE)
    const rows = await auditFor(ACTIVE)
    expect(rows.map((r) => r.outcome)).toEqual(['applied', 'no_change'])
  })

  it('never writes a password, hash or token into the audit trail', async () => {
    /*
     * The bootstrap path is the risky one: it mints a reset token and a password hash in
     * the same transaction, so a careless audit payload would put a live credential in a
     * table that exists to be read during investigations.
     */
    const fresh = `${PREFIX}-audit-secrets@itest.local`
    run('--create', fresh)

    const rows = await auditFor(fresh)
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('platform_admin_bootstrapped')

    const blob = JSON.stringify(rows).toLowerCase()
    for (const forbidden of ['passwordhash', '$2a$', '$2b$', '$2y$', 'token=']) {
      expect(blob, `audit row must not contain ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('keeps platform events out of the tenant-scoped audit table', async () => {
    /*
     * The reason this is its own table. AdminAuditEntry.companyId is a required foreign
     * key and every tenant screen filters on it; a platform grant belongs to no customer,
     * so putting it there would have meant making that column nullable and letting rows
     * with no tenant into the query path those screens use.
     */
    const before = await db.adminAuditEntry.count()
    run(ACTIVE)
    expect(await db.adminAuditEntry.count(), 'a platform grant must not touch tenant audit')
      .toBe(before)
    expect(await auditFor(ACTIVE)).toHaveLength(1)
  })

  it('issues a fresh link for an account that already exists', async () => {
    /*
     * The lockout this closes. A platform administrator belongs to no company, and the only
     * in-product reset is scoped to one - so the account that creates every customer had no
     * recovery path at all. Forgetting the password, or letting the 30-minute bootstrap
     * link lapse, meant deleting the row and starting again. That happened during this
     * work, which is why it is a test rather than a note.
     */
    const r = run('--reset-link', ACTIVE)
    expect(r.status).toBe(0)
    expect(r.said).toMatch(/reset-password\?token=/)

    const tokens = await db.passwordResetToken.findMany({ where: { user: { email: ACTIVE } } })
    expect(tokens).toHaveLength(1)
    expect(tokens[0].usedAt).toBeNull()
  })

  it('supersedes an earlier link rather than leaving two live', async () => {
    // Otherwise a link sitting in somebody's scrollback keeps working after a new one is
    // issued, which defeats re-issuing it.
    run('--reset-link', ACTIVE)
    run('--reset-link', ACTIVE)

    const tokens = await db.passwordResetToken.findMany({
      where: { user: { email: ACTIVE } }, orderBy: { createdAt: 'asc' },
    })
    expect(tokens).toHaveLength(2)
    expect(tokens[0].usedAt, 'the first link must be spent').not.toBeNull()
    expect(tokens[1].usedAt, 'the newest link must still work').toBeNull()
  })

  it('changes no privilege when it only issues a link', async () => {
    // Re-issuing a password link is account recovery, not a promotion.
    const before = await flagFor(ACTIVE)
    run('--reset-link', ACTIVE)
    expect(await flagFor(ACTIVE)).toBe(before)
  })

  it('refuses to issue a link for an account that cannot sign in', async () => {
    const r = run('--reset-link', DEACTIVATED)
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/deactivated/i)
    expect(await db.passwordResetToken.count({ where: { user: { email: DEACTIVATED } } })).toBe(0)
  })

  it('records the re-issue in the audit trail, without the token', async () => {
    const r = run('--reset-link', ACTIVE)
    const printed = r.said.match(/token=([A-Za-z0-9_%-]+)/)?.[1]
    expect(printed).toBeTruthy()

    const rows = await auditFor(ACTIVE)
    expect(rows.map((x) => x.action)).toContain('platform_admin_reset_link')
    // The link is a credential; the trail records that one was issued, never which one.
    expect(JSON.stringify(rows)).not.toContain(printed)
  })

  it('does not print anything that looks like a credential', async () => {
    // It reads a user row; a careless select plus a spread would put a password hash on
    // an operator's terminal and into their shell scrollback.
    const r = run(ACTIVE)
    expect(r.said).not.toMatch(/passwordHash|\$2[aby]\$|password/i)
  })
})
