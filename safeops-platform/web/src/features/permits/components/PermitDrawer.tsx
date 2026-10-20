import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Printer, ShieldAlert, Unlock, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { Actor } from '@/api/incidents'
import { GAS_LIMITS, GAS_TEST_REQUIRED, ISOLATION_REQUIRED, type PermitView } from '@/api/permits'
import { PermitPeoplePanel } from './PermitPeoplePanel'
import { PermitEquipmentPanel } from './PermitEquipmentPanel'
import { ReviewChain } from './ReviewChain'
import { ToolboxDialog } from './ToolboxDialog'
import { JsaTable } from './JsaTable'
import { PpeChecklist } from './PpeChecklist'
import { AttachmentsPanel } from './AttachmentsPanel'
import { PermitTimeline } from './PermitTimeline'
import { FieldQueuePanel } from './FieldQueuePanel'
import { useFieldQueue } from '../useFieldQueue'
import { queuePermitOp, refusalFor, type PermitOp } from '../offlineOps'
import { permitWorkflowApi, type ReviewStatus } from '@/api/permitWorkflowApi'
import { permitPeopleApi, type PermitExtension } from '@/api/permitPeopleApi'
import { Alert, Badge, Button, Checkbox, Input, NotInDemo, StatusPill, Textarea } from '@/components/ui'
import { isBackendConfigured } from '@/api/authApi'
import { cn } from '@/lib/cn'
import { permitStatusKind, formatRemaining, fmtTime, fmtWindow, remainingTone } from '../lib'
import { printPermit } from '../print'

/**
 * The gas readings as numbers.
 *
 * Pulled out because the same values are now needed twice — once for the request and once
 * for the record kept if that request cannot leave the device — and building them twice
 * from the form state is how the two quietly come to disagree.
 */
const readingOf = (g: { oxygenPct: string; lelPct: string; h2sPpm: string; coPpm: string }) => ({
  oxygenPct: Number(g.oxygenPct), lelPct: Number(g.lelPct),
  h2sPpm: Number(g.h2sPpm), coPpm: Number(g.coPpm),
})

/** Same reasoning: the default has to be identical in the request and in the queued copy. */
const suspendReason = (reason: string) => reason || 'Suspended by issuing authority.'

