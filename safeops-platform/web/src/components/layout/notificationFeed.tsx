import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/api/client'
import type { AppNotification } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { pollWhileVisible } from '@/lib/poll'
import { onRefresh } from '@/lib/refreshSignal'

/**
 * The notifications feed, read once for the bell, the menu and the Notifications page.
 *
 * The bell and the page each read it on their own. The menu's Notifications row now shows
 * the unread count too, and separate readers of one feed disagree between polls: marking
 * everything read on the page left the menu saying 11, and the menu button its dot.
 */
interface Feed {
  /** Null until the first answer. */
  items: AppNotification[] | null
  unread: number
  markRead: (id: string) => void
  markAllRead: () => Promise<void>
  /** Read the feed again now, rather than at the next poll. */
  refresh: () => void
}

const FeedContext = createContext<Feed | null>(null)

const nowIfUnread = (n: AppNotification) => n.readAt ?? new Date().toISOString()

export function NotificationFeedProvider({ children }: { children: ReactNode }) {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const [items, setItems] = useState<AppNotification[] | null>(null)
  // Bumped by refresh(): the feed is read again and the poll starts over from there.
  const [asked, setAsked] = useState(0)

  // Another workspace: its notifications, not the last one's, even for the moment it takes.
  useEffect(() => { setItems(null) }, [companyId])

  useEffect(() => {
    let cancelled = false
    const load = () => api.listNotifications(companyId).then((n) => !cancelled && setItems(n))
    load()
    // light poll so workflow events (assignments, mentions, escalations) surface live
    const stop = pollWhileVisible(load, 15_000)
    return () => {
      cancelled = true
      stop()
    }
  }, [companyId, asked])

  const refresh = useCallback(() => setAsked((n) => n + 1), [])
  // A Refresh pressed anywhere reads the feed again too, so the bell agrees with the page.
  useEffect(() => onRefresh(refresh), [refresh])

  const feed = useMemo<Feed>(() => ({
    items,
    unread: items?.filter((n) => !n.readAt).length ?? 0,
    markRead: (id) => {
      void api.markNotificationRead(companyId, id)
      setItems((cur) => cur?.map((x) => (x.id === id ? { ...x, readAt: nowIfUnread(x) } : x)) ?? null)
    },
    markAllRead: async () => {
      await api.markAllNotificationsRead(companyId)
      setItems((cur) => cur?.map((n) => ({ ...n, readAt: nowIfUnread(n) })) ?? null)
    },
    refresh,
  }), [items, companyId, refresh])

  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>
}

/** Outside the app shell there is no feed: nothing unread, nothing to mark. */
const NONE: Feed = { items: null, unread: 0, markRead: () => {}, markAllRead: async () => {}, refresh: () => {} }

export const useNotificationFeed = () => useContext(FeedContext) ?? NONE
