import { useState } from 'react'
import { Check, Circle, Clock, PenLine, Undo2, XCircle } from 'lucide-react'
import type { PermitView } from '@/api/permits'
import type { ReviewStatus } from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Dialog, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * The approval chain, as the thing it actually is: a transfer of authority signed by
 * three people in order.
 *
 * Rendered as a full ladder from draft to closed rather than only the review stages,
 * because the question at the permit desk is "where is this and who is holding it up",
 * and that is not answerable from three chips in the middle of a longer process.
 *
 * The sign button appears only when the server says this caller may sign this stage.
 * That is presentation, not enforcement — every transition is re-checked server-side.
 */

type LadderState = 'done' | 'current' | 'pending' | 'rejected'

interface Rung {
  key: string
  label: string
  state: LadderState
  canSign: boolean
  /** Who signed, and what they said. Drawn from the permit's signatures. */
  signedBy?: string
  signedAt?: string
  comment?: string
  role?: string
}

/** Where each stored status sits on the ladder, so progress can be derived. */
const ORDER = [
  'draft', 'submitted', 'supervisor_review', 'hse_review', 'area_authority',
  'approved', 'active', 'closed',
] as const

const LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  supervisor_review: 'Supervisor review',
  hse_review: 'HSE review',
  area_authority: 'Area authority',
  approved: 'Approved',
  active: 'Active',
  closed: 'Closed',
}

/** Matches a signature to its stage. The service prefixes each with the stage label. */
function signatureFor(permit: PermitView, stageLabel: string) {
  return permit.signatures.find(
    (s) => s.role === 'approver' && s.statement.toLowerCase().startsWith(stageLabel.toLowerCase()),
  )
}

function buildLadder(permit: PermitView, review: ReviewStatus | null): Rung[] {
  const status = permit.status
  const rejected = status === 'rejected'
  // `expired` and `suspended` are states an active permit falls into, not rungs of their
  // own — the ladder still shows how far it got.
  const effective = status === 'expired' || status === 'suspended' ? 'active' : status
  const at = ORDER.indexOf(effective as (typeof ORDER)[number])

  return ORDER.map((key, i) => {
    const label = LABEL[key]
    const chainStep = review?.chain.find((c) => c.stage === key)
    const sig = signatureFor(permit, label)

    let state: LadderState = 'pending'
    if (rejected && i > 0) state = i === 1 ? 'rejected' : 'pending'
    else if (at < 0) state = 'pending'
    else if (i < at) state = 'done'
    else if (i === at) state = 'current'

    return {
      key,
      label,
      state,
      canSign: chainStep?.canSign ?? false,
      signedBy: sig?.name,
      signedAt: sig?.signedAt,
      comment: sig?.statement.slice(label.length + 2),
      role: sig ? 'approver' : undefined,
    }
  })
}

const DOT: Record<LadderState, { icon: typeof Check; cls: string; ring: string }> = {
  done: { icon: Check, cls: 'bg-good text-white', ring: 'border-good/40' },
  current: { icon: Clock, cls: 'bg-accent-solid text-white', ring: 'border-accent' },
  pending: { icon: Circle, cls: 'bg-sunken text-muted', ring: 'border-grid' },
  rejected: { icon: XCircle, cls: 'bg-critical-solid text-white', ring: 'border-critical/40' },
}

