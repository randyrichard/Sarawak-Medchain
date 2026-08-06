import { useCallback, useEffect, useState } from 'react'
import { Wrench, Plus, AlertTriangle } from 'lucide-react'
import {
  MAINTENANCE_KIND_LABEL, MAINTENANCE_STATUS_LABEL, equipmentApi,
  type MaintenanceKind, type MaintenancePriority, type WorkOrder,
} from '@/api/equipmentApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Input, Select, Skeleton, Textarea } from '@/components/ui'
import { fmtDate } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * Work orders against a piece of equipment.
 *
 * Downtime and cost are recorded per job rather than inferred from the timestamps: a job
 * paused overnight does not mean the plant was down overnight, and the downtime figure is
 * the one a plant manager is judged on.
 *
 * Returning an item to service is a separate decision from closing the job, because a work
 * order can be completed with the item still unfit — the part was ordered, not fitted.
 */
export function MaintenancePanel({
  assetId, manage, onChanged,
}: {
  assetId: string
  manage: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<WorkOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [closing, setClosing] = useState<WorkOrder | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    equipmentApi.listWorkOrders(assetId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the maintenance history.')
      })
  }, [assetId])

  useEffect(() => { load() }, [load])

  const start = async (w: WorkOrder) => {
    setBusy(w.id)
    setError(null)
    try {
      await equipmentApi.updateWorkOrder(w.id, { status: 'in_progress' })
      load(); onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start that work order.')
    } finally {
      setBusy(null)
    }
  }

  const open = rows?.filter((w) => w.status === 'open' || w.status === 'in_progress') ?? []
  const overdue = open.filter((w) => w.overdue)

  return (
    <section className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Wrench size={12} /> Maintenance
        {overdue.length > 0 && <span className="text-critical">({overdue.length} overdue)</span>}
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {rows === null ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          No work orders. Raising one against this item records the downtime and the cost
          against the equipment, not against a spreadsheet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((w) => (
            <li key={w.id} className={cn(
              'rounded-lg border px-3 py-2',
              w.overdue && 'border-critical/60 bg-critical-soft/30',
            )}>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                <span className="font-mono">{w.code}</span>
                <Badge tone={w.kind === 'emergency' ? 'critical' : w.kind === 'corrective' ? 'warning' : 'neutral'}>
                  {MAINTENANCE_KIND_LABEL[w.kind]}
                </Badge>
                <Badge tone={w.status === 'completed' ? 'good' : w.status === 'cancelled' ? 'neutral' : 'accent'}>
                  {MAINTENANCE_STATUS_LABEL[w.status]}
                </Badge>
                {w.overdue && (
                  <Badge tone="critical"><AlertTriangle size={9} className="mr-0.5 inline" />Overdue</Badge>
                )}
              </p>
              <p className="mt-0.5 text-2xs text-ink">{w.description}</p>
              <p className="text-2xs text-muted">
                Raised {fmtDate(w.raisedAt)} by {w.raisedBy}
                {w.assignedTo && <> · assigned to {w.assignedTo}</>}
                {w.dueAt && <> · due {fmtDate(w.dueAt)}</>}
              </p>
              {w.status === 'completed' && (
                <p className="text-2xs text-muted">
                  {w.downtimeMinutes > 0 && <>Downtime {formatDowntime(w.downtimeMinutes)} · </>}
                  {w.cost > 0 && <>RM {w.cost.toFixed(2)} · </>}
                  closed by {w.closedBy}
                </p>
              )}
              {w.partsUsed && <p className="text-2xs text-muted">Parts: {w.partsUsed}</p>}
              {w.closingNote && <p className="mt-0.5 text-2xs text-ink">{w.closingNote}</p>}

              {manage && (w.status === 'open' || w.status === 'in_progress') && (
                <div className="mt-1.5 flex gap-1.5">
                  {w.status === 'open' && (
                    <Button size="sm" variant="ghost" loading={busy === w.id}
                      onClick={() => void start(w)}>
                      Start work
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setClosing(w)}>
                    Close out
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          onClick={() => setRaiseOpen(true)}>
          Raise work order
        </Button>
      )}

      <RaiseDialog
        open={raiseOpen} assetId={assetId}
        onClose={() => setRaiseOpen(false)}
        onSaved={() => { setRaiseOpen(false); load(); onChanged?.() }}
      />
      <CloseOutDialog
        workOrder={closing}
        onClose={() => setClosing(null)}
        onSaved={() => { setClosing(null); load(); onChanged?.() }}
      />
    </section>
  )
}

/** Minutes are what is stored; hours are what people say. */
function formatDowntime(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function RaiseDialog({
  open, assetId, onClose, onSaved,
}: { open: boolean; assetId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<MaintenanceKind>('corrective')
  const [priority, setPriority] = useState<MaintenancePriority>('medium')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [takeOut, setTakeOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setKind('corrective'); setPriority('medium'); setDescription('')
    setAssignedTo(''); setDueAt(''); setTakeOut(false); setError(null)
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.raiseWorkOrder(assetId, {
        kind, priority, description,
        assignedTo: assignedTo || undefined,
        dueAt: dueAt || undefined,
        // Emergency work takes the item out regardless; the server decides, this is only
        // the extra case where planned work also needs the item down.
        takeOutOfService: kind === 'emergency' ? undefined : takeOut,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not raise that work order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Raise a work order">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Select label="Kind of work" value={kind}
            onChange={(e) => setKind(e.target.value as MaintenanceKind)}>
            {(Object.keys(MAINTENANCE_KIND_LABEL) as MaintenanceKind[]).map((k) => (
              <option key={k} value={k}>{MAINTENANCE_KIND_LABEL[k]}</option>
            ))}
          </Select>
          <Select label="Priority" value={priority}
            onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>

        <Textarea label="What needs doing" value={description} required
          onChange={(e) => setDescription(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Assigned to" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          <Input label="Due by" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>

        {kind === 'emergency' ? (
          <Alert tone="warning">
            Emergency work takes this equipment out of service straight away, so the next
            shift cannot book it onto a permit.
          </Alert>
        ) : (
          <label className="flex items-start gap-2 text-2xs text-ink">
            <input type="checkbox" checked={takeOut} className="mt-0.5"
              onChange={(e) => setTakeOut(e.target.checked)} />
            <span>
              Take out of service while this work is open.
              <span className="block text-muted">
                Stops it being booked onto a permit until the job is closed out.
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!description.trim()}>
            Raise work order
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function CloseOutDialog({
  workOrder, onClose, onSaved,
}: { workOrder: WorkOrder | null; onClose: () => void; onSaved: () => void }) {
  const [downtime, setDowntime] = useState('')
  const [cost, setCost] = useState('')
  const [partsUsed, setPartsUsed] = useState('')
  const [closingNote, setClosingNote] = useState('')
  const [returnToService, setReturnToService] = useState(true)
  const [cancel, setCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workOrder) return
    setDowntime(''); setCost(''); setPartsUsed(''); setClosingNote('')
    setReturnToService(true); setCancel(false); setError(null)
  }, [workOrder])

  const submit = async () => {
    if (!workOrder) return
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.updateWorkOrder(workOrder.id, {
        status: cancel ? 'cancelled' : 'completed',
        downtimeMinutes: downtime ? Number(downtime) : undefined,
        cost: cost ? Number(cost) : undefined,
        partsUsed: partsUsed || undefined,
        closingNote: closingNote || undefined,
        returnToService,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not close that work order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!workOrder} onClose={onClose} title={`Close out ${workOrder?.code ?? ''}`}>
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Downtime (minutes)" type="number" min={0} value={downtime}
            onChange={(e) => setDowntime(e.target.value)} />
          <Input label="Cost (RM)" type="number" min={0} step="0.01" value={cost}
            onChange={(e) => setCost(e.target.value)} />
        </div>

        <Input label="Parts used" value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} />

        <Textarea label="What was done" value={closingNote} required
          onChange={(e) => setClosingNote(e.target.value)} />

        {/*
          Asked, not assumed. A completed work order does not always mean the equipment is
          fit — the part may have been ordered rather than fitted.
        */}
        <label className="flex items-start gap-2 text-2xs text-ink">
          <input type="checkbox" checked={returnToService} className="mt-0.5"
            onChange={(e) => setReturnToService(e.target.checked)} />
          <span>
            Return this equipment to service.
            <span className="block text-muted">
              Leave unticked if it is still not fit to use.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-2 text-2xs text-muted">
          <input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
          Cancel this work order instead of completing it
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button onClick={() => void submit()} loading={busy}
            disabled={!cancel && !closingNote.trim()}>
            {cancel ? 'Cancel work order' : 'Complete work order'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
