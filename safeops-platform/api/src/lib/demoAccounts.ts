/**
 * The demo dataset's sign-in password - and why production refuses it.
 *
 * The seed and the demo loader give every demo login this one password, and it is written
 * in this repository, the README and the demo's own console output. So anyone who has seen
 * the repo can sign in as an administrator on any deployment that still has it. The seed
 * refuses to run in production, but a stack started from the demo and then exposed to the
 * internet keeps the accounts - and the password.
 *
 * So in production a sign-in with exactly this password is refused, even when it is
 * correct, unless ALLOW_DEMO_ACCOUNTS=true says the deployment is a demo on purpose.
 */
export const DEMO_PASSWORD = 'SafeOpsPlatform2026'

export const DEMO_PASSWORD_REFUSED =
  'This account still uses the published demo password, which anyone can look up. '
  + 'Reset it with "Forgot password", or ask an administrator for a reset link.'
