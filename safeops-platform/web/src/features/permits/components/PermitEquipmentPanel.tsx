import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, ShieldAlert, ShieldCheck, Star } from 'lucide-react'
import {
  equipmentApi, type PermitEquipmentRow, type SelectableEquipment,
} from '@/api/equipmentApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Input, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * The equipment named on this permit, and whether each item may actually be used.
 *
 * Equipment used to be a sentence in the method statement, which meant nothing could tell
 * the difference between a calibrated gas detector and one whose certificate lapsed in
 * March. Naming it from the register is what lets the server refuse: a permit carrying an
 * unfit item cannot go active, and the refusal names the item.
 *
 * Fitness is re-read every time this panel loads rather than cached with the permit,
 * because it changes without anyone touching the permit — a certificate expires at
 * midnight and the same permit that was fit yesterday is not fit this morning.
 */
export function PermitEquipmentPanel({
  permitId, permitStatus, canEdit, onChanged,
}: {
  permitId: string
  permitStatus: string
  canEdit: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<PermitEquipmentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const settled = ['closed', 'archived', 'rejected'].includes(permitStatus)

  const load = useCallback(() => {
    equipmentApi.listForPermit(permitId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the equipment on this permit.')
      })
  }, [permitId])

  useEffect(() => { load() }, [load])

  const remove = async (row: PermitEquipmentRow) => {
    setBusy(row.id)
    setError(null)
    try {
      await equipmentApi.removeFromPermit(row.id)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove that equipment.')
    } finally {
      setBusy(null)
    }
  }

  const unfit = rows?.filter((r) => !r.fit) ?? []

  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Equipment
        {unfit.length > 0 && (
          <span className="text-critical">({unfit.length} not fit for use)</span>
        )}
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {/*
        Stated once at the top as well as per row. An issuer scanning the panel needs to
        know the permit is held before reading eight rows to work out which one holds it.
      */}
      {unfit.length > 0 && (
        <Alert tone="critical" className="mb-2">
          This permit cannot start until the equipment below is put right or removed.
        </Alert>
      )}

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          No equipment named. Naming the gear from the register is what lets SafeChain check
          its inspection and calibration before work starts.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className={cn(
              'flex items-start gap-2 rounded-lg border px-3 py-2',
              !r.fit && 'border-critical/60 bg-critical-soft/30',
            )}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                  {r.name}
                  {r.critical && <Badge tone="warning"><Star size={9} className="mr-0.5 inline" />Critical</Badge>}
                  {r.fit
                    ? <Badge tone="good"><ShieldCheck size={9} className="mr-0.5 inline" />Fit</Badge>
                    : <Badge tone="critical"><ShieldAlert size={9} className="mr-0.5 inline" />Not Fit</Badge>}
                </p>
                <p className="text-2xs text-muted">
                  <span className="font-mono">{r.code}</span>
                  {r.serialNumber && <> · S/N {r.serialNumber}</>}
                  {r.purpose && <> · {r.purpose}</>}
                </p>
                {/* The server's sentence, rendered as-is. Never re-derived here. */}
                {r.blockedReason && (
                  <p className="mt-1 text-2xs font-medium text-critical">{r.blockedReason}</p>
                )}
                {r.fit && r.certificateNumber && (
                  <p className="mt-0.5 text-2xs text-muted">
                    Cert {r.certificateNumber}
                    {r.calibrationExpiry && <> · valid to {r.calibrationExpiry.slice(0, 10)}</>}
                  </p>
                )}
              </div>
              {canEdit && !settled && (
                <button
                  disabled={busy === r.id}
                  aria-label={`Remove ${r.name}`}
                  onClick={() => void remove(r)}
                  className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && !settled && (
        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          onClick={() => setAddOpen(true)}>
          Book Equipment
        </Button>
      )}

      <AddEquipmentDialog
        open={addOpen} permitId={permitId}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); load(); onChanged?.() }}
      />
    </section>
  )
}

function AddEquipmentDialog({
  open, permitId, onClose, onAdded,
}: { open: boolean; permitId: string; onClose: () => void; onAdded: () => void }) {
  const [options, setOptions] = useState<SelectableEquipment[] | null>(null)
  const [chosen, setChosen] = useState<SelectableEquipment | null>(null)
  const [purpose, setPurpose] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(null); setPurpose(''); setFilter(''); setError(null); setOptions(null)
    equipmentApi.selectable(permitId)
      .then(setOptions)
      .catch(() => setOptions([]))
  }, [open, permitId])

  const submit = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.addToPermit(permitId, chosen.id, purpose.trim() || undefined)
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not book that equipment.')
    } finally {
      setBusy(false)
    }
  }

  const q = filter.trim().toLowerCase()
  const shown = (options ?? []).filter((o) =>
    !q || o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
    || (o.serialNumber ?? '').toLowerCase().includes(q),
  )

  return (
    <Dialog open={open} onClose={onClose} title="Book Equipment Onto This Permit">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <Input
          label="Find equipment"
          placeholder="Name, asset code or serial number"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {options === null ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-2xs text-muted">
            Nothing in the register matches. Equipment has to be registered before it can be
            named on a permit.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {shown.map((o) => {
              const disabled = !o.fit || o.alreadyBooked
              return (
                <li key={o.id}>
                  {/*
                    Unfit equipment is listed rather than hidden, and disabled rather than
                    silently absent. An issuer who cannot find the detector concludes the
                    system is wrong and takes it anyway; seeing "calibration expired" is
                    what sends them to the calibration house instead.
                  */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setChosen(o)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left transition',
                      disabled && 'cursor-not-allowed opacity-60',
                      !disabled && 'hover:border-accent hover:bg-accent-soft/40',
                      chosen?.id === o.id && 'border-accent bg-accent-soft/60',
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {o.name}
                      {o.critical && <Badge tone="warning">Critical</Badge>}
                      {o.alreadyBooked && <Badge tone="neutral">Already on This Permit</Badge>}
                    </p>
                    <p className="text-2xs text-muted">
                      <span className="font-mono">{o.code}</span>
                      {o.serialNumber && <> · S/N {o.serialNumber}</>}
                      {o.location && <> · {o.location}</>}
                    </p>
                    {o.blockedReason && (
                      <p className="mt-1 text-2xs font-medium text-critical">{o.blockedReason}</p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <Input
          label="What it is for"
          placeholder="e.g. Atmosphere monitoring during entry"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!chosen}>
            Book Equipment
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
