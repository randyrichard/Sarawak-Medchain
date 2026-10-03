import { useCallback, useEffect, useState } from 'react'
import { Plus, ShieldBan, Undo2 } from 'lucide-react'
import { visitorsApi, type BlacklistEntry } from '@/api/visitorsApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Card, CardBody, Dialog, Input, Skeleton, Textarea } from '@/components/ui'
import { fmtDate } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * People, companies and vehicles refused entry.
 *
 * Enforced entirely server-side, at pre-registration and again at the gate. This screen
 * only manages the list; it never decides anything, which is why an entry can be added
 * here and take effect on a check-in happening at another terminal a second later.
 *
 * Entries are lifted, never deleted: the record of having refused somebody outlives the
 * ban, and a lapsed entry is history worth keeping.
 */
export function BlacklistPanel({
  companyId, onChanged,
}: {
  companyId: string
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<BlacklistEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    visitorsApi.listBlacklist(companyId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the blacklist.')
      })
  }, [companyId])

  useEffect(() => { load() }, [load])

  const lift = async (row: BlacklistEntry) => {
    setBusy(row.id)
    setError(null)
    try {
      await visitorsApi.liftBlacklist(row.id)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not lift that entry.')
    } finally {
      setBusy(null)
    }
  }

  const inForce = rows?.filter((r) => r.inForce) ?? []

  return (
    <Card>
      <CardBody>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <ShieldBan size={12} /> Blacklist
          {inForce.length > 0 && <span className="text-critical">({inForce.length} in force)</span>}
        </p>

        {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

        {rows === null ? (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-2xs text-muted">
            Nobody is refused entry. Adding an entry here blocks pre-registration and the
            gate, on the server, immediately.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className={cn(
                'rounded-lg border px-3 py-2',
                r.inForce ? 'border-critical/60 bg-critical-soft/20' : 'opacity-70',
              )}>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                  {[r.idNumber, r.phone, r.visitorCompany, r.vehicleNumber]
                    .filter(Boolean).join(' · ')}
                  {r.inForce
                    ? <Badge tone="critical">{r.permanent ? 'Permanent' : 'In force'}</Badge>
                    : <Badge tone="neutral">{r.active ? 'Lapsed' : 'Lifted'}</Badge>}
                </p>
                <p className="text-2xs text-ink">{r.reason}</p>
                <p className="text-2xs text-muted">
                  Added {fmtDate(r.addedAt)} by {r.addedBy}
                  {r.expiresAt && <> · expires {fmtDate(r.expiresAt)}</>}
                  {r.liftedAt && <> · lifted {fmtDate(r.liftedAt)} by {r.liftedBy}</>}
                </p>
                {r.active && (
                  <Button size="sm" variant="ghost" icon={<Undo2 size={11} />} className="mt-1"
                    loading={busy === r.id} onClick={() => void lift(r)}>
                    Lift
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          onClick={() => setAddOpen(true)}>
          Refuse entry
        </Button>

        <AddDialog
          open={addOpen} companyId={companyId}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load(); onChanged?.() }}
        />
      </CardBody>
    </Card>
  )
}

function AddDialog({
  open, companyId, onClose, onAdded,
}: { open: boolean; companyId: string; onClose: () => void; onAdded: () => void }) {
  const [idNumber, setIdNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [visitorCompany, setVisitorCompany] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIdNumber(''); setPhone(''); setVisitorCompany(''); setVehicleNumber('')
    setReason(''); setExpiresAt(''); setError(null)
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await visitorsApi.addToBlacklist({
        companyId,
        idNumber: idNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        visitorCompany: visitorCompany.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        reason: reason.trim(),
        expiresAt: expiresAt || null,
      })
      onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that entry.')
    } finally {
      setBusy(false)
    }
  }

  const hasMatch = [idNumber, phone, visitorCompany, vehicleNumber].some((v) => v.trim())

  return (
    <Dialog open={open} onClose={onClose} title="Refuse entry">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <p className="text-2xs text-muted">
          Give at least one detail to match on. Matching ignores spacing and case, so
          &ldquo;QAB 1234&rdquo; and &ldquo;qab-1234&rdquo; are the same vehicle.
        </p>

        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Input label="IC or passport" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
          <Input label="Company" value={visitorCompany} onChange={(e) => setVisitorCompany(e.target.value)} />
          <Input label="Vehicle" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
        </div>

        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Removed from site for tampering with an isolation." />

        <Input label="Expires" type="date" value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          hint="Leave blank for a permanent ban." />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}
            disabled={!hasMatch || !reason.trim()}>
            Refuse entry
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
