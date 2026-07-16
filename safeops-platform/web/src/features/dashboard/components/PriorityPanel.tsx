import { useState } from 'react'
import {
  CalendarClock, ClipboardList, FileBadge, GraduationCap, ListChecks, SearchCheck, ArrowRight,
} from 'lucide-react'
import type { PriorityItem, PriorityKind } from '@/api/dashboard'
import {
  Avatar, Badge, Button, Card, CardHeader, Dialog, EmptyState, SkeletonRows, StatusPill,
} from '@/components/ui'
import { cn } from '@/lib/cn'

const KIND_META: Record<PriorityKind, { icon: typeof ListChecks; label: string }> = {
  action: { icon: ListChecks, label: 'Corrective action' },
  incident: { icon: ClipboardList, label: 'High-risk incident' },
  permit: { icon: FileBadge, label: 'Permit' },
  audit: { icon: CalendarClock, label: 'Audit' },
  training: { icon: GraduationCap, label: 'Training' },
  inspection: { icon: SearchCheck, label: 'Inspection' },
}

const PRIORITY_KIND = { Critical: 'critical', High: 'serious', Medium: 'warning' } as const

export function PriorityPanel({
  items, loading, className,
}: {
  items: PriorityItem[] | undefined
  loading: boolean
  className?: string
}) {
  const [open, setOpen] = useState<PriorityItem | null>(null)
  const [handled, setHandled] = useState<Set<string>>(new Set())

  const visible = (items ?? []).filter((i) => !handled.has(i.id))

  return (
    <Card className={className}>
      <CardHeader
        title="Priority actions"
        subtitle="Ranked by risk — clear this list and today is under control"
        right={
          !loading && visible.length > 0 ? (
            <Badge tone={visible.some((i) => i.priority === 'Critical') ? 'critical' : 'warning'}>
              {visible.length} open
            </Badge>
          ) : undefined
        }
      />
      <div className="px-3 pb-3 pt-1">
        {loading ? (
          <div className="px-2 py-2"><SkeletonRows rows={5} /></div>
        ) : visible.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nothing needs you right now">
            Every critical item is assigned and on schedule. New priorities appear here the moment something slips.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {visible.map((item, i) => {
              const Icon = KIND_META[item.kind].icon
              return (
                <li key={item.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="group flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent-soft/40">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'var(--accent-soft)' }}
                    >
                      <Icon size={15} className="text-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill kind={PRIORITY_KIND[item.priority]} label={item.priority} />
                        <span className="text-2xs text-muted">{KIND_META[item.kind].label}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold leading-snug text-ink">{item.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Avatar name={item.owner} size={16} /> {item.owner}
                        </span>
                        <span>{item.site} · {item.department}</span>
                        <span className={cn('font-semibold', item.overdue ? 'text-critical' : 'text-ink-2')}>
                          {item.dueLabel}
                        </span>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" className="mt-1 shrink-0" onClick={() => setOpen(item)}>
                      {item.cta}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? ''}
        description={open ? `${KIND_META[open.kind].label} · ${open.site} · ${open.department}` : undefined}
        width="max-w-lg"
        footer={
          open && (
            <>
              <Button variant="secondary" onClick={() => setOpen(null)}>Not now</Button>
              <Button
                onClick={() => {
                  setHandled((cur) => new Set(cur).add(open.id))
                  setOpen(null)
                }}
              >
                Mark as handled
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill kind={PRIORITY_KIND[open.priority]} label={`${open.priority} priority`} />
              <Badge tone={open.overdue ? 'critical' : 'neutral'}>{open.dueLabel}</Badge>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                <Avatar name={open.owner} size={18} /> {open.owner}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">{open.detail}</p>
            <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--accent)' }}>
              <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent">
                <ArrowRight size={11} /> Recommended next step
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{open.recommended}</p>
            </div>
            <p className="text-2xs text-muted">
              Full workflow actions (assign, escalate, verify) connect when the Incidents and Actions modules ship.
              "Mark as handled" clears it from today's list.
            </p>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
