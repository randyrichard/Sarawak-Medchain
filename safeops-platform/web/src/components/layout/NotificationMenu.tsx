import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useOrg } from '@/features/org/OrgContext'
import { timeAgo } from '@/lib/time'
import { Dropdown, DropdownItem, DropdownSeparator, SkeletonRows } from '@/components/ui'
import { cn } from '@/lib/cn'
import { notificationTarget } from '@/lib/links'
import { capabilityFor } from './nav'
import { useNotificationFeed } from './notificationFeed'


export function NotificationMenu() {
  const { allowed } = useOrg()
  // Straight to what it is about, when this person can open it; otherwise the full list.
  const destination = (href: string | undefined) => {
    const target = notificationTarget(href)
    const needs = target ? capabilityFor(target) : null
    return target && (needs === null || allowed(needs)) ? target : '/notifications'
  }
  // Shared with the menu's Notifications row, so the two counts are one count.
  const { items, unread, markRead, markAllRead } = useNotificationFeed()
  const navigate = useNavigate()

  return (
    <Dropdown
      width="w-96"
      trigger={() => (
        <button className="relative rounded-lg border p-2 text-ink-2 hover:bg-accent-soft coarse:min-h-touch coarse:min-w-touch" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell size={15} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical-solid px-1 text-2xs font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        {unread > 0 && (
          // A menu item like the rest, so the arrow keys reach it: in a menu, Tab closes
          // the menu rather than moving to the next button.
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => void markAllRead()} className="inline-flex rounded focus-visible:outline-none focus:underline items-center gap-1 text-2xs font-semibold text-accent hover:underline">
            <CheckCheck size={12} aria-hidden /> Mark All Read
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
            return (
              <DropdownItem
                key={n.id}
                onSelect={() => {
                  markRead(n.id)
                  navigate(destination(n.href))
                }}
              >
                <span className="flex items-start gap-2.5">
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                    <span className="block truncate text-2xs text-muted">{n.detail}</span>
                    <span className="block pt-0.5 text-2xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && (
                    <>
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                </span>
              </DropdownItem>
            )
          })}
        </div>
      )}
      <DropdownSeparator />
      <DropdownItem onSelect={() => navigate('/notifications')}>
        <span className="w-full text-center text-xs font-semibold text-accent">View All Notifications</span>
      </DropdownItem>
    </Dropdown>
  )
}
