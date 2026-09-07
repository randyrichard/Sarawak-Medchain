/**
 * Open an account inside a customer workspace, or re-issue its password link.
 *
 * The gap this fills is the workspace half of the one `grantPlatformAdmin --create` fills
 * for platform staff. Every in-product path to a new workspace user - an invitation, an
 * administrator creating one - requires an administrator of that workspace to already be
 * signed in. So a deployment where the last admin password for a company has been lost has
 * no recovery path at all: the workspace, its incidents and its permits are all still
 * there, and nobody can open the door. That is not theoretical; it is what prompted this.
 *
 *   node dist/cli/createWorkspaceUser.js --company acme --email ali@acme.test \
 *     --name "Ali bin Hassan" --role employee
 *
 *   node dist/cli/createWorkspaceUser.js --company acme --email ali@acme.test --reset-link
 *
 * Lives under src/ rather than scripts/ for the same reason as grantPlatformAdmin: the
 * production runtime installs with --omit=dev and copies only dist/, so a tsx script in
 * scripts/ is neither present nor runnable on the machine that actually needs it.
 *
 * NO PASSWORD IS CHOSEN HERE, BY ANYBODY.
 *
 * The account is created with random bytes for a hash nothing can reproduce, and whoever
 * runs this is handed a single-use link to set their own. That is the same property the
 * bootstrap command keeps, and it matters for the same reason: the person who installs or
 * repairs SafeOps should not walk away holding a working credential for somebody else's
 * account. It also means this command is safe to run on a deployment holding real records -
 * it opens a door, it does not hand over a key to the existing ones.
 */
import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { PrismaClient, type Role } from '@prisma/client'
import { hashPassword } from '../lib/password.js'
import {
  generateResetToken, hashResetToken, resetTokenExpiry, RESET_TOKEN_TTL_MIN,
} from '../lib/tokens.js'
import { sendPasswordResetEmail } from '../lib/email/passwordResetDelivery.js'
import { linkOrSent } from '../lib/email/resetLink.js'

const db = new PrismaClient()

const ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']

const USAGE = 'Usage:\n'
  + '  node dist/cli/createWorkspaceUser.js --company <id> --email <address> \\\n'
  + '    --name "<full name>" --role <role>\n'
  + '\n'
  + 'Flags:\n'
  + '  --company <id>   the workspace to open the account in (required)\n'
  + '  --email <addr>   the account (required)\n'
  + '  --name "<name>"  how they appear on records they touch; defaults to the local part\n'
  + `  --role <role>    one of: ${ROLES.join(', ')}; defaults to employee\n`
  + '  --site <id>      restrict a supervisor or safety officer to one site; without it\n'
  + '                   they see the whole workspace, which is how the seeded managers are\n'
  + '  --reset-link     the account already exists: issue a fresh password link instead\n'
  + '\n'
  + 'Lists the workspaces on this deployment if --company is missing or unknown.'

/** `--flag value` off argv. Absent and value-less both read as undefined. */
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v.trim() : undefined
}

/**
 * Everything up to the next flag, joined.
 *
 * For `--name`, because a person's name has spaces in it and forgetting the quotes is the
 * easiest mistake to make while typing a recovery command. Reading only the next token
 * turned "Siti Aminah" into an account called "Siti" and said nothing - a silent
 * truncation of the field that appears on every record they touch. Caught by the tests,
 * which spawn through a shell and so drop the quoting the same way a hurried operator does.
 */
