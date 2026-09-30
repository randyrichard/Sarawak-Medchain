import type { Prisma, PrismaClient, Role } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller, membershipOf } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'

export class NotificationError extends DomainError {}

const KINDS = ['incident', 'action', 'audit', 'system']

/** How many a bell ever needs; older entries stay queryable but are not listed. */
const FEED_LIMIT = 100

/**
 * Audiences that are narrower than "the workspace".
 *
 * `recipientRole` existed but nothing read it, so a notification could be tagged for an
 * audience and still be shown to everybody. The medical sweep is why this now matters: it
 * names an employee and states the date their fitness-to-work certificate expires, which
 * `EmployeeService` deliberately withholds from every role outside MEDICAL_ROLES — so the
 * reminder was handing the whole workspace, at every site, the exact field the register
 * refuses them.
 *
 * A tag with no entry here is a broadcast, which keeps every existing notification behaving
 * as it did.
 */
const ROLE_AUDIENCES: Record<string, Role[]> = {
  /** Mirrors EmployeeService.MEDICAL_ROLES. Health information about a named person. */
  medical: ['admin', 'hse_manager', 'safety_officer'],
}

/**
 * The clause that keeps a tagged notification away from roles it was not meant for.
 *
 * Only tags listed in ROLE_AUDIENCES restrict anything, so an unrecognised tag stays
 * visible and forgetting to register one cannot silently hide a workspace's reminders.
 *
 * The null branch is not belt-and-braces, it is required. `recipientRole` is nullable, and
 * in SQL `NOT (col IN ('medical'))` evaluates to NULL rather than TRUE when col IS NULL —
 * so a plain negation drops every untagged broadcast, which is almost all of them, and the
 * feed empties for everyone below HSE manager. The test for it is in rowScope.
 */
export function visibleToRole(role: Role): Prisma.NotificationWhereInput {
  const barred = Object.entries(ROLE_AUDIENCES)
    .filter(([, allowed]) => !allowed.includes(role))
    .map(([tag]) => tag)

  if (barred.length === 0) return {}
  return { OR: [{ recipientRole: null }, { recipientRole: { notIn: barred } }] }
}

export class NotificationService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, NotificationError)
  }


  /**
   * The workspace's notifications, with read state resolved for this caller.
   *
   * `readAt` comes from the caller's own NotificationRead row, so two people looking at
   * the same alert see their own bell rather than each other's.
   */
  async list(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)

    /*
     * Workspace notifications, plus the ones addressed to this person.
     *
     * A null recipient is a broadcast - every notification was one before addressing
     * existed, and most still are. A notification addressed to somebody else is theirs:
     * showing "corrective action assigned to you" to the whole workspace is how a feed
     * becomes noise nobody reads, and it leaks who has been given what.
     */
    const rows = await this.db.notification.findMany({
      where: {
        companyId,
        AND: [
          { OR: [{ recipientUserId: null }, { recipientUserId: caller.userId }] },
          visibleToRole(m.role),
        ],
      },
      include: { reads: { where: { userId: caller.userId }, take: 1 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FEED_LIMIT,
    })

    return rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      detail: n.detail,
      href: n.href,
      createdAt: n.createdAt,
      readAt: n.reads[0]?.readAt ?? null,
      /** True when this was addressed to the reader rather than broadcast. */
      forMe: n.recipientUserId === caller.userId,
      recipientRole: n.recipientRole,
    }))
  }

  /**
   * Raises a notification for the workspace.
   *
   * Called by the client after an authoritative response, which is how the product
   * already behaves — only the storage has moved. Emitting these inside each module's
   * service would be better, and is a deliberate separate change: it would mean touching
   * seven finished verticals.
   */
  async create(caller: Caller, companyId: string, input: {
    kind: string
    title: string
    detail?: string
    href?: string
  }) {
    this.membership(caller, companyId)

    if (!KINDS.includes(input.kind)) {
      throw new NotificationError('validation', 'Unknown notification kind.')
    }
    if (!input.title?.trim()) {
      throw new NotificationError('validation', 'A notification needs a title.')
    }

    return this.db.notification.create({
      data: {
        companyId,
        kind: input.kind,
        title: input.title.trim().slice(0, 300),
        detail: input.detail?.trim().slice(0, 1000) ?? '',
        href: input.href?.slice(0, 500) ?? null,
      },
    })
  }

  async markRead(caller: Caller, companyId: string, id: string) {
    this.membership(caller, companyId)

    // Scoped to the workspace: an id from another tenant must not be markable.
    const n = await this.db.notification.findFirst({
      where: { id, companyId },
      select: { id: true },
    })
    if (!n) throw new NotificationError('not_found', 'Notification not found.', 404)

    await this.db.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId: caller.userId } },
      update: {},
      create: { notificationId: id, userId: caller.userId },
    })
  }

  async markAllRead(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)

    const unread = await this.db.notification.findMany({
      where: {
        companyId,
        reads: { none: { userId: caller.userId } },
        // The same visibility rule as the feed. Without it, "mark all read" writes read
        // receipts against notifications addressed to other people - rows the reader
        // cannot see and has no business acknowledging.
        AND: [
          { OR: [{ recipientUserId: null }, { recipientUserId: caller.userId }] },
          visibleToRole(m.role),
        ],
      },
      select: { id: true },
      take: FEED_LIMIT,
    })
    if (unread.length === 0) return { marked: 0 }

    await this.db.notificationRead.createMany({
      data: unread.map((n) => ({ notificationId: n.id, userId: caller.userId })),
      skipDuplicates: true,
    })
    return { marked: unread.length }
  }
}
