import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCheck, ClipboardList, ListChecks, Megaphone, ShieldCheck } from 'lucide-react'
import { api } from '@/api/client'
import type { AppNotification, NotificationKind } from '@/api/types'
import { timeAgo } from '@/lib/time'
import {
  Badge, Button, Card, EmptyState, PageHeader, SkeletonRows, Tabs, type TabItem,
} from '@/components/ui'
import { cn } from '@/lib/cn'

const KIND_META: Record<NotificationKind, { icon: typeof Bell; label: string }> = {
  incident: { icon: ClipboardList, label: 'Incident' },
  action: { icon: ListChecks, label: 'Action' },
  audit: { icon: ShieldCheck, label: 'Audit' },
  system: { icon: Megaphone, label: 'System' },
}

type Filter = 'all' | 'unread' | NotificationKind

export function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    api.listNotifications().then((n) => !cancelled && setItems(n))
    return () => {
      cancelled = true
    }
  }, [])

  const unread = items?.filter((n) => !n.readAt).length ?? 0

  const tabs: TabItem<Filter>[] = useMemo(
    () => [
      { value: 'all', label: 'All' },
      { value: 'unread', label: 'Unread', badge: unread > 0 ? <Badge tone="accent">{unread}</Badge> : undefined },
      { value: 'incident', label: 'Incidents' },
      { value: 'action', label: 'Actions' },
      { value: 'audit', label: 'Audits' },
      { value: 'system', label: 'System' },
    ],
    [unread],
  )

  const visible = useMemo(() => {
    if (!items) return []
    if (filter === 'all') return items
    if (filter === 'unread') return items.filter((n) => !n.readAt)
    return items.filter((n) => n.kind === filter)
  }, [items, filter])

  const markAll = async () => {
    await api.markAllNotificationsRead()
    setItems((cur) => cur?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null)
  }

  const markOne = async (id: string) => {
    await api.markNotificationRead(id)
    setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? null)
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Everything SafeOps is telling you, with the noise controls you'd expect"
        right={
          unread > 0 ? (
            <Button variant="secondary" size="sm" icon={<CheckCheck size={14} />} onClick={() => void markAll()}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <Tabs items={tabs} value={filter} onChange={setFilter} className="mb-4" />

      <Card>
        {items === null ? (
          <div className="p-5"><SkeletonRows rows={5} /></div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? "You're all caught up" : 'Nothing here yet'}>
            {filter === 'unread'
              ? 'New alerts land here the moment something needs you.'
              : 'Notifications of this type will appear as the related modules go live.'}
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {visible.map((n) => {
              const meta = KIND_META[n.kind]
              const Icon = meta.icon
              return (
                <li key={n.id}>
                  <button
                    onClick={() => void markOne(n.id)}
                    className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent-soft/40"
                  >
                    <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', n.readAt ? 'bg-sunken text-muted' : 'bg-accent-soft text-accent')}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                        <Badge tone="neutral">{meta.label}</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{n.detail}</span>
                      <span className="mt-1 block text-2xs text-muted">{timeAgo(n.createdAt)}{n.readAt ? ' · read' : ''}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-2xs text-muted">
        Delivery preferences (email digests, quiet hours, escalation ladders) activate with the notification engine in Sprint 2.
      </p>
    </>
  )
}