function flagWords(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const words: string[] = []
  for (let j = i + 1; j < process.argv.length; j += 1) {
    if (process.argv[j].startsWith('--')) break
    words.push(process.argv[j])
  }
  return words.length ? words.join(' ').trim() : undefined
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

const email = flag('email')?.toLowerCase()
const companyId = flag('company')
const roleArg = flag('role') ?? 'employee'
const siteId = flag('site')
const nameArg = flagWords('name')
const resetLink = process.argv.includes('--reset-link')

/**
 * Records the attempt where it survives log rotation.
 *
 * Lower-privilege than granting platform staff, and still worth keeping: this opens an
 * account inside a workspace holding a customer's incident and permit history, from a
 * shell, with no session behind it. "Who added this person, and when" has to be
 * answerable months later.
 *
 * Never records a password, a hash or a reset token - there is no password to record.
 */
async function audit(entry: {
  action: 'workspace_user_created' | 'workspace_user_reset_link'
  outcome: 'applied' | 'refused'
  targetEmail: string
  targetUserId?: string | null
  detail?: string
}) {
  try {
    await db.platformAuditEntry.create({
      data: {
        action: entry.action,
        outcome: entry.outcome,
        // Same reasoning as grantPlatformAdmin: run through `docker compose exec` there is
        // no USER and the hostname is a container id, so an unset actor says so plainly
        // rather than implying an identity it does not have.
        actor: process.env.SAFEOPS_AUDIT_ACTOR
          || process.env.USER
          || process.env.USERNAME
          || 'unattributed (set SAFEOPS_AUDIT_ACTOR)',
        actorHost: hostname(),
        source: 'cli',
        targetEmail: entry.targetEmail,
        targetUserId: entry.targetUserId ?? null,
        detail: entry.detail ?? null,
      },
    })
  } catch (e) {
    // An audit failure must not swallow the operation's own result.
    console.error(`WARNING: could not write the audit record: ${e instanceof Error ? e.message : e}`)
  }
}

/** Issues a reset token, superseding any unused one, and returns the raw token. */
async function issueToken(userId: string, issuedBy: string): Promise<string> {
  const token = generateResetToken()
  await db.$transaction(async (tx) => {
    // Supersede earlier links, so one found later in a scrollback is already dead.
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(token),
        expiresAt: resetTokenExpiry(),
        issuedBy,
      },
    })
  })
  return token
}

async function listCompanies(): Promise<string> {
  const rows = await db.company.findMany({
    select: { id: true, name: true, plan: true },
    orderBy: { name: 'asc' },
  })
  if (rows.length === 0) return '  (no workspaces exist on this deployment yet)'
  return rows.map((c) => `  ${c.id.padEnd(34)} ${c.name} (${c.plan})`).join('\n')
}

