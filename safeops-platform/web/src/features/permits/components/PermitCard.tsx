import { AlertTriangle, Clock, MapPin, Users } from 'lucide-react'
import type { PermitView } from '@/api/permits'
import { Badge, StatusPill } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PERMIT_STATUS_KIND, PERMIT_TYPE_COLOR, formatRemaining, remainingTone } from '../lib'

/**
 * One permit on the board.
 *
 * A card rather than a table row: the board is read on a phone at the work face, where a
 * fixed-width table forces horizontal scrolling. Everything a supervisor needs to decide
 * "is this safe right now?" is visible without opening anything — type, location, crew
 * size, time remaining, and any outstanding control.
 */
export function PermitCard({ permit, onOpen }: { permit: PermitView; onOpen: () => void }) {
  const urgent = permit.expiringSoon || permit.status === 'expired' || permit.status === 'suspended'

  return (
    <button
      onClick={onOpen}
      className={cn(
        'w-full rounded-xl border p-3.5 text-left transition-colors hover:bg-accent-soft/40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]',
      )}
      /*
       * Urgent is a red border and a solid stripe down the leading edge, not a red tint.
       * The tint put the card's own red expiry warning on a red ground at 4.2:1, and
       * dimmed every grey label on it - the urgent card was the hardest one to read.
       */
      style={urgent ? { borderColor: 'var(--critical)', boxShadow: 'inset 3px 0 0 var(--critical)' } : undefined}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: PERMIT_TYPE_COLOR[permit.type] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-2xs text-muted">{permit.code}</span>
            <Badge tone="neutral">{permit.typeLabel}</Badge>
            <StatusPill kind={PERMIT_STATUS_KIND[permit.status]} label={permit.statusLabel} />
          </div>

          <p className="mt-1 truncate text-sm font-semibold leading-snug text-ink">{permit.title}</p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-2">
            <span className="inline-flex items-center gap-1"><MapPin size={11} /> {permit.location}</span>
            <span className="inline-flex items-center gap-1"><Users size={11} /> {permit.workerCount}</span>
            <span className="inline-flex items-center gap-1">{permit.applicant}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="inline-flex items-center gap-1 text-2xs font-bold"
              style={{ color: remainingTone(permit.hoursRemaining, permit.status), fontVariantNumeric: 'tabular-nums' }}
            >
              <Clock size={11} /> {formatRemaining(permit.hoursRemaining)}
            </span>
            {permit.outstandingControls > 0 && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold" style={{ color: 'var(--warning)' }}>
                <AlertTriangle size={11} /> {permit.outstandingControls} control(s) outstanding
              </span>
            )}
            {permit.status === 'suspended' && permit.suspendedReason && (
              <span className="text-2xs font-semibold" style={{ color: 'var(--critical)' }}>
                {permit.suspendedReason}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
