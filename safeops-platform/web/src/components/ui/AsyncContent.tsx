import type { ReactNode } from 'react'
import { AlertOctagon, RotateCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage, type AsyncState } from '@/lib/useAsync'
import { Button } from './Button'
import { SkeletonRows } from './Skeleton'

/**
 * Announces that something is loading, and shows whatever placeholder it is given.
 *
 * Skeletons are `aria-hidden` - they are pictures of a layout, and reading "blank, blank,
 * blank" would be worse than nothing. But hiding them left a screen-reader user with a
 * silent page and no idea whether anything was coming. This wraps the placeholder in a
 * polite live region that says, once, what is loading.
 */
export function Loading({
  label = 'Loading…', children, className,
}: {
  /** What is loading, read to assistive technology: "Loading employees…". */
  label?: string
  /** The visual placeholder. Defaults to skeleton rows. */
  children?: ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children ?? <SkeletonRows />}
    </div>
  )
}

/**
 * A request failed: say so, say what to do, and offer the retry.
 *
 * `role="alert"` because the person was waiting for this content and it is not coming -
 * that is worth interrupting for, unlike the loading message.
 */
export function ErrorState({
  title = "Couldn't load this", error, onRetry, retrying, compact, className,
}: {
  title?: string
  /** The thrown value. Its message is shown when it has one. */
  error?: unknown
  onRetry?: () => void
  retrying?: boolean
  /** Inline single-row layout, for inside a table or a small card. */
  compact?: boolean
  className?: string
}) {
  const detail = errorMessage(error, 'Check your connection and try again.')
  return (
    <div
      role="alert"
      className={cn(
        compact
          ? 'flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-6 text-center'
          : 'flex flex-col items-center px-6 py-10 text-center',
        className,
      )}
    >
      <div className={cn('flex items-center justify-center rounded-xl bg-critical-soft', compact ? 'h-7 w-7' : 'mb-3 h-10 w-10')}>
        <AlertOctagon size={compact ? 15 : 19} className="text-critical" aria-hidden />
      </div>
      <div className={cn(compact && 'text-left')}>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className={cn('max-w-sm text-xs leading-relaxed text-muted', !compact && 'mt-1')}>{detail}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          icon={<RotateCw size={13} aria-hidden />}
          className={cn(!compact && 'mt-4')}
        >
          Try Again
        </Button>
      )}
    </div>
  )
}

/**
 * Renders the right thing for each state of a request: loading, failed, empty, or the data.
 *
 * Pages hand over the `useAsync` result and describe each state; the branching, the
 * announcement and the retry wiring live here once, so no screen can forget the error
 * branch or leave a skeleton on screen after a failure.
 *
 *     const people = useAsync((signal) => api.listEmployees(companyId, { signal }), [companyId])
 *     <AsyncContent
 *       state={people}
 *       loadingLabel="Loading employees…"
 *       isEmpty={(rows) => rows.length === 0}
 *       empty={<EmptyState title="No employees yet" />}
 *     >
 *       {(rows) => <DataTable rows={rows} … />}
 *     </AsyncContent>
 *
 * A failed *reload* keeps the data that is already on screen and shows the error above it,
 * rather than throwing away a list the person was reading because a refresh hiccupped.
 */
export function AsyncContent<T>({
  state, children, loading, loadingLabel, empty, isEmpty, errorTitle, className,
}: {
  state: Pick<AsyncState<T>, 'status' | 'data' | 'error' | 'reload' | 'refreshing'>
  children: (data: T) => ReactNode
  /** Placeholder shaped like the content. Defaults to skeleton rows. */
  loading?: ReactNode
  loadingLabel?: string
  /** Shown when `isEmpty(data)` is true. */
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  errorTitle?: string
  className?: string
}) {
  const { status, data, error, reload, refreshing } = state

  if (data === undefined) {
    if (status === 'error') {
      return <ErrorState title={errorTitle} error={error} onRetry={reload} className={className} />
    }
    return <Loading label={loadingLabel} className={className}>{loading}</Loading>
  }

  const content = isEmpty?.(data) && empty !== undefined ? empty : children(data)
  return (
    <div className={className} aria-busy={refreshing || undefined}>
      {status === 'error' && (
        <ErrorState compact title={errorTitle ?? "Couldn't refresh"} error={error} onRetry={reload} />
      )}
      {content}
    </div>
  )
}
