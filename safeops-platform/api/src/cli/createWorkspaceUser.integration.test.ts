import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { AccountService } from '../lib/accountService.js'
import { AuthService } from '../lib/authService.js'

/**
 * The only way back into a workspace whose last administrator password is gone.
 *
 * Every in-product path to a new workspace user needs an administrator of that workspace
 * already signed in, so losing the last one locks the door on records that are all still
 * there. `grantPlatformAdmin --create` solves exactly this for platform staff; this is the
 * workspace half, and it is load-bearing in the worst moment somebody will ever use it.
 *
 * Which is why the central test here is not "did it write a row". It is: run the command,
 * take the link out of its output, set a password through the ordinary reset flow, and
 * sign in. Anything short of that can pass while the account is unusable - and handing
 * somebody a recovery command that does not actually recover anything is worse than having
 * none, because they will trust it.
 *
 * Run by spawning the real script, the way an operator runs it, so exit codes and the
 * actual database effect are what is asserted.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const account = new AccountService(db)
const auth = new AuthService(db)
const cli = resolve(process.cwd(), 'src/cli/createWorkspaceUser.ts')

const PREFIX = 'wsuser-itest'
const CO = `${PREFIX}-co`
const OTHER_CO = `${PREFIX}-other`
const SITE = `${PREFIX}-site`
const STAFF = `${PREFIX}-staff@itest.local`
const PLATFORM = `${PREFIX}-platform@itest.local`

const ctx = { ip: '10.0.0.5', device: 'vitest', userAgent: 'vitest' }

function run(...args: string[]) {
  const r = spawnSync('npx', ['tsx', cli, ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 90_000,
  })
  return { status: r.status, said: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** The reset token out of the printed link, which is how an operator uses this. */
function tokenFrom(said: string): string {
  const m = said.match(/\/reset-password\?token=([A-Za-z0-9._~%-]+)/)
  expect(m, 'no reset link in the output').toBeTruthy()
  return decodeURIComponent(m![1])
}

