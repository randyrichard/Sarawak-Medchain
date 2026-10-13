// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * In the public demo an asset's record asked the server for who holds it, its photos,
 * calibration, maintenance and history, and each section answered "needs the SafeChain
 * server" in red. The demo keeps none of them, so it now asks for none and says so in one line.
 */
vi.mock('@/api/authApi', async (orig) => ({
  ...(await orig<object>()),
  isBackendConfigured: () => false,
}))
const request = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<object>()),
  request: (...a: unknown[]) => request(...a),
}))
vi.mock('@/lib/time', async (orig) => ({ ...(await orig<object>()), delay: () => Promise.resolve() }))
vi.mock('@/features/org/OrgContext', async (orig) => ({
  ...(await orig<object>()),
  useOrg: () => ({ company: { id: 'big' }, sites: [], role: 'admin', membership: { siteIds: [] }, allowed: () => true }),
}))
vi.mock('@/features/incidents/lib', async (orig) => ({
  ...(await orig<object>()),
  useActor: () => ({ name: 'Randy Richard', role: 'admin', siteIds: [] }),
  usePeople: () => [],
}))

const { AssetDrawer } = await import('./AssetDrawer')

afterEach(cleanup)

describe('an asset in the offline demo', () => {
  it('names what the demo leaves out once, and asks no server for it', async () => {
    render(
      <MemoryRouter>
        <AssetDrawer assetId="ast-1010" manage onClose={() => {}} onRun={() => {}} onChanged={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Not in this demo: who has it, its photos and files, calibration/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/needs the SafeChain server/)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
})
