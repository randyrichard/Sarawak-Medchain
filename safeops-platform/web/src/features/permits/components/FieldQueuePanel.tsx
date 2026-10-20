import { Button } from '@/components/ui'
import { isPersistent } from '@/lib/fieldOutbox/store'
import type { QueuedOp } from '@/lib/fieldOutbox/queue'
import { isStale } from '@/lib/fieldOutbox/queue'
import { fmtTime } from '../lib'

/**
 * What this device has recorded and the server has not been told about yet.
 *
 * Shown rather than hidden behind a spinner, because the person who recorded a gas test is
 * accountable for it having been recorded. "Saved" with nothing to look at is how somebody
 * ends a shift believing a confined-space entry is on the register when it is sitting in a
 * phone in a locker.
 *
 * Two lists, deliberately separate. One is waiting for signal, which needs no action and
 * resolves itself. The other is waiting for a person — refused by the server, or old enough
 * that retrying is no longer an honest answer — and will not move until somebody looks.
 * Running them together produced a count nobody could act on.
 */
export function FieldQueuePanel({
  queue, draining, onFlush,
}: {
  queue: QueuedOp[]
  draining: boolean
  onFlush: () => void
}) {
  if (queue.length === 0) return null

  const waiting = queue.filter((o) => !o.blocked && !isStale(o))
  const stuck = queue.filter((o) => o.blocked || isStale(o))

  return (
    <section className="rounded-lg border border-warning bg-warning-soft p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {queue.length} record{queue.length === 1 ? '' : 's'} on this device
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            {waiting.length > 0 && `${waiting.length} waiting for a connection. `}
            {stuck.length > 0 && `${stuck.length} need${stuck.length === 1 ? 's' : ''} a look. `}
            {/*
              Said plainly, because it is the difference between a record that survives the
              phone being closed and one that does not. A device with storage blocked - a
              locked-down browser, a private window - still accepts the record rather than
              refusing it outright, but the person has to know not to close the tab.
            */}
            {!isPersistent() && 'This browser cannot store them: keep this tab open until they send.'}
          </p>
        </div>
        {waiting.length > 0 && (
          <Button size="sm" variant="secondary" onClick={onFlush} disabled={draining}>
            {draining ? 'Sending…' : 'Send Now'}
          </Button>
        )}
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {queue.map((op) => (
          <li key={op.clientRef} className="text-xs">
            <span className="text-ink">{op.label}</span>
            <span className="text-ink-2">
              {' · '}
              {fmtTime(op.queuedAt)}
              {/*
                The attempt count is here because it is the one fact that distinguishes "the
                network is down" from "this is never going to send", and somebody deciding
                whether to write it on paper instead needs that.
              */}
              {op.attempts > 0 && ` · ${op.attempts} attempt${op.attempts === 1 ? '' : 's'}`}
            </span>
            {(op.blocked || isStale(op)) && (
              <p className="mt-0.5 text-xs font-medium text-critical">
                {op.blocked
                  ? op.lastError ?? 'The server refused this. Check the permit and record it again.'
                  : 'Waiting since the day before yesterday. Record it again, or report it on paper.'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
