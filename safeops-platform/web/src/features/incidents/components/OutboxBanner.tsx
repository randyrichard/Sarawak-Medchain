import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { useOutbox } from '../useOutbox'

/*
 * Says what is still unsent, on every screen.
 *
 * It sits in the shell rather than on the incident pages because the person who needs to see
 * it has usually navigated away — they filed the report, pocketed the phone, and opened the
 * app later for something else. A queued injury report that is only visible on the screen
 * that created it is, in practice, invisible.
 *
 * Renders nothing when the queue is empty, which is almost always.
 */
export function OutboxBanner() {
  const { waiting, stuck, draining, flush } = useOutbox()

  if (waiting === 0 && stuck === 0) return null

  const plural = (n: number) => (n === 1 ? 'report' : 'reports')

  return (
    <div className="mb-3 space-y-2">
      {waiting > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-sunken px-3 py-2 text-xs text-ink-2"
          role="status"
        >
          {draining
            ? <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
            : <CloudOff size={14} className="shrink-0 text-accent" aria-hidden="true" />}
          <span className="font-medium text-ink">
            {waiting} {plural(waiting)} waiting to send
          </span>
          <span>
            {draining ? 'Sending now…' : 'Held on this device. It will send by itself when there is a connection.'}
          </span>
          {!draining && (
            <Button size="sm" variant="ghost" onClick={() => void flush()} icon={<RefreshCw size={12} />}>
              Try now
            </Button>
          )}
        </div>
      )}

      {stuck > 0 && (
        /*
         * A separate line, and deliberately not the same colour. These will not send on their
         * own - the server refused them, or they have been sitting long enough that saying
         * "it will send" would no longer be true - and telling somebody a report is on its
         * way when it is not is the one thing this feature must never do.
         */
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-ink-2"
          role="alert"
        >
          <TriangleAlert size={14} className="shrink-0 text-warning" aria-hidden="true" />
          <span className="font-medium text-ink">
            {stuck} {plural(stuck)} could not be sent
          </span>
          <span>Still saved on this device, but it needs someone to look — ask your HSE administrator.</span>
        </div>
      )}
    </div>
  )
}
