import { useMemo, useState } from 'react'
import { CalendarClock, MapPin, Monitor, PlayCircle, Plus, Users } from 'lucide-react'
import type { SessionView } from '@/api/training'
import type { Actor } from '@/api/incidents'
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, StatusPill } from '@/components/ui'
import { AttendanceRunner } from './AttendanceRunner'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'scheduled' | 'completed'

export function SessionsPanel({
  sessions, actor, runner, onOpenNew, onChanged,
}: {
  sessions: SessionView[] | null
  actor: Actor
  runner: boolean
  onOpenNew: () => void
  onChanged: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [runFor, setRunFor] = useState<SessionView | null>(null)

  const rows = useMemo(() => {
    if (!sessions) return []
    return sessions.filter((s) => filter === 'all' || (filter === 'scheduled' ? s.status === 'Scheduled' : s.status === 'Completed'))
  }, [sessions, filter])

  const canRun = (s: SessionView) => runner || s.trainer === actor.name

  if (sessions === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</Card>
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(['all', 'scheduled', 'completed'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors', filter === f ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink')}
            style={filter === f ? { borderColor: 'var(--accent)' } : undefined}>
            {f}
          </button>
        ))}
        {runner && <Button size="sm" className="ml-auto" icon={<Plus size={13} />} onClick={onOpenNew}>New session</Button>}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No sessions">Schedule a training session to get started.</EmptyState>
        ) : (
          <ul className="divide-y">
            {rows.map((s) => (
              <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3.5', s.overdue && 'bg-critical-soft/40')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-ink">{s.courseName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-muted">
                    <span className="font-mono">{s.code}</span>
                    <span className="inline-flex items-center gap-1"><Users size={10} /> {s.enrolledCount} enrolled</span>
                    <span className="inline-flex items-center gap-1">{s.mode === 'online' ? <Monitor size={10} /> : <MapPin size={10} />} {s.venue}</span>
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-ink-2" title={`Trainer: ${s.trainer}`}>
                  <Avatar name={s.trainer} size={18} /> {s.trainer}
                </span>
                <span className={cn('w-24 text-xs font-semibold', s.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {s.scheduledFor}
                  <span className="block text-2xs font-normal">
                    {s.status === 'Completed' ? `${s.passedCount} passed` : s.overdue ? `${Math.abs(s.daysToStart)}d overdue` : s.daysToStart === 0 ? 'today' : `in ${s.daysToStart}d`}
                  </span>
                </span>
                {s.status === 'Completed' ? (
                  <Badge tone="good">Completed</Badge>
                ) : canRun(s) ? (
                  <Button size="sm" icon={<PlayCircle size={12} />} onClick={() => setRunFor(s)}>Run</Button>
                ) : (
                  <StatusPill kind={s.overdue ? 'critical' : 'info'} label={s.overdue ? 'Overdue' : 'Scheduled'} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* onCompleted refreshes data but keeps the runner mounted so it can show its
          certificate-issued confirmation; the runner closes itself via onClose. */}
      <AttendanceRunner session={runFor} onClose={() => setRunFor(null)} onCompleted={onChanged} />
    </>
  )
}
