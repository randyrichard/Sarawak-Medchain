import type { PrismaClient } from '@prisma/client'
import { deliver } from './webhookDelivery.js'
import { open, SecretBoxError } from './secretBox.js'

/**
 * The webhook queue: what is owed, and sending it.
 *
 * Events are enqueued by whatever produced them and sent by a sweep, never inline. An
 * incident report must not wait on a customer's HTTP endpoint, and must not fail because
 * that endpoint is down - the record is the product, the notification is a courtesy.
 *
 * The payload is frozen at enqueue time. A retry three hours later sends what the event
 * said when it happened, not what the record has become since, which is the difference
 * between an event stream and a polling loop that occasionally lies.
 */

/** The events a webhook may subscribe to. Mirrors WEBHOOK_EVENTS in the web client. */
export const WEBHOOK_EVENTS = [
  'incident.created',
  'incident.closed',
  'action.assigned',
  'action.verified',
  'inspection.failed',
  'audit.finding.raised',
  'certificate.issued',
  'certificate.expiring',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/**
 * How often a failed delivery is retried, and how far apart.
 *
 * Five attempts over roughly seven hours. Long enough to ride out a deployment or a
 * certificate renewal at the other end; short enough that a permanently dead endpoint
 * stops consuming sweeps by the same working day.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360]
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length

/** How many deliveries one sweep will attempt. Bounds the time a single pass can take. */
const BATCH = 50

export interface EnqueueResult {
  queued: number
}

/**
 * Queues an event for every webhook subscribed to it.
 *
 * Deliberately swallows its own failures. This is called from inside the paths that create
 * incidents and close actions, and a webhook table that is unreachable must not be able to
 * fail a safety record's write. It returns what it queued so callers that care can assert
 * on it.
 */
export async function enqueueEvent(
  db: PrismaClient, companyId: string, event: WebhookEvent, payload: Record<string, unknown>,
): Promise<EnqueueResult> {
  try {
    const hooks = await db.webhook.findMany({
      where: { companyId, active: true, events: { has: event } },
      select: { id: true },
    })
    if (hooks.length === 0) return { queued: 0 }

    await db.webhookDelivery.createMany({
      data: hooks.map((h) => ({
        webhookId: h.id,
        companyId,
        event,
        // The event, plus enough envelope for a receiver to order and deduplicate what it
        // gets without having to call back.
        payload: { event, companyId, occurredAt: new Date().toISOString(), data: payload } as never,
      })),
    })
    return { queued: hooks.length }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[safeops-webhooks] could not queue an event:', e)
    return { queued: 0 }
  }
}

export interface SweepResult {
  attempted: number
  delivered: number
  failed: number
  retrying: number
}

/**
 * Sends one attempt for each delivery that is pending and due.
 *
 * Attempts are recorded before the request goes out, not after. A process that dies
 * mid-flight then resumes with the attempt already counted, so a crash loop cannot
 * redeliver the same event forever - at-most-a-bounded-number-of-times matters more here
 * than at-least-once, because the receiver of a duplicate incident alert cannot tell it is
 * a duplicate.
 */
export async function sweepDeliveries(db: PrismaClient, now = new Date()): Promise<SweepResult> {
  const due = await db.webhookDelivery.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
    include: {
      webhook: { select: { id: true, url: true, active: true, secretEnc: true } },
    },
  })

  const result: SweepResult = { attempted: 0, delivered: 0, failed: 0, retrying: 0 }

  for (const row of due) {
    // A webhook switched off after an event was queued should not then be delivered to.
    // The queued row is retired rather than left pending forever.
    if (!row.webhook.active) {
      await db.webhookDelivery.update({
        where: { id: row.id },
        data: { status: 'failed', lastError: 'The webhook was disabled before this could be sent.' },
      })
      result.failed += 1
      continue
    }

    let secret: string
    try {
      secret = open(row.webhook.secretEnc)
    } catch (e) {
      /*
       * The secret cannot be read - almost always because WEBHOOK_SECRET_KEY_B64 changed,
       * or because this row predates sealed secrets. Terminal, and said plainly on the row:
       * a webhook that quietly stops delivering is the worst way for anyone to find out.
       */
      await db.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          lastError: e instanceof SecretBoxError
            ? `${e.message} Recreate this webhook to get a new secret.`
            : 'The signing secret could not be read.',
        },
      })
      await db.webhook.update({
        where: { id: row.webhookId },
        data: {
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: 'failed',
          lastDeliveryCode: null,
        },
      })
      result.failed += 1
      continue
    }

    const attempt = row.attempts + 1
    await db.webhookDelivery.update({ where: { id: row.id }, data: { attempts: attempt } })
    result.attempted += 1

    const outcome = await deliver(row.webhook.url, secret, row.event, row.id, row.payload)

    if (outcome.ok) {
      await db.$transaction([
        db.webhookDelivery.update({
          where: { id: row.id },
          data: {
            status: 'delivered',
            deliveredAt: new Date(),
            lastStatusCode: outcome.statusCode ?? null,
            lastError: null,
          },
        }),
        db.webhook.update({
          where: { id: row.webhookId },
          data: {
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: 'success',
            lastDeliveryCode: outcome.statusCode ?? null,
          },
        }),
      ])
      result.delivered += 1
      continue
    }

    const exhausted = attempt >= MAX_ATTEMPTS
    const waitMinutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length) - 1]
    await db.$transaction([
      db.webhookDelivery.update({
        where: { id: row.id },
        data: {
          status: exhausted ? 'failed' : 'pending',
          nextAttemptAt: new Date(now.getTime() + waitMinutes * 60_000),
          lastStatusCode: outcome.statusCode ?? null,
          // Bounded: this is a message from somebody else's server and it goes in a column
          // an administrator reads.
          lastError: (outcome.error ?? 'Delivery failed.').slice(0, 500),
        },
      }),
      db.webhook.update({
        where: { id: row.webhookId },
        data: {
          lastDeliveryAt: new Date(),
          lastDeliveryStatus: 'failed',
          lastDeliveryCode: outcome.statusCode ?? null,
        },
      }),
    ])
    if (exhausted) result.failed += 1
    else result.retrying += 1
  }

  return result
}
