/**
 * Whether the sign-in page offers the one-click demo accounts.
 *
 * They are genuinely useful while building, and indefensible on a customer's production
 * login page: six role buttons for `@demo.safeops.app` accounts and the literal line
 * "Shared demo password: …". That publishes the exact account-naming and password
 * convention the seed uses, on the first screen anybody sees — and if that seed ever ran
 * against the deployment, one of those accounts is an administrator.
 *
 * Default is development only. A deliberate demo deployment can still have them by setting
 * VITE_DEMO_LOGINS=true at build time, which keeps the sales-demo case possible without
 * making it the accident.
 */
export interface DemoLoginEnv {
  DEV?: boolean
  VITE_DEMO_LOGINS?: string
}

export function shouldShowDemoLogins(env: DemoLoginEnv): boolean {
  if (env.VITE_DEMO_LOGINS === 'true') return true
  return env.DEV === true
}
