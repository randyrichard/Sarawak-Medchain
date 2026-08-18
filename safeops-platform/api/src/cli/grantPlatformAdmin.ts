/**
 * Grant or revoke SafeOps platform administrator.
 *
 * Deliberately a command run by whoever holds the server, not a screen in the product.
 * Platform administrators can create customers and see every company on the deployment;
 * nobody inside a customer's workspace should be able to grant that, and there is no
 * in-product path that does. Bootstrapping a superuser is an operator act, and this makes
 * it a deliberate one that leaves a shell history entry.
 *
 *   npm run platform:grant  -- someone@yourcompany.com
 *   npm run platform:revoke -- someone@yourcompany.com
 *
 * Lives under src/ rather than scripts/ because it has to exist in the deployed image: the
 * production runtime installs with --omit=dev and copies only dist/, so a tsx script in
 * scripts/ is neither present nor runnable there. Without it a fresh deployment has no way
 * to create its first platform administrator, and therefore no way to create its first
 * customer at all. In production it is run directly:
 *
 *   node dist/cli/grantPlatformAdmin.js someone@yourcompany.com
 *   node dist/cli/grantPlatformAdmin.js --revoke someone@yourcompany.com
 */
import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { hashPassword } from '../lib/password.js'
import { generateResetToken, hashResetToken, resetTokenExpiry, RESET_TOKEN_TTL_MIN } from '../lib/tokens.js'

const db = new PrismaClient()

const USAGE = 'Usage:\n'
  + '  npm run platform:grant -- someone@yourcompany.com        (development)\n'
  + '  node dist/cli/grantPlatformAdmin.js someone@example.com  (deployed image)\n'
  + '\n'
  + 'Flags:\n'
  + '  --create      open the account as well, for the very first administrator on a fresh\n'
  + '                deployment where no account exists yet\n'
  + '  --reset-link  issue a fresh password link for an account that already exists, for\n'
  + '                when the last one expired or the password was forgotten\n'
  + '  --revoke      remove the privilege\n'
  + '\n'
  + 'Exactly one email address.'

const args = process.argv.slice(2)
// Everything that is not a flag. Collected rather than picked, so that more than one
// address is an error instead of a silent choice - see below.
const addresses = args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase())
const revoke = args.includes('--revoke')
const create = args.includes('--create')
const resetLink = args.includes('--reset-link')

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/**
 * Records the attempt where it survives.
 *
 * A log line is fine until somebody rotates the logs, and this is the highest-privilege
 * act on the deployment: it hands one account read access to every customer. "Who made
 * this person staff, and when" has to be answerable months later, so it goes in a table.
 *
 * There is no session to attribute this to - it is an operator at the server - so the
 * identity recorded is the OS user and host, which is the truth rather than a guess.
 * Refusals are recorded too: an attempt to grant access that was turned down is exactly
 * the kind of thing an investigation wants to see.
 *
 * Never records a password, a hash or a reset token.
 */
