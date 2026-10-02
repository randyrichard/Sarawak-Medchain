import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

/**
 * One loading/error/data contract for every screen that fetches.
 *
 * Before this, each page wrote its own `useEffect` + `useState` + `cancelled` flag, and most
 * of them forgot the error branch: `api.x().then(setRows)` with no `.catch`, so a failed
 * request left a skeleton on screen for ever with nothing to click. Eighty-five feature
 * files carried a variation of that pattern. This hook is the one place it is written
 * correctly:
 *
 * - **Race-safe.** Only the latest request may settle state. Switching company twice
 *   quickly can no longer show the first company's rows after the second's.
 * - **Abortable.** The loader receives an `AbortSignal`, aborted when the inputs change or
 *   the component unmounts, so a fetch that honours it stops downloading.
 * - **Never stuck.** A rejection becomes `status: 'error'` with the error kept, and
 *   `reload()` tries again.
 * - **Keeps what it has.** A reload after data arrived keeps the data on screen and sets
 *   `refreshing`, so a list does not blank out to a skeleton every time it is refreshed.
 *
 * `enabled: false` holds the request until its inputs exist (no company selected yet), and
 * reports `status: 'idle'` meanwhile, which `AsyncContent` renders as loading.
 */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T> {
  status: AsyncStatus
  /** The last data that loaded. Kept through a reload and through a later failure. */
  data: T | undefined
  error: unknown
  /** True while a request is in flight and data from an earlier one is still shown. */
  refreshing: boolean
  /** Runs the loader again with the current inputs. */
  reload: () => void
  /** Replaces the data in place - for an optimistic update after a mutation. */
  setData: (update: T | ((prev: T | undefined) => T)) => void
}

export interface UseAsyncOptions {
  /** When false nothing is requested and the state stays `idle`. Default true. */
  enabled?: boolean
}

export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  { enabled = true }: UseAsyncOptions = {},
): AsyncState<T> {
  const [state, setState] = useState<{ status: AsyncStatus; data: T | undefined; error: unknown }>({
    status: enabled ? 'loading' : 'idle',
    data: undefined,
    error: undefined,
  })
  const [nonce, setNonce] = useState(0)

  // The latest loader is called without being a dependency, so callers can pass an inline
  // arrow. What decides when to reload is `deps`, exactly as with useEffect.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === 'idle' ? s : { ...s, status: 'idle' }))
      return
    }
    const controller = new AbortController()
    let current = true
    setState((s) => (s.status === 'loading' ? s : { ...s, status: 'loading' }))
    Promise.resolve()
      .then(() => loaderRef.current(controller.signal))
      .then(
        (data) => { if (current) setState({ status: 'success', data, error: undefined }) },
        (error) => { if (current) setState((s) => ({ status: 'error', data: s.data, error })) },
      )
    return () => {
      current = false
      controller.abort()
    }
  }, [enabled, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({
      status: 'success',
      error: undefined,
      data: typeof update === 'function' ? (update as (prev: T | undefined) => T)(s.data) : update,
    }))
  }, [])

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    refreshing: state.status === 'loading' && state.data !== undefined,
    reload,
    setData,
  }
}

/** A message safe to show a person for whatever a loader threw. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
