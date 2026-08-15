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
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
// The email is the first argument that is not a flag: `platform:revoke` puts --revoke
// ahead of it, so positional indexing picks up the flag instead of the address.
const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()
const revoke = args.includes('--revoke')

async function main() {
  if (!email) {
    // Both forms, because this runs in two places: tsx in development, and the compiled
    // file in the production image where npm scripts and tsx are not available.
    console.error(
      'Usage:\n'
      + '  npm run platform:grant -- someone@yourcompany.com        (development)\n'
      + '  node dist/cli/grantPlatformAdmin.js someone@example.com  (deployed image)\n'
      + 'Add --revoke to remove the privilege.',
    )
    process.exit(1)
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } })
  if (!user) {
    // Not created here on purpose: this grants a privilege, it does not open an account.
    console.error(`No account exists for ${email}. Create the user first, then grant.`)
    process.exit(1)
  }
  await db.user.update({ where: { id: user.id }, data: { platformAdmin: !revoke } })
  console.log(
    revoke
      ? `Revoked platform administrator from ${user.name} <${email}>.`
      : `${user.name} <${email}> is now a SafeOps platform administrator.`,
  )
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
