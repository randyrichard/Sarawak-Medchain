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
  + '  --create   open the account as well, for the very first administrator on a fresh\n'
  + '             deployment where no account exists yet\n'
  + '  --revoke   remove the privilege\n'
  + '\n'
  + 'Exactly one email address.'

const args = process.argv.slice(2)
// Everything that is not a flag. Collected rather than picked, so that more than one
// address is an error instead of a silent choice - see below.
const addresses = args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase())
const revoke = args.includes('--revoke')
const create = args.includes('--create')

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

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
    return
  }

  await db.user.update({ where: { id: user.id }, data: { platformAdmin: !revoke } })

  /*
   * Printed as one structured line as well as a sentence. Granting cross-tenant access is
   * the highest-privilege act on the deployment and there is no company to hang an audit
   * entry from - AdminAuditEntry is scoped to a tenant by a foreign key - so the container
   * log is where this is recoverable from. Structured, so it can actually be found.
   */
  console.log(JSON.stringify({
    t: new Date().toISOString(),
    event: revoke ? 'platform_admin_revoked' : 'platform_admin_granted',
    email,
    userId: user.id,
  }))
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
