import { useMemo, useState, type DragEvent } from 'react'
import { AlertOctagon, GripVertical, Link2 } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { COLUMN_OF, type CapaItem, type KanbanColumn } from '@/api/capa'
import type { Actor } from '@/api/incidents'
import { Alert, Avatar, Badge, Button, Dialog, Skeleton, Textarea } from '@/components/ui'
import { ProgressLine } from './ProgressLine'
import { canEditItem, canVerifyItem, dueLabel } from '../lib'
import { cn } from '@/lib/cn'

const COLUMNS: { id: KanbanColumn; hint: string }[] = [
  { id: 'Open', hint: 'New findings, no owner yet' },
  { id: 'Assigned', hint: 'Owned, not started' },
  { id: 'In Progress', hint: 'Being worked' },
  { id: 'Verification', hint: 'Done — evidence under review' },
  { id: 'Completed', hint: 'Verified & closed' },
]

export function KanbanBoard({
  items, actor, readOnly, onOpen, onChanged,
}: {
  items: CapaItem[] | null
  actor: Actor
  readOnly: boolean
  onOpen: (id: string) => void
  onChanged: (item: CapaItem) => void
}) {
  const [hoverCol, setHoverCol] = useState<KanbanColumn | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completeFor, setCompleteFor] = useState<CapaItem | null>(null)
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => {
    const map: Record<KanbanColumn, CapaItem[]> = { Open: [], Assigned: [], 'In Progress': [], Verification: [], Completed: [] }
    ;(items ?? []).forEach((i) => {
      const col = COLUMN_OF[i.derived]
      if (col) map[col].push(i)
    })
    return map
  }, [items])

  const apply = async (fn: () => Promise<CapaItem>) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await fn())
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That move was rejected.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = (id: string, target: KanbanColumn) => {
    setHoverCol(null)
    setDraggingId(null)
    const item = items?.find((i) => i.id === id)
    if (!item) return
    const from = COLUMN_OF[item.derived]
    if (from === target) return
    setError(null)

    if (readOnly || !canEditItem(actor, item)) {
      setError('You can only move actions assigned to you or within your scope.')
      return
    }

    switch (target) {
      case 'In Progress':
        void apply(() => api.updateCapa(item.id, { status: 'In Progress' }, actor))
        break
      case 'Verification':
        // completing needs evidence when required — collect it, then transition
        setEvidence(item.evidenceNote ?? '')
        setCompleteFor(item)
        break
      case 'Completed':
        if (item.derived !== 'Waiting Verification') {
          setError('Actions reach Completed through verification — complete it first, then the reviewer signs off.')
          return
        }
        if (!canVerifyItem(actor, item)) {
          setError('Verification needs the assigned reviewer or an HSE Manager/Admin.')
          return
        }
        void apply(() => api.updateCapa(item.id, { status: 'Verified' }, actor))
        break
      case 'Assigned':
      case 'Open':
        setError('Use "Send back for rework" in the action workspace instead of dragging backwards — it records why.')
        break
    }
  }

  const confirmComplete = async () => {
    if (!completeFor) return
    const ok = await apply(() => api.updateCapa(completeFor.id, { status: 'Completed', evidenceNote: evidence }, actor))
    if (ok) {
      setCompleteFor(null)
      setEvidence('')
    }
  }

  if (items === null) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {COLUMNS.map((c) => (
          <div key={c.id} className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const colItems = grouped[col.id]
          const hovered = hoverCol === col.id
          return (
            <div
              key={col.id}
              onDragOver={(e: DragEvent) => {
                e.preventDefault()
                setHoverCol(col.id)
              }}
              onDragLeave={() => setHoverCol((c) => (c === col.id ? null : c))}
              onDrop={(e: DragEvent) => {
                e.preventDefault()
                handleDrop(e.dataTransfer.getData('text/plain'), col.id)
              }}
              className={cn(
                'flex min-h-[300px] flex-col rounded-xl border bg-sunken/60 p-2 transition-all',
                hovered && 'border-[var(--accent)] bg-accent-soft',
              )}
            >
              <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <span className="text-xs font-bold text-ink" title={col.hint}>{col.id}</span>
                <Badge tone={col.id === 'Verification' && colItems.length > 0 ? 'warning' : 'neutral'}>{colItems.length}</Badge>
              </div>
              <div className="flex-1 space-y-2">
                {colItems.map((item, idx) => (
                  <KanbanCard
                    key={item.id}
                    item={item}
                    index={idx}
                    dragging={draggingId === item.id}
                    draggable={!readOnly}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(item.id)
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onOpen(item.id)}
                  />
                ))}
                {colItems.length === 0 && (
                  <p className="px-2 py-6 text-center text-2xs text-muted">{hovered ? 'Drop here' : 'Empty'}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog
        open={completeFor !== null}
        onClose={() => setCompleteFor(null)}
        title={`Complete ${completeFor?.code}`}
        description={completeFor?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteFor(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => void confirmComplete()}>Mark completed</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Textarea
            label={completeFor?.evidenceRequired ? 'Completion evidence (required)' : 'Completion note (optional)'}
            rows={3}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="What proves this is done? Photos, records, sign-offs…"
          />
          <p className="text-2xs text-muted">The action moves to Verification — the reviewer signs off before it can close.</p>
        </div>
      </Dialog>
    </>
  )
}

function KanbanCard({
  item, index, dragging, draggable, onDragStart, onDragEnd, onClick,
}: {
  item: CapaItem
  index: number
  dragging: boolean
  draggable: boolean
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onClick: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'group animate-rise cursor-grab rounded-xl border bg-surface p-3 shadow-card transition-all',
        'hover:-translate-y-0.5 hover:shadow-pop active:cursor-grabbing',
        dragging && 'rotate-2 opacity-60',
        item.overdue && 'border-[var(--critical)]',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-mono text-2xs text-muted">{item.code}</span>
        <span className="flex items-center gap-1">
          {item.overdue && <AlertOctagon size={12} style={{ color: 'var(--critical)' }} aria-label="Overdue" />}
          <Badge tone={item.priority === 'High' ? 'critical' : item.priority === 'Medium' ? 'warning' : 'neutral'}>
            {item.priority}
          </Badge>
          <GripVertical size={13} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink">{item.title}</p>
      {item.incidentNumber && (
        <p className="mt-1 flex items-center gap-1 text-2xs text-muted">
          <Link2 size={10} /> {item.incidentNumber}
          {item.rootCause && <span>· {item.rootCause}</span>}
        </p>
      )}
      <div className="mt-2"><ProgressLine value={item.progress} overdue={item.overdue} /></div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-2xs text-ink-2">
          <Avatar name={item.owner || '?'} size={16} />
          <span className="truncate">{item.owner || 'Unassigned'}</span>
        </span>
        <span
          className={cn('shrink-0 text-2xs font-semibold', item.overdue ? 'text-critical' : 'text-muted')}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {dueLabel(item)}
        </span>
      </div>
    </div>
  )
}
