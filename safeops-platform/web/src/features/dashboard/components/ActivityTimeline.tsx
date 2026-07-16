import {
  ClipboardList, SearchCheck, ListChecks, CheckCircle2, CalendarClock, GraduationCap,
} from 'lucide-react'
import type { TimelineEvent, TimelineKind } from '@/api/dashboard'
import { Card, CardHeader, SkeletonRows } from '@/components/ui'
import { timeAgo } from '@/lib/time'

const KIND: Record<TimelineKind, { icon: typeof ClipboardList; color: string }> = {
  incident_reported: { icon: ClipboardList, color: 'var(--s6)' },
  investigation_started: { icon: SearchCheck, color: 'var(--s1)' },
  action_assigned: { icon: ListChecks, color: 'var(--s3)' },
  action_completed: { icon: CheckCircle2, color: 'var(--good)' },
  audit_created: { icon: CalendarClock, color: 'var(--s5)' },
  training_completed: { icon: GraduationCap, color: 'var(--s2)' },
}

export function ActivityTimeline({
  events, loading, className,
}: {
  events: TimelineEvent[] | undefined
  loading: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader title="Recent activity" subtitle="The live pulse — every event timestamped and audited" />
      <div className="px-5 pb-5 pt-1">
        {loading || !events ? (
          <SkeletonRows rows={6} />
        ) : (
          <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[13px] before:top-1 before:w-px before:bg-grid">
            {events.map((event) => {
              const meta = KIND[event.kind]
              const Icon = meta.icon
              return (
                <li key={event.id} className="relative flex gap-3 pl-0.5">
                  <span
                    className="z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border bg-surface"
                    style={{ borderColor: meta.color }}
                  >
                    <Icon size={13} style={{ color: meta.color }} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm leading-snug text-ink-2">
                      <span className="font-semibold text-ink">{event.actor}</span> {event.text}{' '}
                      <span className="font-medium text-ink">{event.target}</span>
                    </p>
                    <p className="mt-0.5 text-2xs text-muted">{timeAgo(event.at)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Card>
  )
}
