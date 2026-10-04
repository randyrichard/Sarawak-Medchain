import { describe, expect, it } from 'vitest'
import { BACKUP_MAX_AGE_MS, evaluate, type Facts } from './goLive.js'

const NOW = new Date('2026-10-04T02:00:00Z')
const ready: Facts = {
  isProd: true, appPublicUrl: 'https://app.safeops-pilot.my',
  mail: { configured: true, problem: null }, mfaKeySet: true, appDbRoleSet: true,
  allowDemoAccounts: false, demoAccountsOnPublishedPassword: [],
  backup: { lastSuccess: new Date(NOW.getTime() - 3_600_000), location: '/mnt/nas/safeops' },
  remindersAgoMs: 5 * 60_000, schedulerIntervalMin: 15, timeZone: 'Asia/Kuching', now: NOW,
}
const level = (f: Facts, title: RegExp) => evaluate(f).find((c) => title.test(c.title))?.level

describe('go-live readiness', () => {
  it('passes a deployment that is ready', () => {
    expect(evaluate(ready).filter((c) => c.level !== 'pass')).toEqual([])
  })

  it('fails demo accounts left on the published password, unless the stack is a demo on purpose', () => {
    const left = { ...ready, demoAccountsOnPublishedPassword: ['admin@demo.safeops.app'] }
    expect(level(left, /published password/)).toBe('fail')
    expect(level({ ...left, allowDemoAccounts: true }, /Demo logins are enabled/)).toBe('warn')
  })

  it('fails when no backup exists or the last one is stale, and warns when they stay on this machine', () => {
    expect(level({ ...ready, backup: { ...ready.backup, lastSuccess: null } }, /No backup/)).toBe('fail')
    const stale = new Date(NOW.getTime() - BACKUP_MAX_AGE_MS - 60_000)
    expect(level({ ...ready, backup: { ...ready.backup, lastSuccess: stale } }, /Last backup is/)).toBe('fail')
    expect(level({ ...ready, backup: { ...ready.backup, location: 'safeops_backups' } }, /on this machine only/)).toBe('warn')
    expect(level({ ...ready, backup: { ...ready.backup, location: 'D:\\OneDrive\\SafeOps' } }, /on this machine only/)).toBeUndefined()
  })

  it('warns, not fails, without email - the product still works, by hand', () => {
    expect(level({ ...ready, mail: { configured: false, problem: null } }, /No email/)).toBe('warn')
    expect(level({ ...ready, mail: { configured: true, problem: 'SMTP_URL still has a placeholder' } }, /cannot send/)).toBe('fail')
  })

  it('fails a worker that has stopped or never ran', () => {
    expect(level({ ...ready, remindersAgoMs: null }, /never run/)).toBe('fail')
    expect(level({ ...ready, remindersAgoMs: 4 * 15 * 60_000 }, /last ran/)).toBe('fail')
  })

  it('warns about the owner database role and missing MFA key', () => {
    expect(level({ ...ready, appDbRoleSet: false }, /database owner/)).toBe('warn')
    expect(level({ ...ready, mfaKeySet: false }, /unavailable/)).toBe('warn')
  })
})
