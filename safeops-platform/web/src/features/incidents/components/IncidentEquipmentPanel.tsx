import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, ShieldAlert, Star, ExternalLink } from 'lucide-react'
import { equipmentApi, type IncidentEquipmentRow, type SelectableEquipment } from '@/api/equipmentApi'
import { inspectionsApi } from '@/api/inspectionsApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Card, CardBody, Dialog, Input, Skeleton, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Equipment involved in an incident.
 *
 * Named from the register rather than typed into the description, so the same item
 * accumulating failures is visible from the equipment side. "Third harness failure this
 * year" is a finding; three separate incident reports each mentioning "a harness" is not.
 *
 * Unfit equipment is offered here, unlike on a permit. A permit refuses unfit gear because
 * it is about to be used; an incident often *is* the discovery that the gear was unfit, and
 * refusing to record it would make the failure unreportable.
 */
export function IncidentEquipmentPanel({
  incidentId, companyId, canEdit,
}: {
  incidentId: string
  companyId: string
  canEdit: boolean
}) {
  const [rows, setRows] = useState<IncidentEquipmentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(() => {
    equipmentApi.listForIncident(incidentId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the equipment on this incident.')
      })
  }, [incidentId])

  useEffect(() => { load() }, [load])

  const remove = async (row: IncidentEquipmentRow) => {
    setBusy(row.id)
    setError(null)
    try {
      await equipmentApi.unlinkFromIncident(row.id)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove that equipment.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardBody>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Equipment involved
        </p>

        {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

        {rows === null ? (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
            No equipment named. Naming it from the register is what makes a repeat failure
            of the same item visible later.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                    {r.name}
                    {r.critical && <Badge tone="warning"><Star size={9} className="mr-0.5 inline" />Critical</Badge>}
                    {!r.fit && (
                      <Badge tone="critical"><ShieldAlert size={9} className="mr-0.5 inline" />Not fit</Badge>
                    )}
                  </p>
                  <p className="text-2xs text-muted">
                    <span className="font-mono">{r.code}</span>
                    {r.serialNumber && <> · S/N {r.serialNumber}</>}
                  </p>
                  {r.involvement && <p className="mt-0.5 text-2xs text-ink">{r.involvement}</p>}
                  {r.blockedReason && (
                    <p className="mt-0.5 text-2xs text-critical">{r.blockedReason}</p>
                  )}
                  <Link
                    to={`/assets?qr=${r.code}`}
                    className="mt-1 inline-flex items-center gap-1 text-2xs text-accent hover:underline"
                  >
                    Equipment history <ExternalLink size={9} />
                  </Link>
                </div>
                {canEdit && (
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

        {canEdit && (
          <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
            onClick={() => setAddOpen(true)}>
            Name equipment
          </Button>
        )}

        <AddDialog
          open={addOpen} incidentId={incidentId} companyId={companyId}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load() }}
        />
      </CardBody>
    </Card>
  )
}

type Candidate = Pick<SelectableEquipment, 'id' | 'code' | 'name' | 'serialNumber' | 'critical'>

function AddDialog({
  open, incidentId, companyId, onClose, onAdded,
}: {
  open: boolean
  incidentId: string
  companyId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [options, setOptions] = useState<Candidate[] | null>(null)
  const [chosen, setChosen] = useState<Candidate | null>(null)
  const [involvement, setInvolvement] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(null); setInvolvement(''); setFilter(''); setError(null); setOptions(null)
    // The whole register, not the permit picker: an incident can involve equipment that is
    // out of service, and usually does.
    inspectionsApi.listAssets(companyId)
      .then((rows) => setOptions(rows.map((a) => ({
        id: a.id, code: a.code, name: a.name,
        serialNumber: a.serialNumber, critical: false,
      }))))
      .catch(() => setOptions([]))
  }, [open, companyId])

  const submit = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.linkToIncident(incidentId, chosen.id, involvement.trim() || undefined)
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not name that equipment.')
    } finally {
      setBusy(false)
    }
  }

  const q = filter.trim().toLowerCase()
  const shown = (options ?? []).filter((o) =>
    !q || o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
    || (o.serialNumber ?? '').toLowerCase().includes(q),
  ).slice(0, 60)

  return (
    <Dialog open={open} onClose={onClose} title="Name equipment involved in this incident">
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
            Nothing in the register matches.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setChosen(o)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition hover:border-accent hover:bg-accent-soft/40',
                    chosen?.id === o.id && 'border-accent bg-accent-soft/60',
                  )}
                >
                  <p className="text-sm text-ink">{o.name}</p>
                  <p className="text-2xs text-muted">
                    <span className="font-mono">{o.code}</span>
                    {o.serialNumber && <> · S/N {o.serialNumber}</>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Textarea
          label="How it was involved"
          placeholder="e.g. Lanyard stitching parted under load"
          value={involvement}
          onChange={(e) => setInvolvement(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!chosen}>
            Name equipment
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
