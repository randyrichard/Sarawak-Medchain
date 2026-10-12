import { useState } from 'react'
import {
  HardHat, Footprints, Hand, Eye, Wind, LifeBuoy, Radio, Ear, ShieldCheck, Anchor,
  MoreHorizontal, Check,
} from 'lucide-react'
import { permitWorkflowApi, PPE_OPTIONS, type PpeItem } from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import { Alert, Button } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * The PPE the issuer requires for this job.
 *
 * Cards rather than a text field, because a picked list is countable: "harness",
 * "Harness" and "full body harness" are three answers to one question, and a permit pack
 * that cannot be counted cannot be audited.
 *
 * Selecting an item is a change to the requirement, so it voids any acknowledgement —
 * what was signed for is no longer what is required. The server enforces that; this
 * screen shows it happening.
 */

const ICON: Record<PpeItem, typeof HardHat> = {
  Helmet: HardHat,
  'Safety Shoes': Footprints,
  Gloves: Hand,
  'Face Shield': Eye,
  Respirator: Wind,
  Harness: Anchor,
  'Life Jacket': LifeBuoy,
  'Gas Detector': Radio,
  SCBA: ShieldCheck,
  'Hearing Protection': Ear,
  Other: MoreHorizontal,
}

export function PpeChecklist({
  permitId, required, acknowledgedAt, acknowledgedBy, canEdit, canAcknowledge, onChanged,
}: {
  permitId: string
  required: string[]
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  canEdit: boolean
  canAcknowledge: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justAcked, setJustAcked] = useState(false)

  const selected = new Set(required)
  const acknowledged = !!acknowledgedAt

  const toggle = async (item: PpeItem) => {
    if (!canEdit || busy) return
    const next = new Set(selected)
    if (next.has(item)) next.delete(item)
    else next.add(item)

    setBusy(true)
    setError(null)
    try {
      await permitWorkflowApi.setPpe(permitId, [...next])
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the PPE list.')
    } finally {
      setBusy(false)
    }
  }

  const acknowledge = async () => {
    setBusy(true)
    setError(null)
    try {
      await permitWorkflowApi.acknowledgePpe(permitId)
      setJustAcked(true)
      setTimeout(() => setJustAcked(false), 2200)
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not acknowledge the PPE.')
    } finally {
      setBusy(false)
    }
  }

  // Completion is binary in substance — either the required kit was checked or it was
  // not — but shown as a proportion so a half-finished permit reads as half-finished.
  const pct = required.length === 0 ? 0 : acknowledged ? 100 : 0

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Required PPE
          {required.length > 0 && <span className="text-muted">({required.length})</span>}
        </p>
        {required.length > 0 && (
          <span className={cn('text-2xs font-semibold', acknowledged ? 'text-good' : 'text-warning')}>
            {pct}% checked
          </span>
        )}
      </div>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {PPE_OPTIONS.map((item) => {
          const Icon = ICON[item]
          const on = selected.has(item)
          return (
            <button
              key={item}
              type="button"
              disabled={!canEdit || busy}
              aria-pressed={on}
              onClick={() => void toggle(item)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                on ? 'border-accent bg-accent-soft' : 'border-grid',
                canEdit && !busy ? 'hover:bg-accent-soft/50' : 'cursor-default',
              )}
            >
              <Icon size={15} className={on ? 'text-accent' : 'text-muted'} />
              <span className={cn('min-w-0 flex-1 truncate text-2xs', on ? 'font-semibold text-ink' : 'text-ink-2')}>
                {item}
              </span>
              {on && <Check size={12} strokeWidth={3} className="shrink-0 text-accent" />}
            </button>
          )
        })}
      </div>

      {required.length === 0 ? (
        <p className="mt-2 text-2xs text-muted">
          Nothing selected. If the job needs no PPE beyond site standard, leave this empty.
        </p>
      ) : acknowledged ? (
        <div className={cn(
          'mt-2.5 flex items-center gap-2 rounded-lg border border-good/40 bg-good/5 px-3 py-2',
          justAcked && 'animate-scale-in',
        )}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-good text-white">
            <Check size={12} strokeWidth={3} />
          </span>
          <p className="text-2xs text-ink-2">
            Checked and acknowledged by <span className="font-semibold text-ink">{acknowledgedBy}</span>
            {acknowledgedAt && <> · {new Date(acknowledgedAt).toLocaleString()}</>}
          </p>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {canAcknowledge ? (
            <Button size="sm" icon={<Check size={12} />} loading={busy} onClick={() => void acknowledge()}>
              Confirm This PPE Is on Site
            </Button>
          ) : (
            <p className="text-2xs text-muted">Awaiting the issuer's confirmation.</p>
          )}
          <span className="text-2xs text-warning">Work cannot start until this is confirmed.</span>
        </div>
      )}
    </section>
  )
}
