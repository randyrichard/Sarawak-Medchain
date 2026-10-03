import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The URLs the HSE Performance page calls. The page tests mock this client whole, so a
 * malformed path here (the first version left out the "?" before the query string and
 * every call was a 404) passes them all - it is checked on its own.
 */
const request = vi.fn()
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), request: (...a: unknown[]) => request(...a) }))

const { performanceApi } = await import('./performanceApi')

beforeEach(() => request.mockReset().mockResolvedValue({}))

describe('performanceApi', () => {
  it('asks for performance with a proper query string', async () => {
    await performanceApi.get({ companyId: 'co1', projectId: null, months: 12 })
    expect(request.mock.calls[0][0]).toBe('/performance?companyId=co1&months=12')
    await performanceApi.get({ companyId: 'co1', projectId: 'p1', months: 6, endMonth: '2026-06' })
    expect(request.mock.calls[1][0]).toBe('/performance?companyId=co1&projectId=p1&months=6&endMonth=2026-06')
  })

  it('asks for a year of man-hours', async () => {
    await performanceApi.manHours('co1', 2026)
    expect(request.mock.calls[0][0]).toBe('/performance/man-hours?companyId=co1&year=2026')
  })

  it('records man-hours with PUT, keeping null as null', async () => {
    await performanceApi.setManHours({ companyId: 'co1', siteId: 's1', month: '2026-01', hours: null })
    const [path, init] = request.mock.calls[0]
    expect(path).toBe('/performance/man-hours')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ companyId: 'co1', siteId: 's1', month: '2026-01', hours: null })
  })
})
