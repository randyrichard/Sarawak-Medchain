import { useCallback, useEffect, useState } from 'react'
import { X, Phone, HardHat, Trash2, Plus, Undo2 } from 'lucide-react'
import { employeesApi } from '@/api/employeesApi'
import type { EmployeeDetail } from '@/api/employees'
import { MEDICAL_LABEL, PPE_ITEMS } from '@/api/employees'
import { ApiError } from '@/api/types'
import {
  Alert, Avatar, Badge, Button, Dialog, Input, Select, Skeleton, StatusPill, Tabs,
  type TabItem,
} from '@/components/ui'
import { MEDICAL_KIND, fmtDate, relativeDays } from '../lib'
import { EditEmployeeDialog } from './EditEmployeeDialog'
import { useOrg } from '@/features/org/OrgContext'

type Tab = 'profile' | 'medical' | 'contacts' | 'ppe' | 'training'

const TABS: TabItem<Tab>[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'medical', label: 'Medical' },
  { value: 'contacts', label: 'Emergency' },
  { value: 'ppe', label: 'PPE' },
  { value: 'training', label: 'Training' },
]

/**
 * One person, everything about them.
 *
 * Loaded by id rather than handed a row from the list, so the drawer is deep-linkable
 * and always shows the current record — a stale row from a list fetched two minutes ago
 * is how someone gets told a lapsed medical is still valid.
 */
