import { existsSync, readFileSync } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { DEMO_PASSWORD } from './demoAccounts.js'
import { verifyPassword } from './password.js'
import { providerOrProblem } from './email/index.js'

/**
 * Is this deployment ready for a customer?
 *
 * Everything here works on a laptop and fails quietly in front of a customer: no mail, so
 * invitations are links an administrator must pass on by hand; backups that exist only on
 * the machine they protect, or not at all; demo logins with a password anyone can read; a
 * stuck worker, so no reminder is ever sent. Each is a setting, not a bug, which is exactly
 * why nothing else catches it. Run before go-live and after any change to the host:
 *
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/cli/goLive.js
 *
 * Facts are gathered separately from the verdicts, so the verdicts are unit-tested without
 * a database or a filesystem.
 */
export type Level = 'pass' | 'warn' | 'fail'
export interface Check { level: Level; title: string; detail: string }

export interface Facts {
  isProd: boolean
  appPublicUrl: string | undefined
  mail: { configured: boolean; problem: string | null }
  mfaKeySet: boolean
  appDbRoleSet: boolean
  allowDemoAccounts: boolean
  /** Demo-domain accounts whose password is still the published one. */
  demoAccountsOnPublishedPassword: string[]
  backup: { lastSuccess: Date | null; location: string }
  /** How long ago the worker last finished a reminder pass; null if never. */
  remindersAgoMs: number | null
  schedulerIntervalMin: number
  timeZone: string
  now: Date
}

const HOUR = 3_600_000
/** A daily backup, plus two hours' grace for a slow dump. */
export const BACKUP_MAX_AGE_MS = 26 * HOUR

/** A Docker volume name rather than a path: then the backups live on this machine. */
const onThisMachine = (location: string) => !/[/\\]/.test(location)

export function evaluate(f: Facts): Check[] {
  const out: Check[] = []

  // Email
  if (f.mail.problem) {
    out.push({ level: 'fail', title: 'Email is configured but cannot send', detail: f.mail.problem })
  } else if (!f.mail.configured) {
    out.push({
      level: 'warn', title: 'No email delivery',
      detail: 'Invitations and password resets give the administrator a link to pass on by hand, and '
        + 'scheduled reports are stored but not emailed. Set REPORT_EMAIL_FROM with SMTP_URL or '
        + 'RESEND_API_KEY, then run node dist/cli/verifyMail.js.',
    })
  } else {
    out.push({ level: 'pass', title: 'Email delivery configured', detail: 'Confirm with node dist/cli/verifyMail.js --send-to you@company.com.' })
  }

  // Demo accounts
  if (f.demoAccountsOnPublishedPassword.length > 0) {
    out.push(f.allowDemoAccounts
      ? {
        level: 'warn', title: 'Demo logins are enabled on purpose (ALLOW_DEMO_ACCOUNTS=true)',
        detail: `${f.demoAccountsOnPublishedPassword.join(', ')} can sign in with the published demo password. `
          + 'Acceptable only on a demo stack strangers cannot reach; never with customer data.',
      }
      : {
        level: 'fail', title: 'Demo accounts still have the published password',
        detail: `${f.demoAccountsOnPublishedPassword.join(', ')}. Production refuses that password at sign-in, `
          + 'but the accounts should not exist on a customer deployment: deactivate them in '
          + 'Administration → Users, or reset their passwords.',
      })
  } else {
    out.push({ level: 'pass', title: 'No demo account uses the published password', detail: '' })
  }

  // Backups
  const age = f.backup.lastSuccess ? f.now.getTime() - f.backup.lastSuccess.getTime() : null
  if (age === null) {
    out.push({
      level: 'fail', title: 'No backup has been taken',
      detail: 'The backup service has not completed a run (no /backups/LAST_SUCCESS). Check: docker compose logs backup.',
    })
  } else if (age > BACKUP_MAX_AGE_MS) {
    out.push({
      level: 'fail', title: `Last backup is ${Math.round(age / HOUR)} hours old`,
      detail: 'Backups should run daily. Check: docker compose logs backup.',
    })
  } else {
    out.push({ level: 'pass', title: `Last backup ${Math.max(0, Math.round(age / HOUR))} hours ago`, detail: '' })
  }
  if (onThisMachine(f.backup.location)) {
    out.push({
      level: 'warn', title: 'Backups are kept on this machine only',
      detail: `BACKUP_LOCATION is the Docker volume "${f.backup.location}". If this machine is lost, so are `
        + 'the backups. Point BACKUP_LOCATION at a NAS share or a synced cloud folder (docs/BACKUP.md).',
    })
  }

  // Database role (row-level security only applies when the service is not the table owner)
  out.push(f.appDbRoleSet
    ? { level: 'pass', title: 'API connects as the restricted database role', detail: '' }
    : {
      level: 'warn', title: 'API connects as the database owner',
      detail: 'Row-level tenant isolation does not apply to the owner. Set APP_DB_PASSWORD (docs/DEPLOYMENT.md).',
    })

  // MFA
  out.push(f.mfaKeySet
    ? { level: 'pass', title: 'Multi-factor sign-in available', detail: '' }
    : { level: 'warn', title: 'Multi-factor sign-in unavailable', detail: 'Set MFA_SECRET_KEY_B64 (npm run keygen) so administrators can turn it on.' })

  // Worker: reminders, expiry warnings, scheduled reports
  const stale = 3 * f.schedulerIntervalMin * 60_000 + 60_000
  if (f.remindersAgoMs === null) {
    out.push({ level: 'fail', title: 'The worker has never run', detail: 'No reminder, expiry warning or scheduled report will be sent. Check: docker compose logs worker.' })
  } else if (f.remindersAgoMs > stale) {
    out.push({ level: 'fail', title: `The worker last ran ${Math.round(f.remindersAgoMs / 60_000)} minutes ago`, detail: 'It should run every SCHEDULER_INTERVAL_MIN. Check: docker compose logs worker.' })
  } else {
    out.push({ level: 'pass', title: 'The worker is running', detail: '' })
  }

  // Public address
  if (f.isProd && !f.appPublicUrl) {
    out.push({ level: 'fail', title: 'APP_PUBLIC_URL is not set', detail: 'Links in invitations and resets need the public https address.' })
  }

  out.push({ level: 'pass', title: `Business day: ${f.timeZone}`, detail: '"Today" and "this month" roll over at midnight here (docs/TIME_ZONES.md).' })
  return out
}

