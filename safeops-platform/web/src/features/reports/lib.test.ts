import { describe, it, expect } from 'vitest'
import type { ReportRun, ReportSchedule } from '@/api/reportsApi'
import {
  canDownloadRun, canManageReports, deliveryBadge, recipientSummary, runFlashMessage,
} from './lib'

/**
 * The Reports page's decisions.
 *
 * These are the functions the page itself calls - there is no second copy - so what is
 * asserted here is what an operator sees. The web suite has no DOM renderer, which keeps
 * these at the same level as the incident board's filters and the permissions table.
 */
const run = (over: Partial<ReportRun> = {}): ReportRun => ({
  id: 'r1', scheduleId: 's1', reportType: 'overdue_actions',
  typeLabel: 'Overdue corrective actions', trigger: 'scheduled',
  startedAt: '2026-08-11T00:00:00.000Z', completedAt: '2026-08-11T00:00:04.000Z',
  status: 'success', rowCount: 6, recipientCount: 2, delivered: true,
  deliveryNote: 'Emailed to 2 recipient(s).', deliveryStatus: 'sent',
  messageId: 'msg_1', sentAt: '2026-08-11T00:00:05.000Z', failureReason: null,
  provider: 'smtp', attempts: 1, maxAttempts: 3, nextAttemptAt: null,
  originalName: 'overdue-corrective-actions-2026-08-11.pdf', sizeBytes: 3081,
  error: null, triggeredBy: 'system', ...over,
})

const schedule = (over: Partial<ReportSchedule> = {}): ReportSchedule => ({
  id: 's1', companyId: 'c1', name: 'Monday overdue actions', projectId: null,
  reportType: 'overdue_actions', typeLabel: 'Overdue corrective actions',
  enabled: true, frequency: 'weekly', dayOfWeek: 1, timeOfDay: '08:00',
  timezone: 'Asia/Kuching', scheduleLabel: 'Every Monday at 08:00 Asia/Kuching',
  recipientUserIds: ['u1', 'u2'],
  recipients: [
    { userId: 'u1', name: 'Marcus Tan', email: 'marcus@example.com' },
    { userId: 'u2', name: 'Siti Rahman', email: 'siti@example.com' },
  ],
  unreachableRecipients: 0, siteId: null, lastRunAt: null, lastRunStatus: null,
  lastRunError: null, nextRunAt: null, createdBy: 'u1', createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

describe('deliveryBadge', () => {
  it('shows a delivered report as sent', () => {
    expect(deliveryBadge(run())).toEqual({ label: 'Sent', tone: 'good' })
  })

  it('shows a failed delivery in the critical tone', () => {
    const b = deliveryBadge(run({ deliveryStatus: 'failed', attempts: 3 }))
    expect(b).toEqual({ label: 'Delivery Failed', tone: 'critical' })
  })

  it('distinguishes a retry in progress from a send in progress', () => {
    /*
     * The distinction an operator acts on. "Sending" is a send happening now; "Retrying"
     * is one that failed and is waiting out a backoff, and the count says how much
     * patience is left before it gives up.
     */
    expect(deliveryBadge(run({
      deliveryStatus: 'email_pending', attempts: 2, nextAttemptAt: '2026-08-11T00:15:00.000Z',
    }))).toEqual({ label: 'Retrying (2 of 3)', tone: 'warning' })

    expect(deliveryBadge(run({
      deliveryStatus: 'email_pending', attempts: 1, nextAttemptAt: null,
    }))).toEqual({ label: 'Sending…', tone: 'warning' })
  })

  it('does not dress up an unsent report as a failure', () => {
    // Nobody configured a provider. Nothing failed; nothing was ever going to be sent.
    expect(deliveryBadge(run({ deliveryStatus: 'generated', delivered: false, attempts: 0 })))
      .toEqual({ label: 'Generated', tone: 'neutral' })
  })

  it('never reports sent for anything but a confirmed send', () => {
    const notSent = ['generated', 'email_pending', 'failed'] as const
    for (const status of notSent) {
      expect(deliveryBadge(run({ deliveryStatus: status })).label).not.toBe('Sent')
    }
  })
})

describe('canManageReports', () => {
  it('allows the roles the server allows', () => {
    for (const r of ['admin', 'hse_manager', 'safety_officer']) {
      expect(canManageReports(r)).toBe(true)
    }
  })

  it('refuses everyone else, including nobody at all', () => {
    for (const r of ['employee', 'supervisor', 'contractor', '', null, undefined]) {
      expect(canManageReports(r)).toBe(false)
    }
  })
})

describe('canDownloadRun', () => {
  it('offers the file for a successful run', () => {
    expect(canDownloadRun(run())).toBe(true)
  })

  it('still offers it when delivery failed', () => {
    // The report is the thing being chased; a bounced email is no reason to hide it.
    expect(canDownloadRun(run({ deliveryStatus: 'failed', delivered: false }))).toBe(true)
  })

  it('offers nothing when the run produced no file', () => {
    expect(canDownloadRun(run({ status: 'failed', originalName: null }))).toBe(false)
    expect(canDownloadRun(run({ originalName: null }))).toBe(false)
  })
})

describe('recipientSummary', () => {
  it('names the recipients', () => {
    expect(recipientSummary(schedule())).toBe('To Marcus Tan, Siti Rahman')
  })

  it('says so when nobody is addressed', () => {
    expect(recipientSummary(schedule({ recipients: [] }))).toBe('No recipients yet')
  })

  it('surfaces recipients who have left rather than quietly dropping them', () => {
    // A schedule that silently stopped emailing two people is a compliance gap.
    expect(recipientSummary(schedule({ unreachableRecipients: 2 })))
      .toBe('To Marcus Tan, Siti Rahman (2 no longer in this workspace)')
  })
})

describe('runFlashMessage', () => {
  it('confirms delivery when a provider is configured', () => {
    expect(runFlashMessage({ name: 'Monday overdue', recipientCount: 2, mailConfigured: true }))
      .toBe('Monday overdue generated and sent to 2 recipient(s).')
  })

  it('does not claim an email was sent when none could be', () => {
    const msg = runFlashMessage({
      name: 'Monday overdue', recipientCount: 2, mailConfigured: false, rowCount: 6,
    })
    expect(msg).not.toMatch(/sent/)
    expect(msg).toMatch(/needs a mail provider/)
    expect(msg).toMatch(/6 rows/)
  })

  it('treats an unknown mail configuration as not configured', () => {
    // The catalog call failed. Promising delivery on a guess is the one thing not to do.
    expect(runFlashMessage({ name: 'X', recipientCount: 1, mailConfigured: null }))
      .not.toMatch(/sent to/)
  })
})
