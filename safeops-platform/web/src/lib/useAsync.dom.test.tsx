// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { errorMessage, useAsync } from './useAsync'

afterEach(cleanup)

/** A promise the test settles by hand, to put responses in any order. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useAsync', () => {
  it('loads, then holds the data', async () => {
    const { result } = renderHook(() => useAsync(async () => 42, []))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBe(42)
  })

  it('never lets a stale response overwrite a newer one', async () => {
    // Switch company A -> B, and A's slower response arrives last. B must win.
    const calls: Record<string, ReturnType<typeof deferred<string>>> = { A: deferred(), B: deferred() }
    const { result, rerender } = renderHook(({ id }) => useAsync(() => calls[id].promise, [id]), {
      initialProps: { id: 'A' },
    })
    rerender({ id: 'B' })
    await act(async () => { calls.B.resolve('rows of B') })
    await act(async () => { calls.A.resolve('rows of A') })
    expect(result.current.data).toBe('rows of B')
  })

  it('aborts the superseded request and the request in flight at unmount', async () => {
    const signals: AbortSignal[] = []
    const { rerender, unmount } = renderHook(({ id }) => useAsync((s) => { signals.push(s); return new Promise(() => {}) }, [id]), {
      initialProps: { id: 1 },
    })
    await waitFor(() => expect(signals).toHaveLength(1))
    rerender({ id: 2 })
    await waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0].aborted).toBe(true)
    unmount()
    expect(signals[1].aborted).toBe(true)
  })

  it('turns a rejection into an error state, and recovers on reload', async () => {
    let fail = true
    const { result } = renderHook(() => useAsync(async () => { if (fail) throw new Error('Server unavailable'); return 'ok' }, []))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(errorMessage(result.current.error)).toBe('Server unavailable')
    fail = false
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBe('ok')
    expect(result.current.error).toBeUndefined()
  })

  it('keeps the data on screen while reloading, flagged as refreshing', async () => {
    const next = deferred<string>()
    let first = true
    const { result } = renderHook(() => useAsync(() => (first ? Promise.resolve('v1') : next.promise), []))
    await waitFor(() => expect(result.current.data).toBe('v1'))
    first = false
    act(() => result.current.reload())
    expect(result.current.refreshing).toBe(true)
    expect(result.current.data).toBe('v1')
    await act(async () => next.resolve('v2'))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.data).toBe('v2')
  })

  it('waits while disabled, then loads once enabled', async () => {
    const loader = vi.fn(async () => 'x')
    const { result, rerender } = renderHook(({ on }) => useAsync(loader, [], { enabled: on }), { initialProps: { on: false } })
    expect(result.current.status).toBe('idle')
    expect(loader).not.toHaveBeenCalled()
    rerender({ on: true })
    await waitFor(() => expect(result.current.data).toBe('x'))
  })

  it('takes an optimistic update in place', async () => {
    const { result } = renderHook(() => useAsync(async () => [1, 2], []))
    await waitFor(() => expect(result.current.data).toEqual([1, 2]))
    act(() => result.current.setData((prev) => [...(prev ?? []), 3]))
    expect(result.current.data).toEqual([1, 2, 3])
  })
})

describe('errorMessage', () => {
  it('uses the message when there is one and the fallback otherwise', () => {
    expect(errorMessage(new Error('Nope'))).toBe('Nope')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage({ weird: true }, 'Fallback')).toBe('Fallback')
  })
})