/** Reads the facts from this process's environment, its database and the backup volume. */
export async function gatherFacts(db: PrismaClient, now = new Date()): Promise<Facts> {
  const { provider, problem } = providerOrProblem()

  // Only demo-domain accounts are checked: verifying every account's hash would cost a
  // full Argon2 run each, and the published password only ever came with these.
  const demo = await db.user.findMany({
    where: { email: { endsWith: '@demo.safeops.app' }, status: { not: 'deactivated' } },
    select: { email: true, passwordHash: true },
    take: 50,
  })
  const onPublished: string[] = []
  for (const u of demo) if (await verifyPassword(u.passwordHash, DEMO_PASSWORD)) onPublished.push(u.email)

  let lastSuccess: Date | null = null
  if (existsSync('/backups/LAST_SUCCESS')) {
    const t = new Date(readFileSync('/backups/LAST_SUCCESS', 'utf8').trim())
    if (!Number.isNaN(t.getTime())) lastSuccess = t
  }

  const run = await db.jobRun.findFirst({ where: { job: 'reminders' }, select: { lastFinishedAt: true } })

  return {
    isProd: env.isProd,
    appPublicUrl: env.APP_PUBLIC_URL,
    mail: { configured: Boolean(provider), problem },
    mfaKeySet: env.mfaSecretKey !== null,
    appDbRoleSet: Boolean(env.APP_DB_PASSWORD),
    allowDemoAccounts: env.ALLOW_DEMO_ACCOUNTS === 'true',
    demoAccountsOnPublishedPassword: onPublished,
    backup: { lastSuccess, location: process.env.BACKUP_LOCATION || 'safeops_backups' },
    remindersAgoMs: run?.lastFinishedAt ? now.getTime() - run.lastFinishedAt.getTime() : null,
    schedulerIntervalMin: Number(process.env.SCHEDULER_INTERVAL_MIN) || 15,
    timeZone: env.APP_TIMEZONE,
    now,
  }
}
