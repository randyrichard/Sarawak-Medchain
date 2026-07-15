import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ClipboardList, ListChecks, ShieldCheck, Megaphone, CheckCheck } from 'lucide-react'
import { api } from '@/api/client'
import type { AppNotification, NotificationKind } from '@/api/types'
import { timeAgo } from '@/lib/time'
import { Dropdown, DropdownItem, DropdownSeparator, SkeletonRows } from '@/components/ui'
import { cn } from '@/lib/cn'

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  incident: ClipboardList,
  action: ListChecks,
  audit: ShieldCheck,
  system: Megaphone,
}

export function NotificationMenu() {
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api.listNotifications().then((n) => !cancelled && setItems(n))
    return () => {
      cancelled = true
    }
  }, [])

  const unread = items?.filter((n) => !n.readAt).length ?? 0

  const markAll = async () => {
    await api.markAllNotificationsRead()
    setItems((cur) => cur?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null)
  }

  return (
    <Dropdown
      width="w-96"
      trigger={() => (
        <button className="relative rounded-lg border p-2 text-ink-2 hover:bg-accent-soft" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell size={15} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-2xs font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        {unread > 0 && (
          <button onClick={markAll} className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline">
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>
      <DropdownSeparator />
      {items === null ? (
        <div className="px-2.5 py-2"><SkeletonRows rows={3} /></div>
      ) : items.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-xs text-muted">You're all caught up.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {items.slice(0, 6).map((n) => {
            const Icon = KIND_ICON[n.kind]
            return (
              <DropdownItem
                key={n.id}
                onSelect={() => {
                  void api.markNotificationRead(n.id)
                  setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x)) ?? null)
                  navigate('/notifications')
                }}
              >
                <span className="flex items-start gap-2.5">
                  <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', n.readAt ? 'bg-sunken text-muted' : 'bg-accent-soft text-accent')}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                    <span className="block truncate text-2xs text-muted">{n.detail}</span>
                    <span className="block pt-0.5 text-2xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </span>
              </DropdownItem>
            )
          })}
        </div>
      )}
      <DropdownSeparator />
      <DropdownItem onSelect={() => navigate('/notifications')}>
        <span className="w-full text-center text-xs font-semibold text-accent">View all notifications</span>
      </DropdownItem>
    </Dropdown>
  )
}
