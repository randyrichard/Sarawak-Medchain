import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, Plus, LogIn, LogOut, Phone } from 'lucide-react'
import { contractorsApi } from '@/api/contractorsApi'
import type { ContractorWorkerDetail } from '@/api/contractors'
import { COMPETENCIES, EXPIRY_LABEL } from '@/api/contractors'
import { ApiError } from '@/api/types'
import {
  Alert, Avatar, Badge, Button, Dialog, Input, Select, Skeleton, StatusPill,
} from '@/components/ui'
import { EXPIRY_KIND, fmtDate, gateBlockReason, relativeDays } from '../lib'

/**
 * One contractor worker.
 *
 * Loaded by id rather than handed a row, so the record is deep-linkable and always
 * current — a stale row is how someone gets waved through on a medical that lapsed
 * while the list was open.
 */
export function WorkerDrawer({
  workerId, canManage, canGate, onClose, onChanged,
}: {
  workerId: string | null
  canManage: boolean
  canGate: boolean
  onClose: () => void
  onChanged: (message?: string) => void
}) {
  const [item, setItem] = useState<ContractorWorkerDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [competencyOpen, setCompetencyOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    if (!workerId) return
    setLoading(true)
    setError(null)
    contractorsApi.getWorker(workerId)
      .then(setItem)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this worker.'))
      .finally(() => setLoading(false))
  }, [workerId])

  useEffect(() => {
    if (!workerId) { setItem(null); return }
    load()
  }, [workerId, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !competencyOpen && !confirmDelete) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, competencyOpen, confirmDelete])

  if (!workerId) return null

  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      load()
      onChanged(message)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const blocked = item ? gateBlockReason(item) : null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Contractor worker"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b px-5 py-4">
          {loading && !item ? <Skeleton className="h-11 w-11 rounded-full" /> : <Avatar name={item?.name ?? '?'} size={44} />}
          <div className="min-w-0 flex-1">
            {loading && !item ? (
              <>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-ink">{item?.name}</h2>
                  {item?.onSite && <Badge tone="accent">On site</Badge>}
                  {item && !item.active && <Badge tone="neutral">Deregistered</Badge>}
                </div>
                <p className="truncate text-2xs text-muted">
                  <span className="font-mono">{item?.workerNo}</span>
                  {item?.contractorName ? ` · ${item.contractorName}` : ''}
                  {item?.position ? ` · ${item.position}` : ''}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft">
            <X size={16} />
          </button>
        </header>

        {error && <Alert tone="critical" className="mx-5 mt-3">{error}</Alert>}

        {item && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* The gate verdict, first and unmissable — it is the reason this screen exists. */}
              {blocked ? (
                <Alert tone="critical" title={`Not cleared for site — ${blocked}`} className="mb-4">
                  This worker must not be admitted until the record is put right.
                </Alert>
              ) : (
                <Alert tone="success" title="Cleared for site" className="mb-4">
                  Medical and induction are both current and the contractor is active.
                </Alert>
              )}

              <Section title="Compliance">
                <ComplianceRow
                  label="Medical" status={item.medicalStatus}
                  date={item.medicalExpiry} days={item.daysToMedicalExpiry}
                />
                <ComplianceRow
                  label="Site induction" status={item.inductionStatus}
                  date={item.inductionExpiry} days={item.daysToInductionExpiry}
                />
              </Section>

              <Section title="Identity">
                <Row label="Worker no." value={<span className="font-mono">{item.workerNo}</span>} />
                <Row label="IC / passport" value={item.icPassport} />
                <Row label="Contractor" value={`${item.contractorName} (${item.contractorCode})`} />
                <Row label="Site" value={item.siteId.toUpperCase()} />
                <Row label="Checked in" value={item.checkedInAt ? fmtDate(item.checkedInAt) : 'Not on site'} />
              </Section>

              <Section title="Emergency contact">
                {item.emergencyName ? (
                  <div className="rounded-lg border px-3.5 py-2.5">
                    <p className="text-sm font-semibold text-ink">{item.emergencyName}</p>
                    <p className="text-2xs text-muted">{item.emergencyRelation || 'Contact'}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink-2">{item.emergencyPhone || 'No number recorded'}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-5 text-center">
                    <Phone size={16} className="mx-auto mb-1.5 text-muted" />
                    <p className="text-2xs text-muted">No emergency contact recorded for this worker.</p>
                  </div>
                )}
              </Section>

              <Section title={`Competencies (${item.certificates.length})`}>
                {item.certificates.length === 0 ? (
                  <p className="text-2xs text-muted">No competency evidence recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {item.certificates.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                          <p className="truncate text-2xs text-muted">
                            {c.issuedBy || 'Issuer not recorded'}{c.reference ? ` · ${c.reference}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="text-right">
                            <StatusPill kind={EXPIRY_KIND[c.status]} label={EXPIRY_LABEL[c.status]} />
                            {c.expiryDate && <p className="mt-0.5 text-2xs text-muted">{fmtDate(c.expiryDate)}</p>}
                          </div>
                          {canManage && (
                            <button
                              disabled={busy}
                              onClick={() => void run(() => contractorsApi.removeCompetency(c.id), 'Competency removed')}
                              aria-label={`Remove ${c.name}`}
                              className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <Button size="sm" variant="secondary" icon={<Plus size={12} />} className="mt-2"
                    onClick={() => setCompetencyOpen(true)}>
                    Record competency
                  </Button>
                )}
              </Section>
            </div>

            <footer className="flex flex-wrap gap-2 border-t px-5 py-3">
              {canGate && item.onSite && (
                <Button size="sm" icon={<LogOut size={12} />} loading={busy}
                  onClick={() => void run(() => contractorsApi.checkOut(item.id), `${item.name} checked out`)}>
                  Check out
                </Button>
              )}
              {canGate && !item.onSite && !blocked && (
                <Button size="sm" icon={<LogIn size={12} />} loading={busy}
                  onClick={() => void run(() => contractorsApi.checkIn(item.id), `${item.name} checked in`)}>
                  Check in
                </Button>
              )}
              {canManage && (
                <>
                  <Button size="sm" variant="secondary" loading={busy}
                    onClick={() => void run(
                      () => contractorsApi.setWorkerActive(item.id, !item.active),
                      item.active ? `${item.name} deregistered` : `${item.name} reinstated`,
                    )}>
                    {item.active ? 'Deregister' : 'Reinstate'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                </>
              )}
            </footer>
          </>
        )}
      </aside>

      {item && (
        <>
          <AddCompetencyDialog
            open={competencyOpen} workerId={item.id}
            onClose={() => setCompetencyOpen(false)}
            onAdded={() => { setCompetencyOpen(false); load(); onChanged('Competency recorded') }}
          />
          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete ${item.name}?`}
            description="Only possible for a record created by mistake."
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="danger" loading={busy}
                  onClick={async () => {
                    const ok = await run(() => contractorsApi.removeWorker(item.id), `${item.name} deleted`)
                    if (ok) { setConfirmDelete(false); onClose() }
                  }}>
                  Delete permanently
                </Button>
              </>
            }
          >
            <Alert tone="warning">
              Anyone with competency records cannot be deleted — the evidence of who was
              qualified to be on site has to survive them leaving. Use <strong>Deregister</strong>
              {' '}for a worker who is no longer coming.
            </Alert>
          </Dialog>
        </>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value || '—'}</span>
    </div>
  )
}

function ComplianceRow({
  label, status, date, days,
}: {
  label: string
  status: ContractorWorkerDetail['medicalStatus']
  date: string | null
  days: number | null
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
      <span className="text-sm text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <StatusPill kind={EXPIRY_KIND[status]} label={EXPIRY_LABEL[status]} />
        <span className="text-2xs text-muted">
          {date ? `${fmtDate(date)} · ${relativeDays(days)}` : 'not recorded'}
        </span>
      </div>
    </div>
  )
}

function AddCompetencyDialog({
  open, workerId, onClose, onAdded,
}: { open: boolean; workerId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [reference, setReference] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setName(''); setIssuedBy(''); setReference(''); setExpiryDate(''); setError(null); setBusy(false)
    onClose()
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await contractorsApi.addCompetency(workerId, {
        name, issuedBy: issuedBy || undefined, reference: reference || undefined,
        expiryDate: expiryDate || undefined,
      })
      close(); onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record that competency.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open} onClose={close} title="Record competency"
      description="Evidence supplied by the contractor. Trusted as far as the expiry date on it."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!name.trim()}>Record</Button>
        </>
      }
    >
      {error && <Alert tone="critical" className="mb-3">{error}</Alert>}
      <div className="space-y-3">
        {/* Picked rather than typed: free text produces three spellings of "working at
            height" and three different answers to how many riggers are certified. */}
        <Select label="Competency" value={name} onChange={(e) => setName(e.target.value)}>
          <option value="">Choose a competency…</option>
          {COMPETENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label="Issued by" placeholder="NIOSH, DOSH, CIDB…" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
        <Input label="Certificate reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input label="Expires" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
          hint="Leave blank for a competency with no expiry." />
      </div>
    </Dialog>
  )
}
