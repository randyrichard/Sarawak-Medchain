import { CalendarClock, GraduationCap, SearchCheck, FileBadge, BadgeCheck } from 'lucide-react'
import type { EventKind, UpcomingEvent } from '@/api/dashboard'
import { Badge, Card, CardHeader, SkeletonRows } from '@/components/ui'
import { cn } from '@/lib/cn'

const KIND: Record<EventKind, { icon: typeof CalendarClock; label: string }> = {
  audit: { icon: CalendarClock, label: 'Audit' },
  training: { icon: GraduationCap, label: 'Training' },
  inspection: { icon: SearchCheck, label: 'Inspection' },
  permit: { icon: FileBadge, label: 'Permit' },
  certification: { icon: BadgeCheck, label: 'Certification' },
}

function dayParts(date: string) {
  const d = new Date(date + 'T00:00:00')
  return {
    day: d.toLocaleDateString('en-MY', { day: '2-digit' }),
    mon: d.toLocaleDateString('en-MY', { month: 'short' }),
    inDays: Math.round((d.getTime() - new Date('2026-07-16').getTime()) / 86400000),
  }
}

export function EventsList({
  events, loading, className,
}: {
  events: UpcomingEvent[] | undefined
  loading: boolean
  className?: string
}) {
  const thisWeek = (events ?? []).filter((e) => dayParts(e.date).inDays <= 7)
  const later = (events ?? []).filter((e) => dayParts(e.date).inDays > 7)

  const Row = ({ event }: { event: UpcomingEvent }) => {
    const meta = KIND[event.kind]
    const Icon = meta.icon
    const { day, mon, inDays } = dayParts(event.date)
    const urgent = inDays <= 2
    return (
      <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent-soft/40">
        <span
          className={cn('flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border')}
          style={urgent ? { borderColor: 'var(--critical)' } : undefined}
        >
          <span className="text-sm font-bold leading-none text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{day}</span>
          <span className="text-2xs uppercase leading-none text-muted">{mon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{event.title}</p>
          <p className="text-2xs text-muted">
            <Icon size={10} className="mr-1 inline" />
            {meta.label} · {event.site} · {inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`}
          </p>
        </div>
      </li>
    )
  }

  return (
    <Card className={className}>
      <CardHeader title="Upcoming" subtitle="Audits, training, inspections, expiries" />
      <div className="px-3 pb-4 pt-1">
        {loading || !events ? (
          <div className="px-2"><SkeletonRows rows={5} /></div>
        ) : events.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted">Nothing scheduled in this scope.</p>
        ) : (
          <>
            {thisWeek.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1 text-2xs font-bold uppercase tracking-wider text-muted">Next 7 days</p>
                <ul>{thisWeek.map((e) => <Row key={e.id} event={e} />)}</ul>
              </>
            )}
            {later.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-2xs font-bold uppercase tracking-wider text-muted">Further out</p>
                <ul>{later.slice(0, 5).map((e) => <Row key={e.id} event={e} />)}</ul>
              </>
            )}
            {later.length > 5 && (
              <p className="px-2 pt-2 text-2xs text-muted">
                <Badge tone="neutral">+{later.length - 5} more</Badge> full calendar ships with the Compliance module
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