export function ReviewChain({
  permit, review, busy, onAdvance, onReturn,
}: {
  permit: PermitView
  review: ReviewStatus | null
  busy: boolean
  onAdvance: (statement: string) => Promise<void>
  onReturn: (reason: string) => Promise<void>
}) {
  const [signOpen, setSignOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const rungs = buildLadder(permit, review)
  const current = rungs.find((r) => r.state === 'current')
  // Submitted is the one rung nobody signs — it just enters the chain.
  const canEnterChain = permit.status === 'submitted'
  const canSignNow = !!current?.canSign || canEnterChain
  const inChain = canEnterChain || review?.chain.some((c) => c.state === 'current')

  return (
    <section>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <PenLine size={12} /> Approval chain
      </p>

      <ol className="relative space-y-0">
        {rungs.map((r, i) => {
          const { icon: Icon, cls, ring } = DOT[r.state]
          const last = i === rungs.length - 1
          return (
            <li key={r.key} className="relative flex gap-3 pb-3 last:pb-0">
              {/* Connector, drawn behind the dot so it reads as one continuous ladder. */}
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[11px] top-6 h-full w-px',
                    r.state === 'done' ? 'bg-good/40' : 'bg-grid',
                  )}
                />
              )}
              <span
                className={cn(
                  'z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-2 bg-surface',
                  ring,
                )}
              >
                <span className={cn('flex h-full w-full items-center justify-center rounded-full', cls)}>
                  <Icon size={12} strokeWidth={3} />
                </span>
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className={cn(
                    'text-sm',
                    r.state === 'current' ? 'font-semibold text-ink' : r.state === 'done' ? 'text-ink-2' : 'text-muted',
                  )}>
                    {r.label}
                  </p>
                  {r.state === 'current' && (
                    <span className="text-2xs font-semibold uppercase tracking-wide text-accent">Current</span>
                  )}
                  {r.state === 'rejected' && (
                    <span className="text-2xs font-semibold uppercase tracking-wide text-critical">Returned</span>
                  )}
                </div>

                {r.signedBy && (
                  <p className="text-2xs text-muted">
                    {r.signedBy}
                    {r.role && <span> · {r.role}</span>}
                    {r.signedAt && <span> · {new Date(r.signedAt).toLocaleString()}</span>}
                  </p>
                )}
                {r.comment && (
                  <p className="mt-0.5 rounded-lg bg-sunken px-2.5 py-1.5 text-2xs leading-relaxed text-ink-2">
                    {r.comment}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {permit.rejectionReason && permit.status === 'draft' && (
        <Alert tone="warning" className="mt-3" title="Returned to the applicant">
          {permit.rejectionReason}
        </Alert>
      )}

      {/* Only shown when the server says this caller may act. */}
      {inChain && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canSignNow && (
            <Button size="sm" icon={<Check size={12} />} loading={busy} onClick={() => setSignOpen(true)}>
              {canEnterChain ? 'Start review' : `Sign ${current?.label.toLowerCase()}`}
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<Undo2 size={12} />} loading={busy}
            onClick={() => setReturnOpen(true)}>
            Return to applicant
          </Button>
        </div>
      )}

      <StatementDialog
        open={signOpen}
        title={canEnterChain ? 'Start the review chain' : `Sign ${current?.label ?? 'this stage'}`}
        description={canEnterChain
          ? 'The permit moves to supervisor review.'
          : 'Record what you checked. This is kept against your name on the permit.'}
        placeholder="Method and crew verified against the JSA…"
        confirmLabel="Sign"
        busy={busy}
        onClose={() => setSignOpen(false)}
        onConfirm={async (text) => { await onAdvance(text); setSignOpen(false) }}
      />
      <StatementDialog
        open={returnOpen}
        title="Return to the applicant"
        description="The permit goes back to draft and every approval signature so far is voided — the chain starts again."
        placeholder="The method statement is missing the lift plan…"
        confirmLabel="Return"
        danger
        busy={busy}
        onClose={() => setReturnOpen(false)}
        onConfirm={async (text) => { await onReturn(text); setReturnOpen(false) }}
      />
    </section>
  )
}

function StatementDialog({
  open, title, description, placeholder, confirmLabel, danger, busy, onClose, onConfirm,
}: {
  open: boolean
  title: string
  description: string
  placeholder: string
  confirmLabel: string
  danger?: boolean
  busy: boolean
  onClose: () => void
  onConfirm: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const close = () => { setText(''); setError(null); onClose() }

  const submit = async () => {
    setError(null)
    try {
      await onConfirm(text.trim())
      setText('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.')
    }
  }

  return (
    <Dialog
      error={error}
      open={open} onClose={close} title={title} description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={text.trim().length < 3}
            onClick={() => void submit()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea
        label="Comment" rows={3} autoFocus placeholder={placeholder}
        value={text} onChange={(e) => setText(e.target.value)}
        hint="At least a few words — this is the record of what was checked."
        error={text.length > 0 && text.trim().length < 3 ? 'Say a little more.' : undefined}
      />
    </Dialog>
  )
}