async function audit(entry: {
  action: 'platform_admin_granted' | 'platform_admin_revoked'
    | 'platform_admin_bootstrapped' | 'platform_admin_reset_link'
  outcome: 'applied' | 'no_change' | 'refused'
  targetEmail: string
  targetUserId?: string | null
  detail?: string
}) {
  try {
    await db.platformAuditEntry.create({
      data: {
        action: entry.action,
        outcome: entry.outcome,
        /*
         * SAFEOPS_AUDIT_ACTOR first, because the usual answer is useless.
         *
         * Run through `docker compose exec` there is no USER in the container and the
         * hostname is a container id, so the row said "unknown@24360c756813" - true, and
         * no help at all to somebody asking who made this account staff. The operator can
         * name themselves; when they have not, the record says so plainly rather than
         * implying an identity it does not have.
         */
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
    /*
     * An audit failure must not swallow the operation's own result. If the row cannot be
     * written the privilege change still happened, and hiding that behind a crash would
     * leave the operator with no idea what state they are in - so this is reported loudly
     * and the command continues to its normal exit.
     */
    console.error(`WARNING: could not write the audit record: ${e instanceof Error ? e.message : e}`)
  }
}

/**
 * Opens the very first account on a deployment that has none.
 *
 * Without this a fresh production install is a closed loop: provisioning a customer needs a
 * platform administrator, granting that needs an account, and nothing in production creates
 * one - there is no public sign-up, and the demo seed refuses to run against production, as
 * it should. The only way through was hand-written SQL, which is exactly what the rest of
 * this work removed.
 *
 * No password is chosen here, by anybody. The account is created with random bytes for a
 * hash that nothing can produce, and the operator is handed a single-use reset link to set
 * their own. That keeps the property the whole product depends on: whoever installs SafeOps
 * does not end up holding a working credential.
 */
async function createFirstAdmin(email: string) {
  if (!EMAIL.test(email)) {
    console.error(`"${email}" is not a valid email address.`)
    process.exitCode = 1
    return
  }

  const token = generateResetToken()
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: email.split('@')[0],
        // Unusable by construction: random bytes, hashed, never printed and never known.
        passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        status: 'active',
        mustChangePassword: true,
        platformAdmin: !revoke,
      },
      select: { id: true, email: true },
    })
    await tx.passwordResetToken.create({
      data: {
        userId: created.id,
        tokenHash: hashResetToken(token),
        expiresAt: resetTokenExpiry(),
        // No caller to attribute this to - it is the first account on the deployment.
        issuedBy: 'cli:grantPlatformAdmin',
      },
    })
    return created
  })

  console.log(JSON.stringify({
    t: new Date().toISOString(),
    event: 'platform_admin_bootstrapped',
    email,
    userId: user.id,
  }))

  await audit({
    action: 'platform_admin_bootstrapped',
    outcome: 'applied',
    targetEmail: email,
    targetUserId: user.id,
    detail: 'account opened and granted platform administrator; reset link issued',
  })
  /*
   * The token goes in the query string, not the path.
   *
   * The web app's route is `/reset-password` with no parameter - the page reads
   * `?token=`, and the admin console builds its links the same way. Printed as
   * `/reset-password/<token>` this matched no route at all, so the one link that lets a
   * fresh deployment's first administrator set a password opened a not-found page and the
   * account could never be used. The token itself was fine, which is exactly why testing
   * it against the API missed this: what needed checking was the URL.
   */
  console.log(
    `\nCreated ${email} as a SafeOps platform administrator.\n\n`
    + 'Set a password with this single-use link:\n\n'
    + `  ${env.appUrl}/reset-password?token=${encodeURIComponent(token)}\n\n`
    + `It expires in ${RESET_TOKEN_TTL_MIN} minutes and is shown once. Nobody, including\n`
    + 'whoever ran this command, holds a working password for the account until it is used.',
  )
}

/**
 * Issues a fresh password link for an account that already exists.
 *
 * The lockout this exists to end: a platform administrator belongs to no company, and the
 * only in-product way to issue a reset is `adminService.resetPassword`, which is scoped to
 * a company and requires an admin of it. So the one account that can create customers had
 * no recovery path at all - forget the password, or let the 30-minute bootstrap link
 * lapse, and the only way back was deleting the row and starting again. That is not a
 * theoretical corner: it happened during this work.
 *
 * Whoever runs this already holds the server, so there is nothing to deliver: the link is
 * printed for them to open. It supersedes any earlier unused link, mirroring what the
 * customer-facing reset does, so an old link found later is already dead.
 *
 * Nobody's password is read, set or known here.
 */
async function issueResetLink(user: { id: string; name: string; status: string }, email: string) {
  if (user.status !== 'active') {
    console.error(
      `Refusing: ${email} is ${user.status}. A link would be issued for an account that\n`
      + 'cannot sign in. Reactivate it first.',
    )
    process.exitCode = 1
    return
  }

  const token = generateResetToken()
  await db.$transaction(async (tx) => {
    // Supersede earlier links, so issuing a new one invalidates whatever is in somebody's
    // scrollback.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: resetTokenExpiry(),
        issuedBy: 'cli:grantPlatformAdmin --reset-link',
      },
    })
  })

  await audit({
    action: 'platform_admin_reset_link',
    outcome: 'applied',
    targetEmail: email,
    targetUserId: user.id,
    detail: 'password reset link issued from the server; earlier links invalidated',
  })

  console.log(
    `\nA new password link for ${user.name} <${email}>:\n\n`
    + `  ${env.appUrl}/reset-password?token=${encodeURIComponent(token)}\n\n`
    + `It expires in ${RESET_TOKEN_TTL_MIN} minutes, works once, and cancels any earlier\n`
    + 'link. Their existing password keeps working until this one is used.',
  )
}

