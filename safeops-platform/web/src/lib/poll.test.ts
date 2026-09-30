import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pollWhileVisible } from './poll'

/** A document stand-in: the tests run without a browser. */
function fakeDoc(state: 'visible' | 'hidden' = 'visible') {
  const listeners = new Set<() => void>()
  return {
    visibilityState: state as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn) },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn) },
    show() { this.visibilityState = 'visible'; listeners.forEach((f) => f()) },
    hide() { this.visibilityState = 'hidden'; listeners.forEach((f) => f()) },
    listeners,
  }
}

describe('pollWhileVisible', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('ticks on the interval while visible', () => {
    const doc = fakeDoc()
    const tick = vi.fn()
    pollWhileVisible(tick, 1000, doc as never)
    vi.advanceTimersByTime(3000)
    expect(tick).toHaveBeenCalledTimes(3)
  })

  it('makes no requests while hidden, and catches up once on return', () => {
    const doc = fakeDoc()
    const tick = vi.fn()
    pollWhileVisible(tick, 1000, doc as never)
    doc.hide()
    vi.advanceTimersByTime(60_000) // a minute in a background tab
    expect(tick).not.toHaveBeenCalled()
    doc.show()
    expect(tick).toHaveBeenCalledTimes(1) // fresh the moment they look
    vi.advanceTimersByTime(1000)
    expect(tick).toHaveBeenCalledTimes(2) // and back on the interval
  })

  it('does not tick on return when nothing was missed', () => {
    const doc = fakeDoc()
    const tick = vi.fn()
    pollWhileVisible(tick, 1000, doc as never)
    doc.hide()
    doc.show()
    expect(tick).not.toHaveBeenCalled()
  })

  it('stops entirely on cleanup, listener included', () => {
    const doc = fakeDoc()
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000, doc as never)
    stop()
    vi.advanceTimersByTime(5000)
    doc.hide(); doc.show()
    expect(tick).not.toHaveBeenCalled()
    expect(doc.listeners.size).toBe(0)
  })
})
