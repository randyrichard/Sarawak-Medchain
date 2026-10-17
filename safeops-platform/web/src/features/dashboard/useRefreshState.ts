import { useEffect, useRef, useState } from 'react'

/** At least this long on screen, so a quick reload still shows that something happened. */
export const MIN_BUSY_MS = 600
/** How long "Updated" stays before the button reads "Refresh" again. */
export const DONE_MS = 2000

export type RefreshState = 'idle' | 'busy' | 'done'

/**
 * What the Refresh button says: "Refreshing…" while the reload runs, "Updated" for a
 * moment once it has, then "Refresh" again.
 *
 * The reload itself always ran. What was missing was any sign of it: the figures came back
 * the same when nothing had changed, the button never changed, and the "updated" label
 * already read "just now" - so pressing Refresh looked exactly like pressing nothing. A
 * reload that fails goes straight back to "Refresh"; the page shows the error.
 */
export function useRefreshState(refreshing: boolean, failed: boolean): RefreshState {
  const [state, setState] = useState<RefreshState>('idle')
  const startedAt = useRef(0)
  const running = useRef(false)
  /*
   * Read when the reload ends, through a ref rather than as a dependency: the error is
   * cleared by the next load of any kind (a filter change), and re-running the effect for
   * that would cancel the timers below and leave the button reading "Refreshing…".
   */
  const failedRef = useRef(failed)
  useEffect(() => { failedRef.current = failed })

  useEffect(() => {
    if (refreshing) {
      running.current = true
      startedAt.current = Date.now()
      setState('busy')
      return
    }
    if (!running.current) return
    running.current = false
    const left = Math.max(0, MIN_BUSY_MS - (Date.now() - startedAt.current))
    const timers = failedRef.current
      ? [setTimeout(() => setState('idle'), left)]
      : [setTimeout(() => setState('done'), left), setTimeout(() => setState('idle'), left + DONE_MS)]
    return () => timers.forEach(clearTimeout)
  }, [refreshing])

  return state
}
