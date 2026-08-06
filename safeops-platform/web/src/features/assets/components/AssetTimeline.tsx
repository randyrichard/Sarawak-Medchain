import { useEffect, useState } from 'react'
import {
  History, PackagePlus, ClipboardCheck, Gauge, Wrench, AlertTriangle, ArrowRightLeft, FileCheck, UserCheck,
} from 'lucide-react'
import { equipmentApi, type AssetEvent, type AssetEventKind } from '@/api/equipmentApi'
import { ApiError } from '@/api/types'
import { Alert, Skeleton } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * Everything that has happened to one piece of equipment, newest first.
 *
 * Read from a single table written alongside each change rather than assembled from five
 * sources at read time, because a timeline stitched together at read time is a timeline
 * that silently loses the one entry whose source query was forgotten — and this is the
 * view an investigator opens after somebody is hurt.
 */
const KIND_ICON: Record<AssetEventKind, typeof History> = {
  created: PackagePlus,
  assigned: UserCheck,
  inspection: ClipboardCheck,
  calibration: Gauge,
  maintenance: Wrench,
  incident: AlertTriangle,
  status_change: ArrowRightLeft,
  permit: FileCheck,
}

const KIND_TONE: Record<AssetEventKind, string> = {
  created: 'text-muted',
  assigned: 'text-muted',
  inspection: 'text-accent',
  calibration: 'text-accent',
  maintenance: 'text-warning',
  incident: 'text-critical',
  status_change: 'text-warning',
  permit: 'text-accent',
}

export function AssetTimeline({ assetId, revision = 0 }: { assetId: string; revision?: number }) {
  const [rows, setRows] = useState<AssetEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    equipmentApi.timeline(assetId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the history.')
      })
    // `revision` is bumped by the panels above whenever they change something. Without it
    // the history sits stale under a work order that was just raised, which reads as the
    // timeline having missed it.
  }, [assetId, revision])

  return (
    <section className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <History size={12} /> History
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          Nothing recorded yet.
        </p>
      ) : (
        <ol className="space-y-0">
          {rows.map((e, i) => {
            const Icon = KIND_ICON[e.kind] ?? History
            return (
              <li key={e.id} className="flex gap-2.5">
                {/* The rail: a line down the icons, stopped short on the last entry. */}
                <div className="flex flex-col items-center">
                  <span className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-surface',
                    KIND_TONE[e.kind],
                  )}>
                    <Icon size={11} />
                  </span>
                  {i < rows.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className="text-2xs text-ink">{e.summary}</p>
                  {e.detail && <p className="text-2xs text-muted">{e.detail}</p>}
                  <p className="text-2xs text-muted">
                    {fmtDateTime(e.at)} · {e.actor}
                    {e.actorRole && <> ({e.actorRole.replace(/_/g, ' ')})</>}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
