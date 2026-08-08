import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SORT, EMPTY_FILTERS, activeFilterCount, applyChange, highSeverityCount,
  parseFilters, toQuery, toSearchParams,
} from './boardFilters'

/**
 * The incident board's filter state.
 *
 * These cover the places the board actually goes wrong, none of which are visible in a
 * screenshot: a filter change that forgets to reset the page shows an empty board and
 * reads as "no incidents"; defaults written into the URL make every shared link noisy and
 * the clear-filters count wrong; a tri-state flattened to a boolean turns "either" into
 * "no"; a hand-edited URL puts the server into a state the UI cannot show.
 */
describe('parseFilters', () => {
  it('reads an empty query as no filters at all', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS)
  })

  it('reads every filter the board offers', () => {
    const p = new URLSearchParams(
      'q=leak&type=injury&severity=fatality&stage=investigation&siteId=btu'
      + '&department=Maintenance&investigator=Marcus&from=2026-01-01&to=2026-01-31'
      + '&shift=Night&anonymous=true&emergencyResponse=false&sort=newest&page=3',
    )
    const f = parseFilters(p)
    expect(f).toMatchObject({
      q: 'leak', type: 'injury', severity: 'fatality', stage: 'investigation',
      siteId: 'btu', department: 'Maintenance', investigator: 'Marcus',
      from: '2026-01-01', to: '2026-01-31', shift: 'Night',
      anonymous: 'true', emergencyResponse: 'false', sort: 'newest', page: 3,
    })
  })

  it('falls back to the default sort rather than passing an unknown one through', () => {
    // A hand-edited or stale link should show a board, not an error.
    expect(parseFilters(new URLSearchParams('sort=; DROP TABLE')).sort).toBe(DEFAULT_SORT)
    expect(parseFilters(new URLSearchParams('sort=nonsense')).sort).toBe(DEFAULT_SORT)
  })

  it('never asks the server for a page below one', () => {
    // Page 0 would ask for a negative offset.
    for (const q of ['page=0', 'page=-4', 'page=abc', 'page=']) {
      expect(parseFilters(new URLSearchParams(q)).page, q).toBe(1)
    }
  })

  it('floors a fractional page rather than sending it on', () => {
    expect(parseFilters(new URLSearchParams('page=2.7')).page).toBe(2)
  })

  it('keeps the anonymous filter as three states', () => {
    expect(parseFilters(new URLSearchParams('anonymous=true')).anonymous).toBe('true')
    expect(parseFilters(new URLSearchParams('anonymous=false')).anonymous).toBe('false')
    // Absent means either, which is not the same as false.
    expect(parseFilters(new URLSearchParams()).anonymous).toBe('')
  })
})

describe('toSearchParams', () => {
  it('writes nothing for an unfiltered board', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('')
  })

  it('omits the default sort and the first page', () => {
    const f = { ...EMPTY_FILTERS, sort: DEFAULT_SORT, page: 1, severity: 'fatality' } as const
    expect(toSearchParams(f).toString()).toBe('severity=fatality')
  })

  it('writes a non-default sort and page', () => {
    const p = toSearchParams({ ...EMPTY_FILTERS, sort: 'newest', page: 4 })
    expect(p.get('sort')).toBe('newest')
    expect(p.get('page')).toBe('4')
  })

  it('round-trips every filter without losing one', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: 'loading bay', type: 'chemical_spill', severity: 'environmental_major',
      stage: 'rca', siteId: 'kch', department: 'Ops', investigator: 'Siti',
      from: '2026-02-01', to: '2026-02-28', shift: 'Night',
      anonymous: 'true', emergencyResponse: 'true', sort: 'updated' as const, page: 2,
    }
    expect(parseFilters(toSearchParams(f))).toEqual(f)
  })

  it('survives a value containing spaces and punctuation', () => {
    const f = { ...EMPTY_FILTERS, q: 'jetty 2, arm #3 & valve' }
    expect(parseFilters(toSearchParams(f)).q).toBe('jetty 2, arm #3 & valve')
  })
})