export function EmployeeDrawer({
  employeeId, canManage, onClose, onChanged,
}: {
  employeeId: string | null
  canManage: boolean
  onClose: () => void
  onChanged: (message?: string) => void
}) {
  const [item, setItem] = useState<EmployeeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('profile')
  const [editOpen, setEditOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [ppeOpen, setPpeOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    if (!employeeId) return
    setLoading(true)
    setError(null)
    employeesApi.get(employeeId)
      .then(setItem)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this record.'))
      .finally(() => setLoading(false))
  }, [employeeId])

  useEffect(() => {
    if (!employeeId) { setItem(null); setTab('profile'); return }
    load()
  }, [employeeId, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editOpen && !contactOpen && !ppeOpen && !confirmDelete) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editOpen, contactOpen, ppeOpen, confirmDelete])

  if (!employeeId) return null

  /** Runs a mutation, refreshes both this drawer and the register behind it. */
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      load()
      onChanged(message)
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work. Try again.')
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
        aria-label="Employee record"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b px-5 py-4">
          {loading && !item ? (
            <Skeleton className="h-11 w-11 rounded-full" />
          ) : (
            <Avatar name={item?.name ?? '?'} size={44} />
          )}
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
                  {item && !item.active && <Badge tone="neutral">Left</Badge>}
                </div>
                <p className="truncate text-2xs text-muted">
                  <span className="font-mono">{item?.employeeNo}</span>
                  {item?.position ? ` · ${item.position}` : ''}
                  {item?.department ? ` · ${item.department}` : ''}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center text-muted hover:bg-accent-soft">
            <X size={16} />
          </button>
        </header>

        {error && <Alert tone="critical" className="mx-5 mt-3">{error}</Alert>}

        {item && (
          <>
            <div className="border-b px-5">
              <Tabs items={TABS} value={tab} onChange={setTab} />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {tab === 'profile' && <ProfileTab item={item} />}

              {tab === 'medical' && <MedicalTab item={item} />}

              {tab === 'contacts' && (
                <ContactsTab
                  item={item} canManage={canManage} busy={busy}
                  onAdd={() => setContactOpen(true)}
                  onRemove={(id) => void run(() => employeesApi.removeContact(id), 'Contact removed')}
                />
              )}

              {tab === 'ppe' && (
                <PpeTab
                  item={item} canManage={canManage} busy={busy}
                  onIssue={() => setPpeOpen(true)}
                  onReturn={(id) => void run(() => employeesApi.returnPpe(id), 'Return recorded')}
                />
              )}

              {tab === 'training' && <TrainingTab item={item} />}
            </div>

            {canManage && (
              <footer className="flex flex-wrap gap-2 border-t px-5 py-3">
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Edit Details</Button>
                <Button
                  size="sm" variant="secondary" loading={busy}
                  onClick={() => void run(
                    () => employeesApi.setActive(item.id, !item.active),
                    item.active ? `${item.name} marked as left` : `${item.name} reactivated`,
                  )}
                >
                  {item.active ? 'Mark as Left' : 'Reactivate'}
                </Button>
                {/*
                  Pushed to the far end, away from Edit and the status toggle (law of
                  proximity): buttons side by side read as one group of equally safe
                  choices, and Delete is not one of them.
                */}
                <Button size="sm" variant="ghost" className="ml-auto" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </footer>
            )}
          </>
        )}
      </aside>

      {item && (
        <>
          <EditEmployeeDialog
            open={editOpen} employee={item}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); load(); onChanged('Record updated') }}
          />
          <AddContactDialog
            open={contactOpen} employeeId={item.id}
            onClose={() => setContactOpen(false)}
            onAdded={() => { setContactOpen(false); load(); onChanged('Emergency contact added') }}
          />
          <IssuePpeDialog
            open={ppeOpen} employeeId={item.id}
            onClose={() => setPpeOpen(false)}
            onIssued={() => { setPpeOpen(false); load(); onChanged('PPE issued') }}
          />
          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete ${item.name}?`}
            description="Only possible for a record created by mistake."
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button
                  variant="danger" loading={busy}
                  onClick={async () => {
                    const ok = await run(() => employeesApi.remove(item.id), `${item.name} deleted`)
                    if (ok) { setConfirmDelete(false); onClose() }
                  }}
                >
                  Delete Permanently
                </Button>
              </>
            }
          >
            <Alert tone="warning">
              Anyone with training, certificates or PPE history cannot be deleted — their record is
              part of the site's history. Use <strong>Mark as left</strong> for someone who has
              actually worked here.
            </Alert>
          </Dialog>
        </>
      )}
    </>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value || '—'}</span>
    </div>
  )
}

/** A number a phone can dial from a tap - the point of having it on a site phone. */
function Tel({ n }: { n?: string | null }) {
  if (!n) return null
  return <a href={`tel:${n.replace(/[^\d+]/g, '')}`} className="text-accent underline-offset-2 hover:underline coarse:inline-flex coarse:min-h-11 coarse:items-center">{n}</a>
}

function ProfileTab({ item }: { item: EmployeeDetail }) {
  const { sites } = useOrg()
  return (
    <div>
      <Row label="Employee no." value={<span className="font-mono">{item.employeeNo}</span>} />
      <Row label="Position" value={item.position} />
      <Row label="Department" value={item.department} />
      <Row label="Site" value={sites.find((s) => s.id === item.siteId)?.name ?? item.siteId} />
      <Row label="Email" value={item.email} />
      <Row label="Phone" value={<Tel n={item.phone} />} />
      <Row label="Joined" value={fmtDate(item.hireDate)} />
      <Row label="Status" value={item.active ? 'Active' : 'Left'} />
    </div>
  )
}

function MedicalTab({ item }: { item: EmployeeDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <StatusPill kind={MEDICAL_KIND[item.medicalStatus]} label={MEDICAL_LABEL[item.medicalStatus]} />
        {item.medicalStatus !== 'missing' && (
          <span className="text-xs text-muted">
            {fmtDate(item.medicalExpiry)} · {relativeDays(item.daysToMedicalExpiry)}
          </span>
        )}
      </div>

      {item.medicalStatus === 'expired' && (
        <Alert tone="critical" title="Not fit to work">
          An expired medical bars confined space entry, working at height and most hot work.
          This person should not be issued a permit until it is renewed.
        </Alert>
      )}
      {item.medicalStatus === 'missing' && (
        <Alert tone="warning">No fitness-to-work certificate has been recorded for this person.</Alert>
      )}

      <div>
        <Row label="Expires" value={fmtDate(item.medicalExpiry)} />
        <Row label="Blood group" value={item.bloodGroup} />
      </div>

      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Restrictions</p>
        <p className="rounded-lg bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-ink-2">
          {item.medicalNotes || 'None recorded.'}
        </p>
      </div>
    </div>
  )
}

function ContactsTab({
  item, canManage, busy, onAdd, onRemove,
}: {
  item: EmployeeDetail; canManage: boolean; busy: boolean
  onAdd: () => void; onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {item.emergencyContacts.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <Phone size={18} className="mx-auto mb-2 text-muted" />
          <p className="text-sm text-ink-2">No emergency contact recorded.</p>
          <p className="mt-0.5 text-2xs text-muted">
            This list is only ever needed on the worst day of the year.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {item.emergencyContacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {c.name}
                  {c.isPrimary && <Badge tone="accent">Call First</Badge>}
                </p>
                <p className="text-2xs text-muted">{c.relationship || 'Contact'}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-2">
                  <Tel n={c.phone} />{c.altPhone && <> · <Tel n={c.altPhone} /></>}
                </p>
              </div>
              {canManage && (
                <button
                  disabled={busy}
                  onClick={() => onRemove(c.id)}
                  aria-label={`Remove ${c.name}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={onAdd}>Add Contact</Button>
      )}
    </div>
  )
}

