import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, Users, PenLine } from 'lucide-react'
import { contractorsApi } from '@/api/contractorsApi'
import type { ContractorCompanyRow } from '@/api/contractors'
import { EXPIRY_LABEL } from '@/api/contractors'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Dialog, Skeleton, StatusPill } from '@/components/ui'
import { EXPIRY_KIND, fmtDate, relativeDays } from '../lib'
import { EditContractorDialog } from './EditContractorDialog'

/** One contracting firm: who they are, whether they are insured, and who they have here. */
export function ContractorDrawer({
  contractorId, canManage, onClose, onChanged, onViewWorkers,
}: {
  contractorId: string | null
  canManage: boolean
  onClose: () => void
  onChanged: (message?: string) => void
  onViewWorkers: (id: string) => void
}) {
  const [item, setItem] = useState<ContractorCompanyRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    if (!contractorId) return
    setLoading(true)
    setError(null)
    contractorsApi.getCompany(contractorId)
      .then(setItem)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this contractor.'))
      .finally(() => setLoading(false))
  }, [contractorId])

  useEffect(() => {
    if (!contractorId) { setItem(null); return }
    load()
  }, [contractorId, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editOpen && !confirmDelete) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editOpen, confirmDelete])

  if (!contractorId) return null

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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Contractor"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            {loading && !item ? (
              <>
                <Skeleton className="h-4 w-44" />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-ink">{item?.name}</h2>
                  {item?.status === 'suspended' && <Badge tone="critical">Suspended</Badge>}
                </div>
                <p className="truncate font-mono text-2xs text-muted">{item?.code}</p>
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
              {item.insuranceStatus === 'expired' && (
                <Alert tone="critical" title="Insurance has lapsed" className="mb-4">
                  An uninsured contractor working on your site is your liability. Ask for the
                  renewal certificate before any of their people are admitted.
                </Alert>
              )}
              {item.insuranceStatus === 'missing' && (
                <Alert tone="warning" className="mb-4">
                  No insurance certificate has been recorded for this contractor.
                </Alert>
              )}
              {item.status === 'suspended' && (
                <Alert tone="critical" title="Suspended" className="mb-4">
                  None of this contractor's workers can be checked in while they are suspended.
                </Alert>
              )}

              <div className="mb-5">
                <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Insurance</p>
                <div className="flex items-center gap-2.5">
                  <StatusPill kind={EXPIRY_KIND[item.insuranceStatus]} label={EXPIRY_LABEL[item.insuranceStatus]} />
                  <span className="text-xs text-muted">
                    {item.insuranceExpiry
                      ? `${fmtDate(item.insuranceExpiry)} · ${relativeDays(item.daysToInsuranceExpiry)}`
                      : 'not recorded'}
                  </span>
                </div>
              </div>

              <div className="mb-5">
                <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Details</p>
                <Row label="Registration" value={item.registrationNumber} />
                <Row label="Contact" value={item.contactPerson} />
                <Row label="Phone" value={item.phone} />
                <Row label="Email" value={item.email} />
                <Row label="Address" value={item.address} />
              </div>

              <div>
                <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Workforce</p>
                <div className="flex items-center justify-between rounded-lg border px-3.5 py-3">
                  <div>
                    <p className="text-sm text-ink">
                      {item.workerCount} registered
                      {item.onSiteCount > 0 && <span className="text-accent"> · {item.onSiteCount} on site</span>}
                    </p>
                    <p className="text-2xs text-muted">People this contractor has sent to your sites.</p>
                  </div>
                  {item.workerCount > 0 && (
                    <Button size="sm" variant="secondary" icon={<Users size={12} />}
                      onClick={() => onViewWorkers(item.id)}>
                      View
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {canManage && (
              <footer className="flex flex-wrap gap-2 border-t px-5 py-3">
                <Button size="sm" variant="secondary" icon={<PenLine size={12} />} onClick={() => setEditOpen(true)}>
                  Edit details
                </Button>
                <Button size="sm" variant="secondary" loading={busy}
                  onClick={() => void run(
                    () => contractorsApi.updateCompany(item.id, {
                      status: item.status === 'active' ? 'suspended' : 'active',
                    }),
                    item.status === 'active' ? `${item.name} suspended` : `${item.name} reinstated`,
                  )}>
                  {item.status === 'active' ? 'Suspend' : 'Reinstate'}
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </footer>
            )}
          </>
        )}
      </aside>

      {item && (
        <>
          <EditContractorDialog
            open={editOpen} contractor={item}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); load(); onChanged('Contractor updated') }}
          />
          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete ${item.name}?`}
            description="Only possible for a contractor recorded in error."
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="danger" loading={busy}
                  onClick={async () => {
                    const ok = await run(() => contractorsApi.removeCompany(item.id), `${item.name} deleted`)
                    if (ok) { setConfirmDelete(false); onClose() }
                  }}>
                  Delete permanently
                </Button>
              </>
            }
          >
            <Alert tone="warning">
              A contractor with workers registered cannot be deleted — that would take the
              record of who was on your site with it. Use <strong>Suspend</strong> for a firm
              you are no longer engaging.
            </Alert>
          </Dialog>
        </>
      )}
    </>
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
