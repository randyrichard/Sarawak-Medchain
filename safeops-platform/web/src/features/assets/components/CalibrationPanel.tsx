import { useCallback, useEffect, useState } from 'react'
import { Gauge, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  CALIBRATION_RESULT_LABEL, equipmentApi,
  type Calibration, type CalibrationResult, type EquipmentFitness,
} from '@/api/equipmentApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Input, Select, Skeleton } from '@/components/ui'
import { fmtDate } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * Calibration certificates for a measuring instrument.
 *
 * History rather than a "last calibrated" column, because the question an auditor asks is
 * *which* certificate covered the day the reading was taken. The newest certificate is the
 * one in force; recording a new one supersedes its predecessor without erasing it.
 *
 * The fitness verdict is shown here too, so somebody looking at the instrument sees the
 * same sentence the permit desk will see when they try to book it.
 */
export function CalibrationPanel({
  assetId, manage, onChanged,
}: {
  assetId: string
  manage: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<Calibration[] | null>(null)
  const [fitness, setFitness] = useState<EquipmentFitness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(() => {
    Promise.all([equipmentApi.listCalibrations(assetId), equipmentApi.fitness(assetId)])
      .then(([c, f]) => { setRows(c); setFitness(f) })
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the calibration history.')
      })
  }, [assetId])

  useEffect(() => { load() }, [load])

  // Nothing to say about a ladder. The panel appears only where calibration is a control.
  if (fitness && !fitness.calibrationRequired && (rows?.length ?? 0) === 0) return null

  return (
    <section className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Gauge size={12} /> Calibration
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {/* The verdict, in the same words the permit desk gets. */}
      {fitness && (
        <div className={cn(
          'mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-2xs',
          fitness.fit ? 'border-good/50 bg-good-soft/30' : 'border-critical/60 bg-critical-soft/30',
        )}>
          {fitness.fit
            ? <ShieldCheck size={13} className="mt-px shrink-0 text-good" />
            : <ShieldAlert size={13} className="mt-px shrink-0 text-critical" />}
          <div className="min-w-0">
            <p className={cn('font-medium', fitness.fit ? 'text-good' : 'text-critical')}>
              {fitness.fit ? 'Fit for use' : 'Not fit for use'}
            </p>
            {fitness.reason && <p className="text-muted">{fitness.reason}</p>}
            {fitness.fit && fitness.calibrationExpiry && (
              <p className="text-muted">
                Certificate {fitness.certificateNumber} valid to {fmtDate(fitness.calibrationExpiry)}
                {typeof fitness.daysToCalibration === 'number' && fitness.daysToCalibration <= 30 && (
                  <span className="text-warning"> — {fitness.daysToCalibration} days left</span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {rows === null ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          No certificate on file. This instrument cannot be booked onto a permit until one
          is recorded.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((c) => (
            <li key={c.id} className="rounded-lg border px-3 py-2">
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                <span className="font-mono">{c.certificateNumber}</span>
                {c.result === 'fail' && <Badge tone="critical">Failed</Badge>}
                {c.result === 'pass_with_adjustment' && <Badge tone="warning">Adjusted</Badge>}
                {c.expired && <Badge tone="neutral">Expired</Badge>}
              </p>
              <p className="text-2xs text-muted">
                {fmtDate(c.calibratedAt)} → {fmtDate(c.expiresAt)}
                {c.vendor && <> · {c.vendor}</>}
                {' · '}recorded by {c.recordedBy}
              </p>
              {c.remarks && <p className="mt-0.5 text-2xs text-muted">{c.remarks}</p>}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          onClick={() => setAddOpen(true)}>
          Record calibration
        </Button>
      )}

      <RecordCalibrationDialog
        open={addOpen} assetId={assetId}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); load(); onChanged?.() }}
      />
    </section>
  )
}

function RecordCalibrationDialog({
  open, assetId, onClose, onSaved,
}: { open: boolean; assetId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [calibratedAt, setCalibratedAt] = useState(today)
  const [expiresAt, setExpiresAt] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [vendor, setVendor] = useState('')
  const [result, setResult] = useState<CalibrationResult>('pass')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // A year is the usual interval, so it is offered rather than demanded.
    const inAYear = new Date()
    inAYear.setFullYear(inAYear.getFullYear() + 1)
    setCalibratedAt(today)
    setExpiresAt(inAYear.toISOString().slice(0, 10))
    setCertificateNumber(''); setVendor(''); setResult('pass'); setRemarks(''); setError(null)
  }, [open, today])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await equipmentApi.recordCalibration(assetId, {
        calibratedAt, expiresAt, certificateNumber, vendor: vendor || undefined,
        result, remarks: remarks || undefined,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record that calibration.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Record a calibration certificate">
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <Input label="Certificate number" value={certificateNumber} required
          onChange={(e) => setCertificateNumber(e.target.value)} />

        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          <Input label="Calibrated on" type="date" value={calibratedAt}
            onChange={(e) => setCalibratedAt(e.target.value)} />
          <Input label="Valid until" type="date" value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)} />
        </div>

        <Input label="Calibration house" value={vendor} placeholder="e.g. Kuching Calibration Services"
          onChange={(e) => setVendor(e.target.value)} />

        <Select label="Result" value={result}
          onChange={(e) => setResult(e.target.value as CalibrationResult)}>
          {(Object.keys(CALIBRATION_RESULT_LABEL) as CalibrationResult[]).map((r) => (
            <option key={r} value={r}>{CALIBRATION_RESULT_LABEL[r]}</option>
          ))}
        </Select>

        {/* Said before they choose it, not after. */}
        {result === 'fail' && (
          <Alert tone="warning">
            Recording a failure takes this equipment out of service, so it cannot be booked
            onto a permit until it passes.
          </Alert>
        )}

        <Input label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}
            disabled={!certificateNumber.trim() || !expiresAt}>
            Record certificate
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
