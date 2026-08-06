import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, LogIn, LogOut, Check, Ban, IdCard, Car, StickyNote, QrCode, History, ShieldCheck,
} from 'lucide-react'
import {
  VISITOR_STATUS_TONE, visitorsApi,
  type GateStatus, type Visitor, type VisitorEvent,
} from '@/api/visitorsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { fmtDateTime } from '@/features/incidents/lib'
import { Alert, Badge, Button, Dialog, Input, Skeleton, Textarea } from '@/components/ui'
import { VisitorPass } from './VisitorPass'
import { cn } from '@/lib/cn'

/**
 * One visit, end to end.
 *
 * The gate section is first and states what is outstanding before anything else, because
 * the person reading this is usually standing at a desk with the visitor in front of them.
 * Those sentences come from the server and are rendered as-is - the same list the server
 * will refuse the check-in with.
 */
export function VisitorDrawer({
  visitorId, onClose, onChanged,
}: {
  visitorId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const { role } = useOrg()
  const [v, setV] = useState<Visitor | null>(null)
  const [gate, setGate] = useState<GateStatus | null>(null)
  const [events, setEvents] = useState<VisitorEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [decisionOpen, setDecisionOpen] = useState<'approve' | 'reject' | null>(null)
  const [passOpen, setPassOpen] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    if (!visitorId) return
    Promise.all([
      visitorsApi.get(visitorId),
      visitorsApi.gate(visitorId),
      visitorsApi.timeline(visitorId),
    ])
      .then(([visit, g, t]) => { setV(visit); setGate(g); setEvents(t) })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this visit.'))
  }, [visitorId])

  useEffect(() => {
    setV(null); setGate(null); setEvents(null); setError(null)
    load()
  }, [load])

  if (!visitorId) return null

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      load()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  /*
   * Mirrors the server's gate roles. Presentation only - every action below is re-checked
   * server-side, so hiding a button is a courtesy and never the control.
   */
  const manage = ['admin', 'hse_manager', 'safety_officer', 'supervisor'].includes(role ?? '')
  const settled = v && ['checked_out', 'expired', 'denied', 'blacklisted', 'cancelled'].includes(v.status)

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-surface px-4 py-3">
          <div className="min-w-0">
            {v ? (
              <>
                <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-ink">
                  {v.name}
                  <Badge tone={VISITOR_STATUS_TONE[v.status]}>{v.statusLabel}</Badge>
                  {v.overdueMinutes !== null && (
                    <Badge tone="critical">
                      {v.overdueMinutes < 60
                        ? `${v.overdueMinutes} min overdue`
                        : `${Math.floor(v.overdueMinutes / 60)}h overdue`}
                    </Badge>
                  )}
                </p>
                <p className="text-2xs text-muted">
                  <span className="font-mono">{v.code}</span>
                  {v.visitorCompany && <> · {v.visitorCompany}</>}
                  {v.idNumber && <> · {v.idNumber}</>}
                </p>
              </>
            ) : <Skeleton className="h-6 w-48" />}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-accent-soft">
            <X size={16} />
          </button>
        </header>

        <div className="px-4 py-4">
          {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

          {!v ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* The gate. First, because it decides whether the person in front of you comes in. */}
              {!settled && (
                <section className="mb-5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                    <ShieldCheck size={12} /> Gate
                  </p>
                  {gate === null ? (
                    <Skeleton className="h-16 rounded-lg" />
                  ) : gate.blockers.length === 0 ? (
                    <Alert tone="success">Cleared. This visitor can be checked in.</Alert>
                  ) : (
                    <div className="rounded-lg border border-critical/60 bg-critical-soft/30 px-3 py-2">
                      <p className="text-2xs font-medium text-critical">
                        Not cleared to enter:
                      </p>
                      {/* The server's own sentences, rendered as-is. */}
                      <ul className="mt-1 list-inside list-disc space-y-0.5">
                        {gate.blockers.map((b) => (
                          <li key={b} className="text-2xs text-ink">{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {manage && !v.checkedInAt && (
                      <Button size="sm" icon={<LogIn size={11} />}
                        disabled={(gate?.blockers.length ?? 1) > 0}
                        onClick={() => setCheckInOpen(true)}>
                        Check in
                      </Button>
                    )}
                    {manage && v.checkedInAt && !v.checkedOutAt && (
                      <Button size="sm" variant="secondary" icon={<LogOut size={11} />}
                        loading={busy === 'out'}
                        onClick={() => void run('out', () => visitorsApi.checkOut(v.id, true))}>
                        Check out
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<QrCode size={11} />}
                      onClick={() => setPassOpen(true)}>
                      Visitor pass
                    </Button>
                  </div>
                </section>
              )}

              {/* Host decision */}
              <section className="mb-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Host approval</p>
                {v.approvedAt ? (
                  <p className="rounded-lg border border-good/50 bg-good-soft/30 px-3 py-2 text-2xs text-ink">
                    Approved by {v.approvedBy} on {fmtDateTime(v.approvedAt)}
                    {v.decisionNote && <span className="block text-muted">{v.decisionNote}</span>}
                  </p>
                ) : v.rejectedAt ? (
                  <p className="rounded-lg border border-critical/60 bg-critical-soft/30 px-3 py-2 text-2xs text-ink">
                    Refused by {v.rejectedBy} on {fmtDateTime(v.rejectedAt)}
                    {v.decisionNote && <span className="block text-muted">{v.decisionNote}</span>}
                  </p>
                ) : (
                  <p className="rounded-lg border border-dashed px-3 py-2 text-2xs text-muted">
                    {v.hostNameAtBooking
                      ? `Waiting on ${v.hostNameAtBooking}.`
                      : 'No host named for this visit.'}
                  </p>
                )}
                {manage && !settled && (
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="secondary" icon={<Check size={11} />}
                      onClick={() => setDecisionOpen('approve')}>
                      {v.rejectedAt ? 'Reinstate' : 'Approve'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Ban size={11} />}
                      onClick={() => setDecisionOpen('reject')}>
                      Refuse
                    </Button>
                  </div>
                )}
              </section>

              {/* Site rules */}
              <section className="mb-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Site rules</p>
                <ul className="space-y-1.5">
                  {v.acknowledgements.map((a) => (
                    <li key={a.key} className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
                      a.at && 'border-good/50 bg-good-soft/20',
                    )}>
                      <div className="min-w-0">
                        <p className="text-2xs text-ink">{a.label}</p>
                        {/* When, not merely whether: this is the record read after an evacuation. */}
                        <p className="text-2xs text-muted">
                          {a.at ? `Acknowledged ${fmtDateTime(a.at)}` : 'Not acknowledged'}
                        </p>
                      </div>
                      {manage && !a.at && !settled && (
                        <Button size="sm" variant="ghost" loading={busy === a.key}
                          onClick={() => void run(a.key, () => visitorsApi.acknowledge(v.id, a.key))}>
                          Record
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Detail */}
              <section className="mb-5 grid grid-cols-2 gap-x-3 gap-y-2">
                <Meta label="Host" value={v.hostNameAtBooking || '—'} />
                <Meta label="Purpose" value={v.purpose || '—'} />
                <Meta label="Expected in" value={fmtDateTime(v.expectedArrival)} />
                <Meta label="Expected out" value={fmtDateTime(v.expectedDeparture)} />
                {v.checkedInAt && <Meta label="Checked in" value={fmtDateTime(v.checkedInAt)} />}
                {v.checkedOutAt && <Meta label="Checked out" value={fmtDateTime(v.checkedOutAt)} />}
                {v.durationLabel && <Meta label="Time on site" value={v.durationLabel} />}
                <Meta label="Nationality" value={v.nationality || '—'} />
                <Meta label="Phone" value={v.phone || '—'} />
                <Meta label="Email" value={v.email || '—'} />
                <Meta label="Emergency contact"
                  value={[v.emergencyContactName, v.emergencyContactPhone].filter(Boolean).join(' · ') || '—'} />
                {v.deniedReason && <Meta label="Refused because" value={v.deniedReason} />}
              </section>

              {/* Badge and vehicle */}
              {manage && !settled && (
                <section className="mb-5 grid gap-2 sm:grid-cols-2">
                  <InlineField
                    icon={<IdCard size={11} />} label="Badge"
                    value={v.badgeNumber ?? ''}
                    busy={busy === 'badge'}
                    onSave={(next) => run('badge', () => visitorsApi.setBadge(v.id, next || null))}
                  />
                  <InlineField
                    icon={<Car size={11} />} label="Vehicle"
                    value={v.vehicleNumber}
                    busy={busy === 'vehicle'}
                    onSave={(next) => run('vehicle', () => visitorsApi.setVehicle(v.id, next || null))}
                  />
                </section>
              )}

              {/* Notes */}
              {manage && (
                <section className="mb-5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                    <StickyNote size={12} /> Add a note
                  </p>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Escorted to the meeting room by the host." />
                  <Button size="sm" variant="secondary" className="mt-1.5"
                    loading={busy === 'note'} disabled={!note.trim()}
                    onClick={() => void run('note', async () => {
                      await visitorsApi.addNote(v.id, note.trim())
                      setNote('')
                    })}>
                    Add note
                  </Button>
                </section>
              )}

              {/* History */}
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                  <History size={12} /> History
                </p>
                {events === null ? (
                  <Skeleton className="h-20 rounded-lg" />
                ) : events.length === 0 ? (
                  <p className="text-2xs text-muted">Nothing recorded yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {events.map((e) => (
                      <li key={e.id} className="border-l-2 border-border pl-2.5">
                        <p className="text-2xs text-ink">{e.summary}</p>
                        {e.detail && <p className="text-2xs text-muted">{e.detail}</p>}
                        <p className="text-2xs text-muted">
                          {fmtDateTime(e.at)} · {e.actor}
                          {e.actorRole && <> ({e.actorRole.replace(/_/g, ' ')})</>}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        {v && (
          <>
            <CheckInDialog
              open={checkInOpen} visitor={v}
              onClose={() => setCheckInOpen(false)}
              onDone={() => { setCheckInOpen(false); load(); onChanged() }}
            />
            <DecisionDialog
              mode={decisionOpen} visitor={v}
              onClose={() => setDecisionOpen(null)}
              onDone={() => { setDecisionOpen(null); load(); onChanged() }}
            />
            <VisitorPass visitor={v} open={passOpen} onClose={() => setPassOpen(false)} />
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-muted">{label}</p>
      <p className="text-2xs text-ink">{value}</p>
    </div>
  )
}

/** An editable field that saves on demand rather than on every keystroke. */
function InlineField({
  icon, label, value, busy, onSave,
}: {
  icon: React.ReactNode
  label: string
  value: string
  busy: boolean
  onSave: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-2xs uppercase tracking-wide text-muted">
        {icon} {label}
      </p>
      <div className="flex gap-1.5">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} />
        <Button size="sm" variant="secondary" loading={busy}
          disabled={draft === value}
          onClick={() => onSave(draft.trim())}>
          Save
        </Button>
      </div>
    </div>
  )
}

function CheckInDialog({
  open, visitor, onClose, onDone,
}: { open: boolean; visitor: Visitor; onClose: () => void; onDone: () => void }) {
  const [badgeNumber, setBadgeNumber] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState(visitor.vehicleNumber)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBadgeNumber(visitor.badgeNumber ?? '')
    setVehicleNumber(visitor.vehicleNumber)
    setError(null)
  }, [open, visitor])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await visitorsApi.checkIn(visitor.id, {
        badgeNumber: badgeNumber.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
      })
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check that visitor in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Check in ${visitor.name}`}>
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
        <Input label="Badge number" value={badgeNumber} onChange={(e) => setBadgeNumber(e.target.value)}
          placeholder="e.g. B-014" />
        <Input label="Vehicle" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)}
          placeholder="e.g. QAB 1234" />
        <p className="text-2xs text-muted">
          The blacklist and the site rules are re-checked at this point, so a visit cleared
          this morning can still be refused now.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}>Check in</Button>
        </div>
      </div>
    </Dialog>
  )
}

function DecisionDialog({
  mode, visitor, onClose, onDone,
}: {
  mode: 'approve' | 'reject' | null
  visitor: Visitor
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setNote(''); setError(null) }, [mode])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await visitorsApi.decide(visitor.id, mode === 'approve', note.trim() || undefined)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record that decision.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode === 'approve' ? `Approve ${visitor.name}` : `Refuse ${visitor.name}`}
    >
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
        <Textarea
          label={mode === 'approve' ? 'Comment (optional)' : 'Why is this visit refused?'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}
            disabled={mode === 'reject' && !note.trim()}>
            {mode === 'approve' ? 'Approve' : 'Refuse'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
