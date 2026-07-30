import { describe, expect, it, vi } from 'vitest'
import { drain, drainRows, MAX_ROWS } from './paging'

/** A server holding `total` rows and honouring page/pageSize. */
function fakeServer(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  return vi.fn(async (page: number, pageSize: number) => ({
    rows: all.slice((page - 1) * pageSize, page * pageSize),
    total,
  }))
}

describe('drain', () => {
  it('returns everything when the data fits in one page', async () => {
    const fetchPage = fakeServer(12)
    const out = await drain(fetchPage)
    expect(out.rows).toHaveLength(12)
    expect(out.total).toBe(12)
    expect(out.complete).toBe(true)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('walks every page rather than stopping at the first', async () => {
    // The bug this file exists for: 5,012 incidents, 100 reachable.
    const fetchPage = fakeServer(512)
    const out = await drain(fetchPage)
    expect(out.rows).toHaveLength(512)
    expect(out.complete).toBe(true)
    expect(fetchPage).toHaveBeenCalledTimes(6)
  })

  it('preserves server order across page boundaries', async () => {
    const out = await drain(fakeServer(250))
    expect(out.rows.map((r) => r.id)).toEqual(Array.from({ length: 250 }, (_, i) => i))
  })

  it('stops at the row ceiling and says it did not finish', async () => {
    const out = await drain(fakeServer(MAX_ROWS + 500))
    expect(out.rows).toHaveLength(MAX_ROWS)
    expect(out.total).toBe(MAX_ROWS + 500)
    // The caller must be able to tell that rows.length is not the whole story.
    expect(out.complete).toBe(false)
  })

  it('stops when the server contradicts its own total', async () => {
    // A total of 900 with nothing after page 1 would otherwise loop until the request cap.
    const fetchPage = vi.fn(async (page: number) => ({
      rows: page === 1 ? [{ id: 1 }] : [],
      total: 900,
    }))
    const out = await drain(fetchPage)
    expect(out.rows).toHaveLength(1)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(out.complete).toBe(false)
  })

  it('survives a total the server omits', async () => {
    const fetchPage = vi.fn(async () => ({ rows: [{ id: 1 }, { id: 2 }] } as never))
    const out = await drain(fetchPage)
    expect(out.rows).toHaveLength(2)
    expect(out.total).toBe(2)
  })

  it('drainRows hands back just the rows', async () => {
    expect(await drainRows(fakeServer(150))).toHaveLength(150)
  })
})
