import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * Without a server, Home is counted from the demo's own records. It used to ask the server
 * regardless, so the public demo opened on "needs the SafeChain server" in red, twice,
 * above "Needs Attention · 0 items". With a server, nothing changes: the API counts it.
 */
const backend = { on: false }
vi.mock('./authApi', async (orig) => ({
  ...(await orig<typeof import('./authApi')>()),
  isBackendConfigured: () => backend.on,
}))
const request = vi.fn()
vi.mock('./http', async (orig) => ({
  ...(await orig<typeof import('./http')>()),
  request: (...a: unknown[]) => request(...a),
}))
vi.mock('@/lib/time', async (orig) => ({
  ...(await orig<typeof import('@/lib/time')>()),
  delay: () => Promise.resolve(),
}))

/** The client as it loads in each mode; which one it is is decided when it loads. */
const client = async (server: boolean) => {
  backend.on = server
  vi.resetModules()
  return (await import('./client')).api
}
const admin = { name: 'Randy Richard', role: 'admin', siteIds: [] }

afterEach(() => { request.mockReset(); backend.on = false })

describe('Home without a server', () => {
  it('counts what needs attention from the demo, and asks no server', async () => {
    const api = await client(false)
    const o = await api.dashboardOverview({ companyId: 'big' }, admin)
    expect(o.attentionTotal).toBeGreaterThan(0)
    expect(o.kpis.overdueActions).toBeGreaterThan(0)
    expect(o.notCounted).toEqual(expect.arrayContaining(['visitors', 'reports', 'calibration']))
    expect(request).not.toHaveBeenCalled()
  })

  it('counts the menu\'s badges from the demo, and asks no server', async () => {
    const api = await client(false)
    const c = await api.attentionCounts({ companyId: 'big' }, admin)
    expect(c.incident).toBeGreaterThan(0)
    expect(request).not.toHaveBeenCalled()
  })

  it('compares the sites from the demo too', async () => {
    const api = await client(false)
    const c = await api.compareSites({ companyId: 'big' }, admin)
    expect(c.rows.length).toBeGreaterThan(1)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Home with a server', () => {
  it('asks the API, with the scope it was given', async () => {
    const api = await client(true)
    request.mockResolvedValue({ attention: [] })
    await api.dashboardOverview({ companyId: 'c1', siteId: 's1', department: 'Maintenance' }, admin)
    expect(request.mock.calls[0][0]).toBe('/dashboard/overview?companyId=c1&siteId=s1&department=Maintenance')
    await api.compareSites({ companyId: 'c1', from: '2026-10-01' }, admin)
    expect(request.mock.calls[1][0]).toBe('/dashboard/sites?companyId=c1&from=2026-10-01')
    await api.attentionCounts({ companyId: 'c1', siteId: 's1' }, admin)
    expect(request.mock.calls[2][0]).toBe('/dashboard/attention-counts?companyId=c1&siteId=s1')
  })
})