async function purge() {
  await db.platformAuditEntry.deleteMany({ where: { targetEmail: { startsWith: PREFIX } } })
  await db.membership.deleteMany({ where: { companyId: { in: [CO, OTHER_CO] } } })
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

/*
 * Every test here spawns `npx tsx` and waits for a real process. Idle that is about three
 * seconds; under load a cold TypeScript start doubles it, which is well past vitest's 5s
 * default. Same reasoning as the sibling CLI's suite.
 */
const TIMEOUT = 90_000

d('createWorkspaceUser - integration (real Postgres, real process)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'WS User ITest Co'], [OTHER_CO, 'WS User ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    await db.site.upsert({
      where: { id: SITE }, update: {}, create: { id: SITE, companyId: CO, name: 'WS ITest Site' },
    })
    await purge()
  })

  afterAll(async () => {
    await purge()
    await db.site.deleteMany({ where: { id: SITE } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER_CO] } } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── The one that matters ───────────────────────────────────────────────────

  it('opens an account that can then actually be signed into', async () => {
    const r = run('--company', CO, '--email', STAFF, '--name', 'Siti Aminah', '--role', 'employee')
    expect(r.status, r.said).toBe(0)

    const user = await db.user.findUniqueOrThrow({
      where: { email: STAFF },
      select: { id: true, name: true, status: true, mustChangePassword: true, memberships: true },
    })
    expect(user.name).toBe('Siti Aminah')
    expect(user.status).toBe('active')
    // No forced change: nobody chose a password, so there is none to replace.
    expect(user.mustChangePassword).toBe(false)
    expect(user.memberships).toHaveLength(1)
    expect(user.memberships[0]).toMatchObject({ companyId: CO, role: 'employee', siteIds: [] })

    /*
     * The whole point. The password the operator never saw is set through the ordinary
     * reset flow, and the account then signs in - which is the claim the command's output
     * makes and the only one worth testing.
     */
    const chosen = 'ChosenByTheOperator123!'
    await account.redeemPasswordReset(tokenFrom(r.said), chosen)

    const session = await auth.login(STAFF, chosen, ctx)
    expect(session.user.email).toBe(STAFF)
    // Sign-in does not carry memberships; the session's role comes from them, so the
    // membership is asserted on the row above and its effect is what matters here.
    expect(session.user.mustChangePassword).toBe(false)
    expect(session.accessToken).toBeTruthy()
  }, TIMEOUT)

  it('leaves the account unusable until the link is redeemed', async () => {
    // The property that makes this safe to run on a deployment holding real records: the
    // operator opens a door without ending up holding a key.
    const r = run('--company', CO, '--email', STAFF, '--role', 'employee')
    expect(r.status, r.said).toBe(0)

    for (const guess of ['', 'password', 'ChosenByTheOperator123!', PREFIX]) {
      await expect(auth.login(STAFF, guess, ctx)).rejects.toBeTruthy()
    }
  }, TIMEOUT)

  it('prints a link the operator can use even when APP_PUBLIC_URL is not reachable', async () => {
    /*
     * A pilot box answering on localhost while APP_PUBLIC_URL names the eventual public
     * domain is the normal case. A link to a host that does not resolve is
     * indistinguishable from a broken token, so the bare path is printed too.
     */
    const r = run('--company', CO, '--email', STAFF, '--role', 'employee')
    expect(r.said).toContain('/reset-password?token=')
    expect(r.said).toMatch(/keep the path/i)
  }, TIMEOUT)

  // ── Scoping ────────────────────────────────────────────────────────────────

  it('scopes a supervisor to one site when asked, and workspace-wide when not', async () => {
    const scoped = run('--company', CO, '--email', STAFF, '--role', 'supervisor', '--site', SITE)
    expect(scoped.status, scoped.said).toBe(0)
    const a = await db.membership.findFirstOrThrow({ where: { companyId: CO } })
    expect(a).toMatchObject({ role: 'supervisor', siteIds: [SITE] })

    await purge()
    const wide = run('--company', CO, '--email', STAFF, '--role', 'supervisor')
    expect(wide.status, wide.said).toBe(0)
    const b = await db.membership.findFirstOrThrow({ where: { companyId: CO } })
    // Empty means organisation-wide, which is how the seeded managers are set up.
    expect(b.siteIds).toEqual([])
  }, TIMEOUT)

  // ── Refusals ───────────────────────────────────────────────────────────────

  it('lists the workspaces when none is given, rather than guessing', async () => {
    const r = run('--email', STAFF)
    expect(r.status).not.toBe(0)
    expect(r.said).toContain(CO)
    expect(r.said).toContain('WS User ITest Co')
  }, TIMEOUT)

  it('lists the workspaces when the one given does not exist', async () => {
    const r = run('--company', 'no-such-workspace', '--email', STAFF)
    expect(r.status).not.toBe(0)
    expect(r.said).toContain(CO)
    expect(await db.user.count({ where: { email: STAFF } })).toBe(0)
  }, TIMEOUT)

  it('refuses an address that is not one, and a role that is not one', async () => {
    expect(run('--company', CO, '--email', 'not-an-address').status).not.toBe(0)
    const badRole = run('--company', CO, '--email', STAFF, '--role', 'superintendent')
    expect(badRole.status).not.toBe(0)
    expect(badRole.said).toContain('safety_officer')
    expect(await db.user.count({ where: { email: STAFF } })).toBe(0)
  }, TIMEOUT)

  it('refuses a site from another workspace', async () => {
    // Otherwise the flag becomes a way to scope somebody to a site they cannot see, which
    // reads as an empty product rather than as a mistake.
    const r = run('--company', OTHER_CO, '--email', STAFF, '--role', 'supervisor', '--site', SITE)
    expect(r.status).not.toBe(0)
    expect(await db.user.count({ where: { email: STAFF } })).toBe(0)
  }, TIMEOUT)

  it('refuses to open an account that already exists, and says what to do instead', async () => {
    expect(run('--company', CO, '--email', STAFF, '--role', 'employee').status).toBe(0)
    const again = run('--company', CO, '--email', STAFF, '--role', 'admin')
    expect(again.status).not.toBe(0)
    expect(again.said).toContain('--reset-link')
    // And it did not quietly add a second, more powerful membership.
    expect(await db.membership.count({ where: { companyId: CO } })).toBe(1)
  }, TIMEOUT)

  it('refuses to put platform staff inside a customer workspace', async () => {
    /*
     * The other direction of grantPlatformAdmin's separation rule. An account holding both
     * sees the customer console - every company on the deployment - from inside one
     * customer's workspace, which is one screen-share away from showing them the others.
     */
    await db.user.create({
      data: {
        email: PLATFORM,
        name: 'Platform Staff',
        passwordHash: 'x',
        status: 'active',
        platformAdmin: true,
      },
    })
    const r = run('--company', CO, '--email', PLATFORM, '--role', 'admin')
    expect(r.status).not.toBe(0)
    expect(r.said).toMatch(/platform staff/i)
    expect(await db.membership.count({ where: { companyId: CO } })).toBe(0)

    const refusal = await db.platformAuditEntry.findFirstOrThrow({
      where: { targetEmail: PLATFORM }, orderBy: { at: 'desc' },
    })
    expect(refusal.outcome).toBe('refused')
  }, TIMEOUT)

  // ── Re-issuing a link ──────────────────────────────────────────────────────

  it('issues a fresh link for an existing account and kills the earlier one', async () => {
    const first = run('--company', CO, '--email', STAFF, '--role', 'employee')
    const firstToken = tokenFrom(first.said)

    const second = run('--company', CO, '--email', STAFF, '--reset-link')
    expect(second.status, second.said).toBe(0)
    const secondToken = tokenFrom(second.said)
    expect(secondToken).not.toBe(firstToken)

    // The superseded one is dead, so a link found later in a scrollback cannot be spent.
    await expect(account.redeemPasswordReset(firstToken, 'Whatever123!')).rejects.toBeTruthy()
    await expect(account.redeemPasswordReset(secondToken, 'Whatever123!')).resolves.toBeUndefined()
  }, TIMEOUT)

  it('refuses a link for an account that does not exist or cannot sign in', async () => {
    const missing = run('--company', CO, '--email', STAFF, '--reset-link')
    expect(missing.status).not.toBe(0)

    expect(run('--company', CO, '--email', STAFF, '--role', 'employee').status).toBe(0)
    await db.user.update({ where: { email: STAFF }, data: { status: 'deactivated' } })

    const deactivated = run('--company', CO, '--email', STAFF, '--reset-link')
    expect(deactivated.status).not.toBe(0)
    expect(deactivated.said).toMatch(/deactivated/i)
  }, TIMEOUT)

  // ── Audit ──────────────────────────────────────────────────────────────────

  it('records what it did, without recording the token', async () => {
    const r = run('--company', CO, '--email', STAFF, '--role', 'hse_manager')
    const token = tokenFrom(r.said)

    const entry = await db.platformAuditEntry.findFirstOrThrow({ where: { targetEmail: STAFF } })
    expect(entry.action).toBe('workspace_user_created')
    expect(entry.outcome).toBe('applied')
    expect(entry.detail).toContain('hse_manager')
    expect(entry.detail).toContain(CO)
    // An audit trail carrying working credentials is a second copy of the credential store.
    expect(JSON.stringify(entry)).not.toContain(token)
  }, TIMEOUT)
})