async function main() {
  if (!email || !EMAIL.test(email)) {
    console.error(`${email ? `"${email}" is not a valid email address.` : 'An --email is required.'}\n\n${USAGE}`)
    process.exitCode = 1
    return
  }
  if (!companyId) {
    console.error(`A --company is required. Workspaces on this deployment:\n\n${await listCompanies()}\n\n${USAGE}`)
    process.exitCode = 1
    return
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, status: true },
  })
  if (!company) {
    console.error(`No workspace with id "${companyId}". Workspaces on this deployment:\n\n${await listCompanies()}`)
    process.exitCode = 1
    return
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: {
      id: true, name: true, status: true, platformAdmin: true,
      memberships: { select: { companyId: true, role: true } },
    },
  })

  // ── Re-issue a link for an account that already exists ─────────────────────

  if (resetLink) {
    if (!existing) {
      console.error(`No account exists for ${email}. Drop --reset-link to open one.`)
      process.exitCode = 1
      return
    }
    if (existing.status !== 'active') {
      console.error(
        `Refusing: ${email} is ${existing.status}, so a link would be issued for an account\n`
        + 'that cannot sign in. Reactivate it in the console first.',
      )
      await audit({
        action: 'workspace_user_reset_link',
        outcome: 'refused',
        targetEmail: email,
        targetUserId: existing.id,
        detail: `account status is ${existing.status}`,
      })
      process.exitCode = 1
      return
    }

    const token = await issueToken(existing.id, 'cli:createWorkspaceUser --reset-link')
    await audit({
      action: 'workspace_user_reset_link',
      outcome: 'applied',
      targetEmail: email,
      targetUserId: existing.id,
      detail: 'password reset link issued from the server; earlier links invalidated',
    })
    const delivery = await sendPasswordResetEmail({
      token,
      recipientEmail: email,
      recipientName: existing.name,
      expiresInMinutes: RESET_TOKEN_TTL_MIN,
      issuedByAdmin: true,
      idempotencyKey: `safeops-wsreset-${existing.id}-${Date.now()}`,
    })
    console.log(
      `\nA new password link for ${existing.name} <${email}>:\n\n`
      + linkOrSent(delivery, token)
      + `\nIt expires in ${RESET_TOKEN_TTL_MIN} minutes, works once, and cancels any earlier\n`
      + 'link. Their existing password keeps working until this one is used.',
    )
    return
  }

  // ── Open a new account ─────────────────────────────────────────────────────

  /*
   * The other direction of grantPlatformAdmin's separation rule.
   *
   * That command refuses to make a workspace member into platform staff; this refuses to
   * put platform staff into a workspace. Both are needed, because the two can be acquired
   * in either order and guarding only one leaves the same person holding both - which
   * puts the customer console, listing every company on the deployment and their plans,
   * one screen-share away from inside a customer's own workspace.
   */
  if (existing?.platformAdmin) {
    console.error(
      `Refusing: ${email} is SafeOps platform staff.

A platform administrator sees every company on this deployment. An account holding both
that and a seat inside a customer workspace shows one customer the names of the others.
Use a separate address for the workspace account.`,
    )
    await audit({
      action: 'workspace_user_created',
      outcome: 'refused',
      targetEmail: email,
      targetUserId: existing.id,
      detail: 'account is a platform administrator; workspace membership refused',
    })
    process.exitCode = 1
    return
  }

  if (existing) {
    console.error(
      `${email} already exists${existing.memberships.length ? ` (${existing.memberships.map((m) => `${m.role} in ${m.companyId}`).join(', ')})` : ''}.\n\n`
      + 'To let them set a new password instead:\n'
      + `  node dist/cli/createWorkspaceUser.js --company ${companyId} --email ${email} --reset-link`,
    )
    process.exitCode = 1
    return
  }

  const role = roleArg as Role
  if (!ROLES.includes(role)) {
    console.error(`"${roleArg}" is not a role. One of: ${ROLES.join(', ')}`)
    process.exitCode = 1
    return
  }

  if (siteId) {
    const site = await db.site.findFirst({
      where: { id: siteId, companyId },
      select: { id: true },
    })
    if (!site) {
      const sites = await db.site.findMany({ where: { companyId }, select: { id: true, name: true } })
      console.error(
        `No site "${siteId}" in ${company.name}. Sites in this workspace:\n`
        + (sites.length ? sites.map((s) => `  ${s.id.padEnd(24)} ${s.name}`).join('\n') : '  (none)'),
      )
      process.exitCode = 1
      return
    }
  }

  const token = generateResetToken()
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: nameArg || email.split('@')[0],
        // Unusable by construction: random bytes, hashed, never printed and never known.
        // The account cannot be signed into until the link below is used.
        passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        status: 'active',
        /*
         * False, unlike the platform bootstrap. `mustChangePassword` is for an account
         * carrying a password somebody else chose - it locks the session to the
         * change-password screen until it is replaced. Nobody chose one here, and the
         * reset link is what sets the first password, so the flag would only add a second
         * forced change immediately after the first.
         */
        mustChangePassword: false,
      },
      select: { id: true, name: true },
    })
    await tx.membership.create({
      data: {
        userId: user.id,
        companyId,
        role,
        // Empty means organisation-wide, which is how the seeded managers are set up.
        siteIds: siteId ? [siteId] : [],
      },
    })
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: resetTokenExpiry(),
        issuedBy: 'cli:createWorkspaceUser',
      },
    })
    return user
  })

  console.log(JSON.stringify({
    t: new Date().toISOString(),
    event: 'workspace_user_created',
    email,
    userId: created.id,
    companyId,
    role,
  }))

  await audit({
    action: 'workspace_user_created',
    outcome: 'applied',
    targetEmail: email,
    targetUserId: created.id,
    detail: `${role} in ${companyId}${siteId ? ` scoped to site ${siteId}` : ''}; reset link issued`,
  })

  const delivery = await sendPasswordResetEmail({
    token,
    recipientEmail: email,
    recipientName: created.name,
    expiresInMinutes: RESET_TOKEN_TTL_MIN,
    issuedByAdmin: true,
    idempotencyKey: `safeops-wscreate-${created.id}-${Date.now()}`,
  })

  console.log(
    `\nOpened ${created.name} <${email}> as ${role} in ${company.name}.\n\n`
    + linkOrSent(delivery, token)
    + 'Nothing above is a password. The JSON line is a log record and the id in it is\n'
    + 'a database id; the link is the only way to set a password.\n'
    + `\nIt expires in ${RESET_TOKEN_TTL_MIN} minutes. Until it is used the account cannot be\n`
    + 'signed into, and nobody - including whoever ran this command - holds a working\n'
    + 'password for it.',
  )
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  // Not process.exit(): that terminates before the disconnect settles and before stdout has
  // necessarily flushed, which matters when the caller is reading the link out of the
  // output.
  .finally(() => db.$disconnect())
