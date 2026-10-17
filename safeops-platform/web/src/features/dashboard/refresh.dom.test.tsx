// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { announceRefresh, onRefresh } from '@/lib/refreshSignal'
import { DONE_MS, MIN_BUSY_MS, useRefreshState } from './useRefreshState'

/*
 * Home's Refresh.
 *
 * It reloaded all along, but nothing on screen said so: the figures came back the same, the
 * button never changed and the label already read "updated just now". Reported as "the
 * Refresh button does not work".
 */

const overview = vi.fn()
vi.mock('@/api/client', () => ({ api: { dashboardOverview: (...a: unknown[]) => overview(...a) } }))
// One object, as the context gives: a new company each render would reload each render.
const org = { company: { id: 'co1' }, project: null, site: null }
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => org }))
vi.mock('@/features/incidents/lib', () => ({ useActor: () => ({ name: 'Aina', role: 'admin' }) }))

const { useDashboard } = await import('./useDashboard')

afterEach(() => { cleanup(); vi.useRealTimers(); overview.mockReset() })

describe('the Refresh button', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('says it is refreshing for long enough to be seen, then that it has, then goes back', () => {
    const { result, rerender } = renderHook(({ on }) => useRefreshState(on, false), { initialProps: { on: false } })
    expect(result.current).toBe('idle')
    rerender({ on: true })
    expect(result.current).toBe('busy')
    // A fast reload: done after 50ms, but "Refreshing…" holds for the minimum.
    act(() => { vi.advanceTimersByTime(50) })
    rerender({ on: false })
    expect(result.current).toBe('busy')
    act(() => { vi.advanceTimersByTime(MIN_BUSY_MS - 50) })
    expect(result.current).toBe('done')
    act(() => { vi.advanceTimersByTime(DONE_MS) })
    expect(result.current).toBe('idle')
  })

  it('does not claim "Updated" when the reload failed', () => {
    const { result, rerender } = renderHook(({ on, failed }) => useRefreshState(on, failed), {
      initialProps: { on: true, failed: false },
    })
    rerender({ on: false, failed: true })
    act(() => { vi.advanceTimersByTime(MIN_BUSY_MS) })
    expect(result.current).toBe('idle')
  })

  it('is not left reading "Refreshing…" when the error clears before it finishes', () => {
    // The next load of any kind clears the error; that must not cancel the way back.
    const { result, rerender } = renderHook(({ on, failed }) => useRefreshState(on, failed), {
      initialProps: { on: true, failed: false },
    })
    rerender({ on: false, failed: true })
    rerender({ on: false, failed: false })
    act(() => { vi.advanceTimersByTime(MIN_BUSY_MS + DONE_MS) })
    expect(result.current).toBe('idle')
  })
})

describe('a refresh reaches everything showing the same records', () => {
  it('tells every listener, and stops telling one that has left', () => {
    const counts = vi.fn(), bell = vi.fn()
    const offCounts = onRefresh(counts)
    const offBell = onRefresh(bell)
    announceRefresh()
    offCounts()
    announceRefresh()
    offBell()
    expect(counts).toHaveBeenCalledTimes(1)
    expect(bell).toHaveBeenCalledTimes(2)
  })
})

describe('useDashboard', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

  it('asks the server again on refresh, and says when that is under way', async () => {
    let answer!: (v: unknown) => void
    overview.mockResolvedValueOnce({ generatedAt: '2026-10-17T07:00:00Z' })
    const { result } = renderHook(() => useDashboard(), { wrapper })
    await waitFor(() => expect(result.current.data).not.toBeNull())
    expect(overview).toHaveBeenCalledTimes(1)
    expect(result.current.refreshing).toBe(false)

    overview.mockReturnValueOnce(new Promise((ok) => { answer = ok }))
    act(() => { result.current.refresh() })
    expect(result.current.refreshing).toBe(true)
    await waitFor(() => expect(overview).toHaveBeenCalledTimes(2))
    await act(async () => { answer({ generatedAt: '2026-10-17T07:05:00Z' }) })
    expect(result.current.refreshing).toBe(false)
    expect(result.current.data?.generatedAt).toBe('2026-10-17T07:05:00Z')
  })

  it('stops saying it is refreshing when the reload fails', async () => {
    overview.mockResolvedValueOnce({ generatedAt: '2026-10-17T07:00:00Z' })
    const { result } = renderHook(() => useDashboard(), { wrapper })
    await waitFor(() => expect(result.current.data).not.toBeNull())
    overview.mockRejectedValueOnce(new Error('offline'))
    act(() => { result.current.refresh() })
    await waitFor(() => expect(result.current.refreshing).toBe(false))
    expect(result.current.error).toBe('Could not load the dashboard.')
  })
})