async function main() {
  if (addresses.length === 0) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  /*
   * More than one address is refused rather than resolved.
   *
   * This previously took the first non-flag argument and ignored the rest, so a shell that
   * expanded something unexpectedly - or a typed second address - granted access to every
   * customer on the deployment to an account the operator had not looked at. There is no
   * safe guess here, and the command is run rarely enough that asking again costs nothing.
   */
  if (addresses.length > 1) {
    console.error(
      `Refusing: ${addresses.length} email addresses were given (${addresses.join(', ')}).\n`
      + 'This grants access to every customer on the deployment, so it takes one address at\n'
      + 'a time and will not guess which you meant.\n\n' + USAGE,
    )
    process.exitCode = 1
    return
  }

  const email = addresses[0]
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, status: true, platformAdmin: true },
  })

  if (!user) {
    if (revoke) {
      console.error(`No account exists for ${email}. Nothing to revoke.`)
      process.exitCode = 1
      return
    }
    if (create) {
      await createFirstAdmin(email)
      return
    }
    /*
     * Opening an account is deliberately behind a flag rather than implied by the grant.
     * A typo in an address would otherwise silently create a second superuser account
     * beside the one that was meant, and both would work.
     */
    console.error(
      `No account exists for ${email}.\n\n`
      + 'If this is the first administrator on a fresh deployment, open the account too:\n'
      + `  node dist/cli/grantPlatformAdmin.js --create ${email}\n\n`
      + 'Otherwise check the address - granting does not open an account by itself.',
    )
    process.exitCode = 1
    return
  }

  if (create) {
    // Says so rather than ignoring the flag: the operator asked for something that did not
    // happen, and on a bootstrap that difference is worth a sentence.
    console.log(`${email} already exists; --create ignored.`)
  }

  /*
   * Re-issuing a link is its own job, not a side effect of a grant. It changes no
   * privilege, so it returns here rather than falling through to the grant/revoke logic.
   */
  if (resetLink) {
    await issueResetLink(user, email)
    return
  }

  /*
   * A deactivated account can be granted the flag and still cannot use it: the service
   * checks status on every platform request. Saying so matters on a fresh deployment,
   * where the operator would otherwise believe the bootstrap succeeded and spend the next
   * hour wondering why the console refuses them.
   */
  if (user.status !== 'active' && !revoke) {
    console.error(
      `Refusing: ${email} is ${user.status}, and platform access is refused for any account\n`
      + 'that is not active. Reactivate the account first, then grant.',
    )
    // A refused grant is worth keeping: somebody tried to make this account staff.
    await audit({
      action: 'platform_admin_granted',
      outcome: 'refused',
      targetEmail: email,
      targetUserId: user.id,
      detail: `account status is ${user.status}`,
    })
    process.exitCode = 1
    return
  }

  const already = user.platformAdmin === !revoke
  if (already) {
    // Idempotent, and says so. Re-running is a normal thing to do when a deploy is
    // half-remembered; silently reprinting success teaches nothing.
    console.log(
      revoke
        ? `No change: ${user.name} <${email}> is not a platform administrator.`
        : `No change: ${user.name} <${email}> is already a SafeOps platform administrator.`,
    )
    await audit({
      action: revoke ? 'platform_admin_revoked' : 'platform_admin_granted',
      outcome: 'no_change',
      targetEmail: email,
      targetUserId: user.id,
      detail: 'already in the requested state',
    })
    return
  }

  await db.user.update({ where: { id: user.id }, data: { platformAdmin: !revoke } })

  /*
   * Printed as one structured line as well as a sentence. Granting cross-tenant access is
   * the highest-privilege act on the deployment and there is no company to hang an audit
   * entry from - AdminAuditEntry is scoped to a tenant by a foreign key - so the container
   * log is a convenience while tailing a deploy; PlatformAuditEntry is the durable
   * record, and it survives log rotation.
   */
  console.log(JSON.stringify({
    t: new Date().toISOString(),
    event: revoke ? 'platform_admin_revoked' : 'platform_admin_granted',
    email,
    userId: user.id,
  }))

  await audit({
    action: revoke ? 'platform_admin_revoked' : 'platform_admin_granted',
    outcome: 'applied',
    targetEmail: email,
    targetUserId: user.id,
  })
  console.log(
    revoke
      ? `Revoked platform administrator from ${user.name} <${email}>.`
      : `${user.name} <${email}> is now a SafeOps platform administrator.`,
  )
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  // Not process.exit(): that terminates before the disconnect settles, and before stdout
  // has necessarily flushed. Setting exitCode and letting the process end naturally keeps
  // both, which matters when the caller is a deploy script reading the output.
  .finally(() => db.$disconnect())