function PpeTab({
  item, canManage, busy, onIssue, onReturn,
}: {
  item: EmployeeDetail; canManage: boolean; busy: boolean
  onIssue: () => void; onReturn: (id: string) => void
}) {
  const outstanding = item.ppeIssues.filter((p) => !p.returnedAt)
  const returned = item.ppeIssues.filter((p) => p.returnedAt)

  return (
    <div className="space-y-4">
      {item.ppeIssues.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <HardHat size={18} className="mx-auto mb-2 text-muted" />
          <p className="text-sm text-ink-2">No PPE issued.</p>
        </div>
      ) : (
        <>
          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
              Held ({outstanding.length})
            </p>
            <ul className="space-y-2">
              {outstanding.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {p.item}
                      {p.size && <span className="text-2xs text-muted">size {p.size}</span>}
                      {p.overdue && <Badge tone="critical">Replace</Badge>}
                    </p>
                    <p className="text-2xs text-muted">
                      Issued {fmtDate(p.issuedAt)} by {p.issuedBy}
                      {p.serialNumber ? ` · S/N ${p.serialNumber}` : ''}
                    </p>
                    {p.replaceDue && (
                      <p className="text-2xs text-muted">
                        Replace by {fmtDate(p.replaceDue)} · {relativeDays(p.daysToReplace)}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" icon={<Undo2 size={12} />} disabled={busy} onClick={() => onReturn(p.id)}>
                      Return
                    </Button>
                  )}
                </li>
              ))}
              {outstanding.length === 0 && <li className="text-2xs text-muted">Nothing outstanding.</li>}
            </ul>
          </div>

          {returned.length > 0 && (
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                Returned ({returned.length})
              </p>
              <ul className="space-y-1.5">
                {returned.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-2xs text-muted">
                    <span>{p.item}{p.size ? ` · ${p.size}` : ''}</span>
                    <span>returned {fmtDate(p.returnedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {canManage && item.active && (
        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={onIssue}>Issue PPE</Button>
      )}
    </div>
  )
}

function TrainingTab({ item }: { item: EmployeeDetail }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
          Certificates ({item.certificates.length})
        </p>
        {item.certificates.length === 0 ? (
          <p className="text-2xs text-muted">No certificates issued.</p>
        ) : (
          <ul className="space-y-2">
            {item.certificates.map((c) => {
              const expired = c.daysToExpiry !== null && c.daysToExpiry < 0
              return (
                <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{c.courseName}</p>
                    <p className="font-mono text-2xs text-muted">{c.number}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.expiryDate ? (
                      <>
                        <Badge tone={expired ? 'critical' : 'good'}>{expired ? 'Expired' : 'Valid'}</Badge>
                        <p className="mt-0.5 text-2xs text-muted">{fmtDate(c.expiryDate)}</p>
                      </>
                    ) : (
                      <Badge tone="neutral">No Expiry</Badge>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
          Sessions attended ({item.trainingHistory.length})
        </p>
        {item.trainingHistory.length === 0 ? (
          <p className="text-2xs text-muted">No training sessions on record.</p>
        ) : (
          <ul className="space-y-1.5">
            {item.trainingHistory.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{t.courseName}</p>
                  <p className="font-mono text-2xs text-muted">{t.code}</p>
                </div>
                <div className="shrink-0 text-right text-2xs">
                  <p className="text-muted">{fmtDate(t.scheduledFor)}</p>
                  <p className={t.present ? 'text-good' : 'text-muted'}>
                    {t.present ? (t.result ?? 'attended') : 'absent'}
                    {t.score !== null ? ` · ${t.score}%` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

function AddContactDialog({
  open, employeeId, onClose, onAdded,
}: { open: boolean; employeeId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [altPhone, setAltPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setName(''); setRelationship(''); setPhone(''); setAltPhone(''); setError(null); setBusy(false)
    onClose()
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await employeesApi.addContact(employeeId, {
        name, relationship: relationship || undefined, phone, altPhone: altPhone || undefined,
      })
      close(); onAdded()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add that contact.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open} onClose={close} title="Add Emergency Contact"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!name.trim() || !phone.trim()}>Add</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input
          label="Relationship" placeholder="Spouse, parent, sibling…"
          value={relationship} onChange={(e) => setRelationship(e.target.value)}
        />
        <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Input label="Alternative phone" type="tel" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
      </div>
    </Dialog>
  )
}

function IssuePpeDialog({
  open, employeeId, onClose, onIssued,
}: { open: boolean; employeeId: string; onClose: () => void; onIssued: () => void }) {
  const [item, setItem] = useState('')
  const [size, setSize] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [replaceDue, setReplaceDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setItem(''); setSize(''); setSerialNumber(''); setReplaceDue(''); setError(null); setBusy(false)
    onClose()
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await employeesApi.issuePpe(employeeId, {
        item, size: size || undefined, serialNumber: serialNumber || undefined,
        replaceDue: replaceDue || undefined,
      })
      close(); onIssued()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record that issue.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open} onClose={close} title="Issue PPE"
      description="Recorded against this person with today's date and your name."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!item.trim()}>Issue</Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* A picked item keeps the register countable; free text produces three spellings
            of "harness" and three different answers to how many are overdue. */}
        <Select label="Item" value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Choose an item…</option>
          {PPE_ITEMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input label="Size" value={size} onChange={(e) => setSize(e.target.value)} />
        <Input
          label="Serial number" hint="Harnesses and respirators usually carry one."
          value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)}
        />
        <Input
          label="Replace by" type="date" hint="Leave blank for items with no service life."
          value={replaceDue} onChange={(e) => setReplaceDue(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