/** The permit itself: controls, atmosphere, isolations, signatures and the audit trail. */
export function PermitDrawer({
  permitId, actor, issuer, operator, gasTester, onClose, onChanged,
}: {
  permitId: string | null
  actor: Actor
  issuer: boolean
  /** May name people and place or release isolations (see canOperatePermits). */
  operator: boolean
  /** Is shown the gas-test form (see canRecordGasTests). */
  gasTester: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [permit, setPermit] = useState<PermitView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [reason, setReason] = useState('')
  const [handback, setHandback] = useState(false)
  const [gas, setGas] = useState({ oxygenPct: '20.9', lelPct: '0', h2sPpm: '0', coPpm: '0' })
  const [iso, setIso] = useState({ description: '', tagId: '' })
  const [review, setReview] = useState<ReviewStatus | null>(null)
  const [extensions, setExtensions] = useState<PermitExtension[]>([])
  const [toolboxOpen, setToolboxOpen] = useState(false)
  /*
   * Kept apart from `error`, because it is not one. A record that could not be sent and was
   * kept on the device is a normal outcome at a worksite, and showing it in red next to a
   * "try again" is what made the first version of offline incident reporting read as a
   * failure. This says what happened and what will happen next.
   */
  const [queuedNote, setQueuedNote] = useState<string | null>(null)
  const fieldQueue = useFieldQueue()

  const load = useCallback(() => {
    if (!permitId) return
    api.getPermit(permitId).then(setPermit).catch(() => setPermit(null))
    // The review status carries the activation gate, which changes on almost every
    // action in this drawer, so it is refreshed alongside the permit rather than once.
    permitWorkflowApi.review(permitId).then(setReview).catch(() => setReview(null))
    permitPeopleApi.listExtensions(permitId).then(setExtensions).catch(() => setExtensions([]))
  }, [permitId])

  useEffect(() => {
    setError(null); setStatement(''); setReason(''); setHandback(false)
    if (permitId) load()
    else setPermit(null)
  }, [permitId, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!permitId || !permit) return null

  /*
   * Every action in this drawer goes through here, which is why the offline rule lives here
   * rather than in each button: a new action added later gets the right behaviour by
   * default instead of silently getting none.
   *
   * `offline` says what to do when the request cannot reach the server:
   *
   *   a PermitOp  - this records something that already happened, so it is kept on the
   *                 device and sent when there is signal;
   *   a kind name - this would grant authority (approve, activate, resume), so it is
   *                 refused with the reason, and nothing is kept. See offlineOps.ts for why
   *                 that line is drawn where it is.
   *   omitted     - behaves exactly as it did before: the failure is reported.
   */
  const run = async (
    fn: () => Promise<PermitView | void>,
    offline?: PermitOp | string,
  ) => {
    setBusy(true); setError(null); setQueuedNote(null)
    try {
      const updated = await fn()
      if (updated) setPermit(updated)
      else load()
      onChanged()
    } catch (e) {
      const unreachable = e instanceof ApiError && (e.code === 'network' || e.code === 'request_failed')

      if (unreachable && offline && typeof offline !== 'string' && actor.userId) {
        try {
          await queuePermitOp(actor.userId, offline)
          fieldQueue.refresh()
          setQueuedNote(
            'No connection. This is saved on this device and will be sent as soon as there is '
            + 'signal — with the time you recorded it, not the time it sends.',
          )
        } catch {
          // The device refused to store it, so the only honest thing left is to say the
          // record was not kept. Anything softer invites somebody to walk away from it.
          setError('No connection, and this device could not save the record. Write it down and enter it later.')
        }
      } else if (unreachable && typeof offline === 'string') {
        setError(refusalFor(offline) || 'No connection. Nothing has been sent.')
      } else {
        setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  const open = !['closed', 'rejected'].includes(permit.status)
  const needsGas = GAS_TEST_REQUIRED.includes(permit.type)
  const needsIso = ISOLATION_REQUIRED.includes(permit.type)
  const latestGas = permit.gasTests[permit.gasTests.length - 1]
  const liveIsolations = permit.isolations.filter((i) => !i.removedAt).length

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Permit ${permit.code}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[600px] animate-scale-in flex-col border-l bg-surface shadow-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-2xs text-muted">{permit.code}</span>
              <Badge tone="neutral">{permit.typeLabel}</Badge>
              <StatusPill kind={permitStatusKind(permit.status)} label={permit.statusLabel} />
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink">{permit.title}</h2>
            <p className="text-2xs text-muted">{permit.location} · {permit.department} · {permit.workerCount} worker(s)</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => printPermit(permit)} aria-label="Print permit"
              className="rounded-lg p-1.5 coarse:flex coarse:min-h-touch coarse:min-w-touch coarse:items-center coarse:justify-center text-muted hover:bg-accent-soft hover:text-ink"><Printer size={16} /></button>
            <button onClick={onClose} aria-label="Close"
              className="rounded-lg p-1.5 coarse:flex coarse:min-h-touch coarse:min-w-touch coarse:items-center coarse:justify-center text-muted hover:bg-accent-soft hover:text-ink"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

          {permit.status === 'suspended' && (
            <Alert tone="critical" title="Work suspended">{permit.suspendedReason}</Alert>
          )}
          {permit.status === 'expired' && (
            <Alert tone="critical" title="Permit expired with work open">
              Work must stop until a new permit is issued.
            </Alert>
          )}
          {permit.status === 'rejected' && (
            <Alert tone="critical" title="Rejected">{permit.rejectionReason}</Alert>
          )}

          {/* Validity window */}
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Validity</p>
              <span className="text-sm font-bold"
                style={{ color: remainingTone(permit.hoursRemaining, permit.status), fontVariantNumeric: 'tabular-nums' }}>
                {formatRemaining(permit.hoursRemaining)}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{fmtWindow(permit.validFrom)} → {fmtWindow(permit.validTo)}</p>
            {permit.description && <p className="mt-2 text-sm leading-relaxed text-ink-2">{permit.description}</p>}
            <p className="mt-2 text-2xs text-muted">
              Applicant {permit.applicant}{permit.contractor ? ` · ${permit.contractor}` : ''}
              {permit.approver ? ` · issued by ${permit.approver}` : ''}
            </p>
          </div>

          {/* Controls checklist */}
          <section>
            <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">
              <span>Precautions</span>
              {permit.outstandingControls > 0 && (
                <span style={{ color: 'var(--warning)' }}>{permit.outstandingControls} required outstanding</span>
              )}
            </p>
            <ul className="space-y-1.5">
              {permit.controls.map((c) => (
                <li key={c.id} className={cn('rounded-lg border px-3 py-2', c.confirmed && 'bg-accent-soft/30')}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={c.confirmed}
                      disabled={!open || busy}
                      onChange={(e) => void run(
                        () => api.confirmPermitControl(permit.id, c.id, e.target.checked, actor),
                        {
                          kind: 'control-confirm', permitId: permit.id, permitCode: permit.code,
                          controlId: c.id, label: c.label, confirmed: e.target.checked,
                        },
                      )}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm leading-snug text-ink-2">{c.label}</span>
                      {c.required && <span className="ml-1.5 text-2xs font-bold" style={{ color: 'var(--critical)' }}>required</span>}
                      {c.confirmed && c.confirmedBy && (
                        <span className="block text-2xs text-muted">✓ {c.confirmedBy} · {c.confirmedAt ? fmtTime(c.confirmedAt) : ''}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* Gas testing */}
          {needsGas && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                Atmospheric testing
              </p>
              {latestGas ? (
                <div className="rounded-lg border px-3.5 py-2.5" style={latestGas.pass ? undefined : { borderColor: 'var(--critical)' }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: latestGas.pass ? 'var(--good)' : 'var(--critical)' }}>
                      {latestGas.pass ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-2xs text-muted">{latestGas.testedBy} · {fmtTime(latestGas.testedAt)}</span>
                  </div>
                  <p className="mt-1 font-mono text-2xs text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    O₂ {latestGas.oxygenPct}% · LEL {latestGas.lelPct}% · H₂S {latestGas.h2sPpm}ppm · CO {latestGas.coPpm}ppm
                  </p>
                  {permit.gasTests.length > 1 && (
                    <p className="mt-1 text-2xs text-muted">{permit.gasTests.length} tests recorded</p>
                  )}
                </div>
              ) : (
                <Alert tone="warning">A gas test is required before this permit can be issued.</Alert>
              )}

              {open && gasTester && (
                <div className="mt-2 rounded-lg border p-3">
                  <div className="grid grid-cols-4 gap-2">
                    {([['oxygenPct', 'O₂ %'], ['lelPct', 'LEL %'], ['h2sPpm', 'H₂S ppm'], ['coPpm', 'CO ppm']] as const).map(([k, label]) => (
                      <label key={k} className="text-2xs text-muted">
                        {label}
                        <input
                          value={gas[k]}
                          onChange={(e) => setGas((g) => ({ ...g, [k]: e.target.value.replace(/[^\d.]/g, '') }))}
                          inputMode="decimal"
                          className="mt-0.5 h-8 w-full rounded-lg border bg-surface px-2 text-center text-sm text-ink outline-none focus:border-accent"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-2xs text-muted">
                    Limits: O₂ {GAS_LIMITS.oxygenMin}–{GAS_LIMITS.oxygenMax}% · LEL &lt;{GAS_LIMITS.lelMax}% · H₂S &lt;{GAS_LIMITS.h2sMax}ppm · CO &lt;{GAS_LIMITS.coMax}ppm
                  </p>
                  <Button size="sm" variant="secondary" className="mt-2 w-full" loading={busy}
                    onClick={() => void run(
                      () => api.addPermitGasTest(permit.id, readingOf(gas), actor),
                      {
                        kind: 'gas-test', permitId: permit.id, permitCode: permit.code,
                        reading: readingOf(gas),
                      },
                    )}>
                    Record Gas Test
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Approval chain — where the permit is and who is holding it. */}
          <ReviewChain
            permit={permit}
            review={review}
            busy={busy}
            onAdvance={async (statement) => {
              await permitWorkflowApi.advance(permit.id, statement)
              load(); onChanged()
            }}
            onReturn={async (reason) => {
              await permitWorkflowApi.returnToApplicant(permit.id, reason)
              load(); onChanged()
            }}
          />

          {/* What still stands between this permit and work starting. */}
          {review && review.activationBlockers.length > 0 && permit.status === 'approved' && (
            <Alert tone="warning" title="Not ready to start">
              <ul className="mt-1 space-y-0.5">
                {review.activationBlockers.map((b) => <li key={b}>· {b}</li>)}
              </ul>
            </Alert>
          )}

          {/*
            The toolbox talk, the people and equipment on the permit, its JSA and PPE are kept
            by the server only. The demo said so in red, once per section; now one line does.
          */}
          {isBackendConfigured() ? (
            <>
              {/* Toolbox talk */}
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                  Toolbox talk
                </p>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="min-w-0">
                    {permit.toolboxAt ? (
                      <>
                        <p className="text-sm text-ink">Held {new Date(permit.toolboxAt).toLocaleString()}</p>
                        <p className="text-2xs text-muted">Led by {permit.toolboxBy ?? 'not recorded'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-ink-2">Not Yet Held</p>
                        <p className="text-2xs text-muted">Work cannot start until everyone named has acknowledged it.</p>
                      </>
                    )}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setToolboxOpen(true)}>
                    {permit.toolboxAt ? 'View' : 'Record'}
                  </Button>
                </div>
              </section>

              {/* People named on the permit, and who is currently inside the work area. */}
              <PermitPeoplePanel
                permitId={permit.id}
                permitCode={permit.code}
                permitStatus={permit.status}
                canEdit={open && operator}
                userId={actor.userId}
                onChanged={onChanged}
              />

              {/*
                Directly under the people, because they are the same kind of claim: this named
                person and this named item are fit to be on the job. Reloading the permit on
                change keeps the activation blockers in the header honest.
              */}
              <PermitEquipmentPanel
                permitId={permit.id}
                permitStatus={permit.status}
                canEdit={open}
                onChanged={() => { load(); onChanged() }}
              />

              <JsaTable
                permitId={permit.id}
                permitCode={permit.code}
                canEdit={open}
                userId={actor.userId}
                onChanged={() => { load(); onChanged() }}
                onQueued={fieldQueue.refresh}
              />

              <PpeChecklist
                permitId={permit.id}
                permitCode={permit.code}
                userId={actor.userId}
                required={permit.requiredPpe ?? []}
                acknowledgedAt={permit.ppeAcknowledgedAt ?? null}
                acknowledgedBy={permit.ppeAcknowledgedBy ?? null}
                canEdit={open}
                canAcknowledge={issuer && open}
                onChanged={() => { load(); onChanged() }}
              />
            </>
          ) : (
            <NotInDemo>
              Not in this demo: the toolbox talk, the people and equipment on the permit, its job
              safety analysis, PPE and attachments. They need the SafeChain server.
            </NotInDemo>
          )}

          {/* Isolations */}
          {needsIso && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                Isolation points {liveIsolations > 0 && <span className="text-accent">({liveIsolations} applied)</span>}
              </p>
              <ul className="space-y-1.5">
                {permit.isolations.map((i) => (
                  <li key={i.id} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2', i.removedAt && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-2">{i.description}</p>
                      <p className="text-2xs text-muted">
                        <span className="font-mono">{i.tagId}</span> · applied {i.isolatedBy}
                        {i.removedAt && ` · released ${i.removedBy}`}
                      </p>
                    </div>
                    {!i.removedAt && open && operator && (
                      <Button size="sm" variant="ghost" icon={<Unlock size={11} />} loading={busy}
                        onClick={() => void run(
                          () => api.releasePermitIsolation(permit.id, i.id, actor),
                          {
                            kind: 'isolation-release', permitId: permit.id, permitCode: permit.code,
                            isolationId: i.id, tagId: i.tagId,
                          },
                        )}>
                        Release
                      </Button>
                    )}
                  </li>
                ))}
                {permit.isolations.length === 0 && (
                  <li className="rounded-lg border border-dashed px-3 py-3 text-2xs text-muted">
                    No isolation recorded — required before this permit can be issued.
                  </li>
                )}
              </ul>
              {open && operator && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input value={iso.description} onChange={(e) => setIso((s) => ({ ...s, description: e.target.value }))}
                    placeholder="What is isolated…" aria-label="Isolation description"
                    className="h-9 coarse:h-touch flex-1 rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" />
                  <input value={iso.tagId} onChange={(e) => setIso((s) => ({ ...s, tagId: e.target.value }))}
                    placeholder="LOTO tag" aria-label="Lock/tag id"
                    className="h-9 coarse:h-touch w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent sm:w-28" />
                  <Button size="md" variant="secondary" loading={busy}
                    disabled={!iso.description.trim() || !iso.tagId.trim()}
                    onClick={() => void run(
                      async () => {
                        const r = await api.addPermitIsolation(permit.id, iso, actor)
                        setIso({ description: '', tagId: '' })
                        return r
                      },
                      {
                        kind: 'isolation-add', permitId: permit.id, permitCode: permit.code,
                        input: { description: iso.description, tagId: iso.tagId },
                      },
                    )}>
                    Add
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Signatures */}
          {permit.signatures.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                Signatures
              </p>
              <ul className="space-y-1.5">
                {permit.signatures.map((s, i) => (
                  <li key={i} className="rounded-lg border px-3.5 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm italic text-ink">{s.name}</span>
                      <span className="text-2xs uppercase tracking-wide text-muted">{s.role}</span>
                    </div>
                    <p className="text-2xs leading-relaxed text-ink-2">{s.statement}</p>
                    <p className="text-2xs text-muted">{fmtWindow(s.signedAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Timeline */}
          {isBackendConfigured() && (
            <AttachmentsPanel
              permitId={permit.id}
              permitCode={permit.code}
              canEdit={open}
              canRemove={open && operator}
              userId={actor.userId}
              onChanged={() => { load(); onChanged() }}
            />
          )}

          {/* Extension history — how long this job was actually authorised for, and who
              kept extending it. */}
          {extensions.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                Extensions ({extensions.length})
              </p>
              <ul className="space-y-1.5">
                {extensions.map((x) => (
                  <li key={x.id} className="rounded-lg border px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-ink">
                        Until {new Date(x.newValidTo).toLocaleString()}
                      </p>
                      <Badge tone={x.approvedAt ? 'good' : 'warning'}>
                        {x.approvedAt ? 'Approved' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-2xs text-muted">
                      was {new Date(x.previousValidTo).toLocaleString()} · requested by {x.requestedBy}
                      {x.approvedBy && <span> · approved by {x.approvedBy}</span>}
                    </p>
                    <p className="mt-1 rounded-lg bg-sunken px-2.5 py-1.5 text-2xs leading-relaxed text-ink-2">
                      {x.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PermitTimeline permit={permit} />
        </div>

        {/* Stage actions — one primary decision per state */}
        <div className="space-y-2 border-t px-5 py-3">
          {/*
            Why the last action was refused, shown here, beside the buttons. It used to sit at
            the top of the scrolling body, out of view once the issuer had scrolled down to act:
            pressing Start work on a permit with nobody named on it appeared to do nothing.
          */}
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
          {/*
            Not an error. A record kept on the device at a worksite with no signal is the
            feature working, and the tone says so — see setQueuedNote.
          */}
          {queuedNote && (
            <Alert tone="info" onDismiss={() => setQueuedNote(null)}>{queuedNote}</Alert>
          )}
          <FieldQueuePanel
            queue={fieldQueue.queue}
            draining={fieldQueue.draining}
            onFlush={() => void fieldQueue.flush().then(load)}
          />
          {permit.status === 'draft' && (
            <Button className="w-full" size="lg" loading={busy}
              onClick={() => void run(() => api.submitPermit(permit.id, actor), 'submit')}>
              Sign &amp; Submit for Approval
            </Button>
          )}

          {permit.status === 'submitted' && issuer && (
            <>
              <Textarea rows={2} label="Issue statement" value={statement} onChange={(e) => setStatement(e.target.value)}
                placeholder="Controls verified on site…" />
              <div className="flex gap-2">
                <Button className="flex-1" loading={busy} icon={<Check size={14} />}
                  onClick={() => void run(
                    () => api.approvePermit(permit.id, statement, actor), 'approve',
                  )}>
                  Approve &amp; Issue
                </Button>
                <Button variant="danger" loading={busy}
                  onClick={() => void run(
                    () => api.rejectPermit(permit.id, statement || reason, actor), 'reject',
                  )}>
                  Reject
                </Button>
              </div>
              <p className="text-2xs text-muted">Rejecting requires a reason — put it in the statement box.</p>
            </>
          )}
          {permit.status === 'submitted' && !issuer && (
            <p className="text-2xs text-muted">Awaiting a Safety Officer or above to verify controls and issue.</p>
          )}

          {permit.status === 'approved' && (
            <Button className="w-full" size="lg" loading={busy}
              onClick={() => void run(() => api.activatePermit(permit.id, actor), 'activate')}>
              Start Work
            </Button>
          )}

          {(permit.status === 'active' || permit.status === 'suspended') && issuer && (
            <div className="flex gap-2">
              {permit.status === 'active' ? (
                <Button variant="danger" className="flex-1" icon={<ShieldAlert size={14} />} loading={busy}
                  onClick={() => void run(
                    () => api.suspendPermit(permit.id, suspendReason(reason), actor),
                    {
                      kind: 'suspend', permitId: permit.id, permitCode: permit.code,
                      reason: suspendReason(reason),
                    },
                  )}>
                  Suspend Work
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1" loading={busy}
                  onClick={() => void run(() => api.resumePermit(permit.id, actor), 'resume')}>
                  Resume Work
                </Button>
              )}
            </div>
          )}

          {open && issuer && permit.status !== 'draft' && permit.status !== 'submitted' && (
            <div className="rounded-xl border p-3">
              <Checkbox label="Site handed back — tools clear, isolations released, area safe"
                checked={handback} onChange={(e) => setHandback(e.target.checked)} />
              <Input className="mt-2" placeholder="Closing note (optional)" value={statement}
                onChange={(e) => setStatement(e.target.value)} aria-label="Closing note" />
              <Button className="mt-2 w-full" variant="secondary" loading={busy} disabled={!handback}
                onClick={() => void run(
                  () => api.closePermit(permit.id, { handbackConfirmed: handback, statement }, actor),
                  {
                    kind: 'close', permitId: permit.id, permitCode: permit.code,
                    handbackConfirmed: handback, statement,
                  },
                )}>
                Close Permit
              </Button>
              {liveIsolations > 0 && (
                <p className="mt-1.5 text-2xs" style={{ color: 'var(--warning)' }}>
                  {liveIsolations} isolation(s) still applied — release them before closing.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    <ToolboxDialog
      open={toolboxOpen}
      permitId={permit.id}
      permitCode={permit.code}
      userId={actor.userId}
      toolboxAt={permit.toolboxAt ?? null}
      toolboxBy={permit.toolboxBy ?? null}
      canManage={open}
      onClose={() => setToolboxOpen(false)}
      onChanged={() => { load(); onChanged() }}
    />
    </div>,
    document.body,
  )
}
