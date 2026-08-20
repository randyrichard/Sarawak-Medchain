import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserCheck, UserMinus, HardHat, FileCheck, ExternalLink } from 'lucide-react'
import {
  equipmentApi, type AssetCurrentPermit, type AssetHolder,
} from '@/api/equipmentApi'
import { listEquipmentHolders, type EquipmentHolderOption } from '@/api/equipmentHolders'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, PersonRegisterOptions, Select, Skeleton } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'

/**
 * Who is holding this equipment, and what live permit it is on.
 *
 * Two different claims, shown together because they answer the same operational question:
 * where is this thing right now. The holder is a person in the workforce or contractor
 * register rather than a typed name, which is what lets "who was holding the harness that
 * failed" be answered from the equipment side.
 *
 * Only live permits appear. Equipment on a permit that closed last week is not in use, and
 * showing it that way keeps a usable detector on the shelf.
 */
export function AssetHolderPanel({
  assetId, companyId, manage, revision, onChanged,
}: {
  assetId: string
  companyId: string
  manage: boolean
  revision?: number
  onChanged?: () => void
}) {
  const [holder, setHolder] = useState<AssetHolder | null | undefined>(undefined)
  const [permit, setPermit] = useState<AssetCurrentPermit | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    equipmentApi.holder(assetId).then(setHolder).catch(() => setHolder(null))
    equipmentApi.currentPermit(assetId).then(setPermit).catch(() => setPermit(null))
  }, [assetId])

  useEffect(() => { load() }, [load, revision])

  const release = async () => {
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.update(assetId, { assignedEmployeeId: null, assignedContractorWorkerId: null })
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not return that equipment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <UserCheck size={12} /> Assignment
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {holder === undefined ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : holder === null ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-2xs text-muted">
          In the pool. Nobody is holding this at the moment.
        </p>
      ) : (
        <div className="rounded-lg border px-3 py-2">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
            {holder.kind === 'contractor' && <HardHat size={12} className="text-muted" />}
            {holder.name}
            {!holder.active && <Badge tone="critical">No longer active</Badge>}
          </p>
          <p className="text-2xs text-muted">
            <span className="font-mono">{holder.reference}</span>
            {holder.detail && <> · {holder.detail}</>}
            {' · '}{holder.kind === 'contractor' ? 'contractor' : 'employee'}
          </p>
        </div>
      )}

      {manage && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" icon={<UserCheck size={11} />}
            onClick={() => setAssignOpen(true)}>
            {holder ? 'Reassign' : 'Assign'}
          </Button>
          {holder && (
            <Button size="sm" variant="ghost" icon={<UserMinus size={11} />} loading={busy}
              onClick={() => void release()}>
              Return to pool
            </Button>
          )}
        </div>
      )}

      {/* The live permit. Read-only here: booking happens on the permit, where the gate is. */}
      <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <FileCheck size={12} /> Current permit
      </p>
      {permit === undefined ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : permit === null ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-2xs text-muted">
          Not booked onto any live permit.
        </p>
      ) : (
        <div className="rounded-lg border border-accent/50 bg-accent-soft/30 px-3 py-2">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
            <span className="font-mono">{permit.code}</span>
            <Badge tone={permit.status === 'suspended' ? 'warning' : 'accent'}>{permit.status}</Badge>
          </p>
          <p className="text-2xs text-ink">{permit.title}</p>
          <p className="text-2xs text-muted">
            {permit.location} · valid to {fmtDateTime(permit.validTo)}
            {permit.purpose && <> · {permit.purpose}</>}
          </p>
          <Link
            to={`/permits?open=${permit.permitId}`}
            className="mt-1 inline-flex items-center gap-1 text-2xs text-accent hover:underline"
          >
            Open permit <ExternalLink size={9} />
          </Link>
        </div>
      )}

      <AssignDialog
        open={assignOpen} assetId={assetId} companyId={companyId}
        onClose={() => setAssignOpen(false)}
        onSaved={() => { setAssignOpen(false); load(); onChanged?.() }}
      />
    </section>
  )
}

function AssignDialog({
  open, assetId, companyId, onClose, onSaved,
}: {
  open: boolean
  assetId: string
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [people, setPeople] = useState<EquipmentHolderOption[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(''); setError(null); setPeople(null)
    listEquipmentHolders(companyId)
      .then(setPeople)
      .catch((e) => {
        // Said out loud. An empty picker reads as "nobody works here", which sends the
        // operator to raise a ticket about the workforce register instead of this.
        setPeople([])
        setError(e instanceof ApiError ? e.message : 'Could not load the list of people.')
      })
  }, [open, companyId])

  const submit = async () => {
    const person = people?.find((p) => `${p.kind}:${p.id}` === chosen)
    if (!person) return
    setBusy(true)
    setError(null)
    try {
      // One holder: setting either side clears the other, server-side.
      await equipmentApi.update(assetId, person.kind === 'employee'
        ? { assignedEmployeeId: person.id }
        : { assignedContractorWorkerId: person.id })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not assign that equipment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Assign this equipment">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        {people === null ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : (
          /*
           * The empty case matters most here. Every other entry in this list is a real
           * person, so with both registers empty the picker previously offered nothing
           * selectable but the placeholder - equipment could not be handed to anybody, and
           * the screen gave no reason why.
           */
          <Select label="Hand it to" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Choose a person…</option>
            <PersonRegisterOptions
              people={people}
              emptyHint="— Nobody in the registers yet. Add them under Employees or Contractors —"
            />
          </Select>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!chosen}>
            Assign
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
