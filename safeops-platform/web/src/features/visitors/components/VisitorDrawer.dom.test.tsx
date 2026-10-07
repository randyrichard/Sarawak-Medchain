// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The visitor drawer is a dialog, and Escape closes it, as every other drawer does.
 *
 * It had neither: a screen reader was not told a dialog had opened, and a gatehouse guard
 * on a keyboard had to find the close button. Found in the browser workflow test. It is
 * mounted while closed, so Escape must do nothing then.
 */
const pending = () => new Promise<never>(() => {})
vi.mock('@/api/visitorsApi', async (orig) => ({
  ...(await orig<object>()),
  visitorsApi: { get: pending, gate: pending, timeline: pending },
}))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ role: 'safety_officer' }) }))

const { VisitorDrawer } = await import('./VisitorDrawer')

afterEach(cleanup)

describe('VisitorDrawer', () => {
  it('opens as a modal dialog that Escape closes', () => {
    const onClose = vi.fn()
    render(<VisitorDrawer visitorId="v1" onClose={onClose} onChanged={() => {}} />)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape while closed', () => {
    const onClose = vi.fn()
    render(<VisitorDrawer visitorId={null} onClose={onClose} onChanged={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
