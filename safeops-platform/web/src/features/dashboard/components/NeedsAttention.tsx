import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import type { AttentionItem, AttentionKind } from '@/api/dashboardApi'
import { Badge, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui'
import {
  filterAttention, kindLabel, overdueLabel, priorityLabel, priorityTone, sortAttention,
} from '../lib'

/**
 * What needs attention, in the order it needs it.
 *
 * The point of the whole page. Ordering is by operational importance rather than by date:
 * a potential fatality outranks a certificate expiring next week however much older the
 * certificate is. Every row opens the real record in the module that owns it - there is no
 * detail view here, because a second one would drift from the first.
 */

const TABS: { value: AttentionKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'incident', label: 'Incidents' },
  { value: 'action', label: 'Actions' },
  { value: 'permit', label: 'Permits' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'visitor', label: 'Visitors' },
  // Report items land in the queue too; without a tab they were unreachable by filter.
  { value: 'report', label: 'Reports' },
]

export function NeedsAttention({
  items, total, loading, className,
}: {
  items: AttentionItem[] | undefined
  total: number
  loading: boolean
  className?: string
}) {
  const [kind, setKind] = useState<AttentionKind | 'all'>('all')

  const rows = items ? sortAttention(filterAttention(items, kind)) : []
  const shown = items?.length ?? 0

  return (
    <Card className={className}>
      <CardHeader
        title="Needs attention"
        subtitle={
          loading
            ? undefined
            : total > shown
              ? `Showing the ${shown} most urgent of ${total}`
              : `${total} item${total === 1 ? '' : 's'}`
        }
      />

      <div className="flex gap-1 relative overflow-x-auto px-5 pb-2 pt-1">
        {TABS.map((t) => {
          const count = items ? filterAttention(items, t.value).length : 0
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setKind(t.value)}
              aria-pressed={kind === t.value}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-2xs font-semibold transition coarse:min-h-11 coarse:px-4 ${
                kind === t.value
                  ? 'border-[var(--accent)] bg-accent-soft text-ink'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {t.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}
      </div>

      <CardBody className="pt-1">
        {loading && (
          <ul className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}><Skeleton className="h-14 rounded-lg" /></li>
            ))}
          </ul>
        )}

        {!loading && rows.length === 0 && (
          <EmptyState
            icon={ClipboardCheck}
            title={kind === 'all' ? 'All clear' : `Nothing outstanding in ${kindLabel(kind as AttentionKind).toLowerCase()}s`}
          >
            {kind === 'all'
              ? 'Nothing is overdue, expiring or waiting on a review right now.'
              : 'Switch back to Everything to see the rest of the queue.'}
          </EmptyState>
        )}

        {!loading && rows.length > 0 && (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const late = overdueLabel(r.overdueDays)
              return (
                <li key={r.id}>
                  <Link
                    to={r.href}
                    className="flex items-start gap-3 py-2.5 transition hover:bg-[var(--surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={priorityTone(r.priority)}>{priorityLabel(r.priority)}</Badge>
                        <span className="shrink-0 font-mono text-2xs text-muted">{r.reference}</span>
                        {/* Wraps rather than forcing the row wider than a phone. */}
                        <span className="min-w-0 break-words text-xs font-semibold text-ink">
                          {r.title}
                        </span>
                      </p>
                      <p className="mt-0.5 text-2xs text-muted">
                        {kindLabel(r.kind)} · {r.status}
                        {r.owner && <> · {r.owner}</>}
                        {late && <span className="text-critical"> · {late}</span>}
                      </p>
                      {/*
                        Wraps to a second line on a phone, truncates from sm up.
                        `truncate` alone clipped this at 375px: "Valid until 2026-07-30 15:05
                        and never closed out" needs 263px in a 238px column, and it is the
                        tail that carries the reason — the row said when a permit expired and
                        then cut off the part explaining why anyone should care. Two lines is
                        cheap on a screen that scrolls vertically anyway, and on wider screens
                        there is room for one line so the list stays scannable.
                      */}
                      <p className="mt-0.5 line-clamp-2 text-2xs text-muted sm:truncate">{r.detail}</p>
                    </div>
                    <ChevronRight size={14} className="mt-1 shrink-0 text-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
