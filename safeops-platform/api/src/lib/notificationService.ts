import type { PrismaClient } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'

export class NotificationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const KINDS = ['incident', 'action', 'audit', 'system']

/** How many a bell ever needs; older entries stay queryable but are not listed. */
const FEED_LIMIT = 100

export class NotificationService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new NotificationError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /**
   * The workspace's notifications, with read state resolved for this caller.
   *
   * `readAt` comes from the caller's own NotificationRead row, so two people looking at
   * the same alert see their own bell rather than each other's.
   */
  async list(caller: Caller, companyId: string) {
    this.membership(caller, companyId)

    const rows = await this.db.notification.findMany({
      where: { companyId },
      include: { reads: { where: { userId: caller.userId }, take: 1 } },
      orderBy: { createdAt: 'desc' },
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
    this.membership(caller, companyId)

    const unread = await this.db.notification.findMany({
      where: { companyId, reads: { none: { userId: caller.userId } } },
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
