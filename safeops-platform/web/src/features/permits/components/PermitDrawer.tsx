import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check, Clock, FlaskConical, Lock, PenLine, Printer, ShieldAlert, Unlock, X, Users,
} from 'lucide-react'
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
import { permitWorkflowApi, type ReviewStatus } from '@/api/permitWorkflowApi'
import { permitPeopleApi, type PermitExtension } from '@/api/permitPeopleApi'
import { Alert, Badge, Button, Checkbox, Input, StatusPill, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PERMIT_STATUS_KIND, formatRemaining, fmtTime, fmtWindow, remainingTone } from '../lib'
import { printPermit } from '../print'

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

  const run = async (fn: () => Promise<PermitView | void>) => {
    setBusy(true); setError(null)
    try {
      const updated = await fn()
      if (updated) setPermit(updated)
      else load()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
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
              <StatusPill kind={PERMIT_STATUS_KIND[permit.status]} label={permit.statusLabel} />
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink">{permit.title}</h2>
            <p className="text-2xs text-muted">{permit.location} · {permit.department} · {permit.workerCount} worker(s)</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => printPermit(permit)} aria-label="Print permit"
              className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink"><Printer size={16} /></button>
            <button onClick={onClose} aria-label="Close"
              className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

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
                <Clock size={12} className="mr-1 inline" />{formatRemaining(permit.hoursRemaining)}
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
                      onChange={(e) => void run(() => api.confirmPermitControl(permit.id, c.id, e.target.checked, actor))}
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
                <FlaskConical size={12} /> Atmospheric testing
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
                    onClick={() => void run(() => api.addPermitGasTest(permit.id, {
                      oxygenPct: Number(gas.oxygenPct), lelPct: Number(gas.lelPct),
                      h2sPpm: Number(gas.h2sPpm), coPpm: Number(gas.coPpm),
                    }, actor))}>
                    Record gas test
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

          {/* Toolbox talk */}
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <Users size={12} /> Toolbox talk
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
                    <p className="text-sm text-ink-2">Not yet held</p>
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
            permitStatus={permit.status}
            canEdit={open && operator}
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

          <JsaTable permitId={permit.id} canEdit={open} onChanged={() => { load(); onChanged() }} />

          <PpeChecklist
            permitId={permit.id}
            required={permit.requiredPpe ?? []}
            acknowledgedAt={permit.ppeAcknowledgedAt ?? null}
            acknowledgedBy={permit.ppeAcknowledgedBy ?? null}
            canEdit={open}
            canAcknowledge={issuer && open}
            onChanged={() => { load(); onChanged() }}
          />

          {/* Isolations */}
          {needsIso && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <Lock size={12} /> Isolation points {liveIsolations > 0 && <span className="text-accent">({liveIsolations} applied)</span>}
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
                        onClick={() => void run(() => api.releasePermitIsolation(permit.id, i.id, actor))}>
                        Release
                      </Button>
                    )}
                  </li>
                ))}
                {permit.isolations.length === 0 && (
                  <li className="rounded-lg border border-dashed px-3 py-3 text-center text-2xs text-muted">
                    No isolation recorded — required before this permit can be issued.
                  </li>
                )}
              </ul>
              {open && operator && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input value={iso.description} onChange={(e) => setIso((s) => ({ ...s, description: e.target.value }))}
                    placeholder="What is isolated…" aria-label="Isolation description"
                    className="h-9 coarse:h-11 flex-1 rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" />
                  <input value={iso.tagId} onChange={(e) => setIso((s) => ({ ...s, tagId: e.target.value }))}
                    placeholder="LOTO tag" aria-label="Lock/tag id"
                    className="h-9 coarse:h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent sm:w-28" />
                  <Button size="md" variant="secondary" loading={busy}
                    disabled={!iso.description.trim() || !iso.tagId.trim()}
                    onClick={() => void run(async () => {
                      const r = await api.addPermitIsolation(permit.id, iso, actor)
                      setIso({ description: '', tagId: '' })
                      return r
                    })}>
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
                <PenLine size={12} /> Signatures
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
          <AttachmentsPanel permitId={permit.id} canEdit={open} canRemove={open && operator} onChanged={() => { load(); onChanged() }} />

          {/* Extension history — how long this job was actually authorised for, and who
              kept extending it. */}
          {extensions.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <Clock size={12} /> Extensions ({extensions.length})
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
          {permit.status === 'draft' && (
            <Button className="w-full" size="lg" loading={busy}
              onClick={() => void run(() => api.submitPermit(permit.id, actor))}>
              Sign &amp; submit for approval
            </Button>
          )}

          {permit.status === 'submitted' && issuer && (
            <>
              <Textarea rows={2} label="Issue statement" value={statement} onChange={(e) => setStatement(e.target.value)}
                placeholder="Controls verified on site…" />
              <div className="flex gap-2">
                <Button className="flex-1" loading={busy} icon={<Check size={14} />}
                  onClick={() => void run(() => api.approvePermit(permit.id, statement, actor))}>
                  Approve &amp; issue
                </Button>
                <Button variant="danger" loading={busy}
                  onClick={() => void run(() => api.rejectPermit(permit.id, statement || reason, actor))}>
                  Reject
                </Button>
              </div>
              <p className="text-2xs text-muted">Rejecting requires a reason — put it in the statement box.</p>
            </>
          )}
          {permit.status === 'submitted' && !issuer && (
            <p className="text-center text-2xs text-muted">Awaiting a Safety Officer or above to verify controls and issue.</p>
          )}

          {permit.status === 'approved' && (
            <Button className="w-full" size="lg" loading={busy}
              onClick={() => void run(() => api.activatePermit(permit.id, actor))}>
              Start work
            </Button>
          )}

          {(permit.status === 'active' || permit.status === 'suspended') && issuer && (
            <div className="flex gap-2">
              {permit.status === 'active' ? (
                <Button variant="danger" className="flex-1" icon={<ShieldAlert size={14} />} loading={busy}
                  onClick={() => void run(() => api.suspendPermit(permit.id, reason || 'Suspended by issuing authority.', actor))}>
                  Suspend work
                </Button>
              ) : (
                <Button variant="secondary" className="flex-1" loading={busy}
                  onClick={() => void run(() => api.resumePermit(permit.id, actor))}>
                  Resume work
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
                onClick={() => void run(() => api.closePermit(permit.id, { handbackConfirmed: handback, statement }, actor))}>
                Close permit
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
