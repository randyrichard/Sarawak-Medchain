import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { api } from '@/api/client'
import { useOrg } from '@/features/org/OrgContext'
import type { AppNotification, NotificationKind } from '@/api/types'
import { timeAgo } from '@/lib/time'
import {
  Badge, Button, Card, EmptyState, PageHeader, SkeletonRows, Tabs, type TabItem,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { useUrlState } from '@/lib/useUrlState'
import { notificationTarget } from '@/lib/links'
import { capabilityFor } from '@/components/layout/nav'

const KIND_LABEL: Record<NotificationKind, string> = {
  incident: 'Incident',
  action: 'Action',
  audit: 'Audit',
  system: 'System',
}

const FILTERS = ['all', 'unread', 'incident', 'action', 'audit', 'system'] as const satisfies readonly ('all' | 'unread' | NotificationKind)[]
type Filter = (typeof FILTERS)[number]

export function NotificationsPage() {
  const { company, allowed } = useOrg()
  const companyId = company?.id ?? ''
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [filter, setFilter] = useUrlState<Filter>('show', 'all', FILTERS)
  /*
   * Reminders go to the whole workspace, so an employee is told about a certificate on a
   * page their role does not show them. That one stays a plain row: a link that ends in
   * "you don't have access" is worse than no link.
   */
  const opens = (target: string | null) => {
    if (!target) return null
    const needs = capabilityFor(target)
    return needs === null || allowed(needs) ? target : null
  }

  useEffect(() => {
    let cancelled = false
    api.listNotifications(companyId).then((n) => !cancelled && setItems(n))
    return () => {
      cancelled = true
    }
  }, [companyId])

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
    await api.markAllNotificationsRead(companyId)
    setItems((cur) => cur?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null)
  }

  const markOne = async (id: string) => {
    await api.markNotificationRead(companyId, id)
    setItems((cur) => cur?.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? null)
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Reminders and alerts about work assigned to you, or due soon"
        right={
          unread > 0 ? (
            <Button variant="secondary" size="sm" icon={<CheckCheck size={14} />} onClick={() => void markAll()}>
              Mark All Read
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
            {/*
              The old wording here was "as the related modules go live", which was true
              while the product was being built and is now simply alarming: to a paying
              customer it reads as "these features do not exist yet". The modules are live -
              this list is empty because nothing has fallen due, which is a different and
              much better message.
            */}
            {filter === 'unread'
              ? 'New alerts land here the moment something needs you.'
              : 'Nothing has fallen due yet. Permits nearing expiry, overdue actions and '
                + 'inspections coming up will appear here.'}
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {visible.map((n) => {
              /*
               * A notification opens what it is about. Every one was a button that only
               * marked itself read, so "Corrective action assigned: CA-419" left the person
               * it was assigned to with no way to reach the action from it.
               */
              const target = opens(notificationTarget(n.href))
              const row = 'flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent-soft/40'
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm', n.readAt ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>
                      <Badge tone="neutral">{KIND_LABEL[n.kind]}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{n.detail}</span>
                    <span className="mt-1 block text-2xs text-muted">{timeAgo(n.createdAt)}{n.readAt ? ' · read' : ''}</span>
                  </span>
                  {target && <span className="mt-0.5 shrink-0 text-2xs font-semibold text-accent">Open</span>}
                  {!n.readAt && (
                    <>
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                </>
              )
              return (
                <li key={n.id}>
                  {target ? (
                    <Link to={target} onClick={() => void markOne(n.id)} className={row}>{body}</Link>
                  ) : (
                    <button onClick={() => void markOne(n.id)} className={row}>{body}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-2xs text-muted">
        Notifications are raised in-app as permits, inspections and actions fall due.
      </p>
    </>
  )
}
