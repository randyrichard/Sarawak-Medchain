import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Eye, PlayCircle } from 'lucide-react'
import type { ChecklistAnswer, InspectionView } from '@/api/assets'
import type { Actor } from '@/api/incidents'
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Skeleton, StatusPill } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'scheduled' | 'overdue' | 'completed' | 'failed'

export function InspectionsList({
  inspections, actor, manage, onRun, onOpenAsset,
}: {
  inspections: InspectionView[] | null
  actor: Actor
  manage: boolean
  onRun: (i: InspectionView) => void
  onOpenAsset: (assetId: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [viewResult, setViewResult] = useState<InspectionView | null>(null)

  const rows = useMemo(() => {
    if (!inspections) return []
    return inspections.filter((i) => {
      switch (filter) {
        case 'all': return true
        case 'scheduled': return i.status === 'Scheduled'
        case 'overdue': return i.overdue
        case 'completed': return i.status === 'Completed'
        case 'failed': return i.outcome === 'failed'
      }
    })
  }, [inspections, filter])

  const canRun = (i: InspectionView) => manage || i.assignedTo === actor.name

  if (inspections === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</Card>
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', 'scheduled', 'overdue', 'completed', 'failed'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors', filter === f ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink')}
            style={filter === f ? { borderColor: 'var(--accent)' } : undefined}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No inspections match">
            Schedule inspections from any asset's profile in the Register.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {rows.map((i) => (
              <li key={i.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', i.overdue && 'bg-critical-soft/40')}>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenAsset(i.assetId)}>
                  <p className="text-sm font-semibold leading-snug text-ink">{i.assetName}</p>
                  <p className="text-2xs text-muted">
                    <span className="font-mono">{i.code}</span> · {i.assetCode} · {i.department}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-ink-2">
                  <Avatar name={i.assignedTo} size={18} /> {i.assignedTo}
                </span>
                <span className={cn('w-24 text-xs font-semibold', i.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {i.status === 'Completed' ? fmtDateTime(i.completedAt!).split(',')[0] : i.scheduledFor}
                  <span className="block text-2xs font-normal">
                    {i.status === 'Completed' ? 'completed' : i.overdue ? `${Math.abs(i.daysToDue)}d overdue` : i.daysToDue === 0 ? 'due today' : `in ${i.daysToDue}d`}
                  </span>
                </span>
                {i.status === 'Completed' ? (
                  <>
                    <StatusPill kind={i.outcome === 'passed' ? 'good' : 'critical'} label={i.outcome === 'passed' ? 'Passed' : 'Failed'} />
                    <Button size="sm" variant="ghost" icon={<Eye size={12} />} onClick={() => setViewResult(i)}>Results</Button>
                  </>
                ) : canRun(i) ? (
                  <Button size="sm" icon={<PlayCircle size={12} />} onClick={() => onRun(i)}>Run</Button>
                ) : (
                  <StatusPill kind={i.overdue ? 'critical' : 'info'} label={i.overdue ? 'Overdue' : 'Scheduled'} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Results dialog */}
      <Dialog
        open={viewResult !== null}
        onClose={() => setViewResult(null)}
        title={`${viewResult?.code} — ${viewResult?.assetName}`}
        description={viewResult ? `${fmtDateTime(viewResult.completedAt!)} · ${viewResult.completedBy} · signed "${viewResult.signature}"` : undefined}
        width="max-w-lg"
      >
        {viewResult && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StatusPill kind={viewResult.outcome === 'passed' ? 'good' : 'critical'} label={viewResult.outcome === 'passed' ? 'Passed' : 'Failed'} />
              {viewResult.photoCount ? <Badge tone="neutral">{viewResult.photoCount} photo(s)</Badge> : null}
              {viewResult.gps && <Badge tone="accent">{viewResult.gps}</Badge>}
            </div>
            {(viewResult.answers ?? []).map((a: ChecklistAnswer) => (
              <div key={a.itemId} className="flex items-start gap-2.5 rounded-lg border px-3 py-2">
                <StatusPill kind={a.result === 'pass' ? 'good' : a.result === 'fail' ? 'critical' : 'info'} label={a.result.toUpperCase()} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ink">{a.label}</p>
                  {a.measurement && <p className="text-2xs text-muted">Measured: {a.measurement}</p>}
                  {a.comment && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{a.comment}</p>}
                </div>
              </div>
            ))}
            {viewResult.comments && <p className="rounded-lg bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-2">{viewResult.comments}</p>}
            {viewResult.actionCodes.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-2xs font-bold uppercase tracking-wider text-muted">Defect actions created</p>
                {viewResult.actionIds.map((id, idx) => (
                  <Link key={id} to={`/actions?open=${id}`} className="block rounded-lg border px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft/50">
                    {viewResult.actionCodes[idx]} — track to completion in CAPA
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
