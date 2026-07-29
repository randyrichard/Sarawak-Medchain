import { request, qs } from './http'
import type { AppNotification, NotificationKind } from './types'

/**
 * HTTP client for the notification bell.
 *
 * Replaces the `safeops.notifications.v1` localStorage list. Notifications are addressed
 * to the workspace and read state is per person, so one colleague clearing their bell no
 * longer clears everyone's — which the single-browser store could not express.
 */

interface ServerNotification {
  id: string
  kind: string
  title: string
  detail: string
  href: string | null
  createdAt: string
  readAt: string | null
}

function toNotification(n: ServerNotification): AppNotification {
  return {
    id: n.id,
    kind: n.kind as NotificationKind,
    title: n.title,
    detail: n.detail,
    createdAt: n.createdAt,
    readAt: n.readAt,
    href: n.href ?? undefined,
  }
}

export const notificationsApi = {
  async list(companyId: string): Promise<AppNotification[]> {
    const rows = await request<ServerNotification[]>(`/notifications?${qs({ companyId })}`)
    return rows.map(toNotification)
  },

  async create(companyId: string, input: {
    kind: NotificationKind; title: string; detail?: string; href?: string
  }): Promise<AppNotification> {
    return toNotification(await request<ServerNotification>('/notifications', {
      method: 'POST', body: JSON.stringify({ companyId, ...input }),
    }))
  },

  async markRead(companyId: string, id: string): Promise<void> {
    await request<void>(`/notifications/${id}/read`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  async markAllRead(companyId: string): Promise<void> {
    await request<{ marked: number }>('/notifications/read-all', {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },
}
