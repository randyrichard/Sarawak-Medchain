// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/*
 * What a list says when its search or filters hide everything in it.
 *
 * Somebody who has forgotten yesterday's filter, or the site picked in the header, reads
 * "No audits - plan one to get started" as their records having gone. So it says what is
 * narrowing the list, quotes the search back, mentions the one site being shown, and puts
 * the way back under the message.
 */
const switchSite = vi.fn()
const org = {
  site: null as { id: string; name: string } | null,
  sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }, { id: 'btu', name: 'Bintulu LNG Terminal' }],
  switchSite,
}
vi.mock('./OrgContext', () => ({ useOrg: () => org }))

const { NoMatches } = await import('./NoMatches')

afterEach(() => { cleanup(); switchSite.mockReset(); org.site = null })

const body = () => document.body.textContent ?? ''

describe('an empty list that is only empty because of how it is narrowed', () => {
  it('quotes the search back and clears it and the filters in one press', () => {
    const onClear = vi.fn()
    render(<NoMatches what="corrective actions" search=" pump " onClear={onClear} />)
    expect(screen.getByText('No corrective actions match “pump”')).toBeTruthy()
    expect(body()).toContain('Check the spelling, or clear the search and filters to see all corrective actions.')
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('names the filters when there is no search', () => {
    render(<NoMatches what="audits" onClear={() => {}} />)
    expect(screen.getByText('No audits match these filters')).toBeTruthy()
    expect(body()).toContain('Clear the filters to see all audits.')
  })

  it('offers to clear the search alone when nothing else narrows the list', () => {
    render(<NoMatches what="visitors" search="Lim" filtered={false} onClear={() => {}} />)
    expect(screen.getByRole('button', { name: 'Clear Search' })).toBeTruthy()
    expect(body()).toContain('Check the spelling, or clear the search to see all visitors.')
  })

  it('says when only one site is being shown, and shows them all on request', () => {
    org.site = org.sites[0]
    render(<NoMatches what="permits" search="crane" onClear={() => {}} />)
    expect(body()).toContain('Only Kuching Assembly Plant is being shown; the site picker at the top of the page changes that.')
    fireEvent.click(screen.getByRole('button', { name: 'Show All Sites' }))
    expect(switchSite).toHaveBeenCalledWith(null)
  })

  it('names the site in the title when the site is all that narrows it', () => {
    org.site = org.sites[1]
    render(<NoMatches what="inspections" />)
    expect(screen.getByText('No inspections at Bintulu LNG Terminal')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull()
  })

  it('offers no way back that does not exist', () => {
    render(<NoMatches what="assets" filtered={false} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
