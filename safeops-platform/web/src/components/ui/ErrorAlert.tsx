import { ServerOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage, isUnavailableHere } from '@/lib/useAsync'
import { Alert } from './Alert'

/**
 * A failure shown above a page: a critical Alert, unless it is the public demo saying a part
 * needs the server. That is not a fault, so it gets a calm note, as ErrorState gives it.
 *
 * Takes what was caught, not its message. The pages kept only the message, which cannot tell
 * the two apart, so the demo's Visitors, Employees, Contractors, Reports, Incident Board and
 * Equipment Board each opened on a red alarm about a part the demo simply does not include.
 * With a server configured the same refusal means a wrong address, and stays an Alert.
 */
export function ErrorAlert({ error, onDismiss, className }: {
  /** What was caught, or a message to show. Nothing is shown for null, undefined or ''. */
  error: unknown
  onDismiss?: () => void
  className?: string
}) {
  if (error === null || error === undefined || error === '') return null
  if (isUnavailableHere(error)) {
    return (
      <div role="status" className={cn('flex items-start gap-2.5 rounded-lg border border-line bg-sunken px-3.5 py-3', className)}>
        <ServerOff size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Not in this demo</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{errorMessage(error)}</p>
        </div>
      </div>
    )
  }
  return <Alert tone="critical" onDismiss={onDismiss} className={className}>{errorMessage(error)}</Alert>
}