describe('applyChange', () => {
  it('resets to the first page when a filter changes', () => {
    // Staying on page 4 of a one-page result set shows an empty board, which reads as
    // "there are no incidents" - the worst wrong answer this screen can give.
    const on4 = { ...EMPTY_FILTERS, page: 4 }
    expect(applyChange(on4, { severity: 'fatality' }).page).toBe(1)
  })

  it('does not reset the page when only the page changes', () => {
    expect(applyChange({ ...EMPTY_FILTERS, page: 2 }, { page: 3 }).page).toBe(3)
  })

  it('does not reset the page when only the sort changes', () => {
    // Re-sorting is a different way of looking at the same result set.
    const on3 = { ...EMPTY_FILTERS, page: 3 }
    expect(applyChange(on3, { sort: 'newest' }).page).toBe(3)
  })

  it('does not reset the page when a filter is set to what it already was', () => {
    const on3 = { ...EMPTY_FILTERS, severity: 'fatality', page: 3 }
    expect(applyChange(on3, { severity: 'fatality' }).page).toBe(3)
  })

  it('clears every filter but keeps the shape', () => {
    const busy = { ...EMPTY_FILTERS, severity: 'fatality', q: 'leak', page: 5 }
    expect(applyChange(busy, EMPTY_FILTERS)).toEqual(EMPTY_FILTERS)
  })

  it('combines filters rather than replacing them', () => {
    const one = applyChange(EMPTY_FILTERS, { severity: 'fatality' })
    const two = applyChange(one, { department: 'Maintenance' })
    expect(two.severity).toBe('fatality')
    expect(two.department).toBe('Maintenance')
  })
})

describe('activeFilterCount', () => {
  it('counts nothing on a clean board', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
  })

  it('does not count sort or page as filters', () => {
    // Otherwise the board offers to "clear 2 filters" on an unfiltered view.
    expect(activeFilterCount({ ...EMPTY_FILTERS, sort: 'newest', page: 6 })).toBe(0)
  })

  it('counts each narrowing filter once', () => {
    expect(activeFilterCount({
      ...EMPTY_FILTERS, severity: 'fatality', department: 'Ops', anonymous: 'true',
    })).toBe(3)
  })

  it('counts a false tri-state as an active filter', () => {
    // "Named only" is a choice, and the board has to offer to clear it.
    expect(activeFilterCount({ ...EMPTY_FILTERS, anonymous: 'false' })).toBe(1)
  })
})

describe('toQuery', () => {
  it('sends undefined rather than empty strings', () => {
    const q = toQuery(EMPTY_FILTERS, 25)
    // An empty string would be sent as `severity=` and read by the server as a filter.
    expect(q.severity).toBeUndefined()
    expect(q.q).toBeUndefined()
    expect(q.anonymous).toBeUndefined()
  })

  it('carries the page size and the chosen page', () => {
    const q = toQuery({ ...EMPTY_FILTERS, page: 3 }, 25)
    expect(q).toMatchObject({ page: 3, pageSize: 25, sort: DEFAULT_SORT })
  })

  it('passes the tri-states through as the strings the API expects', () => {
    const q = toQuery({ ...EMPTY_FILTERS, anonymous: 'true', emergencyResponse: 'false' }, 25)
    expect(q.anonymous).toBe('true')
    expect(q.emergencyResponse).toBe('false')
  })

  it('never sends a company id from the filters', () => {
    // Tenancy comes from the session, never from anything the URL can carry.
    expect(Object.keys(toQuery(EMPTY_FILTERS, 25))).not.toContain('companyId')
  })
})

describe('highSeverityCount', () => {
  it('counts lost time and above, across the old and new scales', () => {
    expect(highSeverityCount([
      { name: 'fatality', value: 1 },
      { name: 'Critical', value: 2 },
      { name: 'lost_time_injury', value: 3 },
      { name: 'Minor', value: 40 },
      { name: 'near_miss', value: 12 },
    ])).toBe(6)
  })

  it('is zero on an empty board rather than NaN', () => {
    expect(highSeverityCount([])).toBe(0)
  })

  it('ignores a severity it has never heard of', () => {
    expect(highSeverityCount([{ name: 'invented', value: 9 }])).toBe(0)
  })
})
