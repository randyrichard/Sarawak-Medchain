// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { useOpenRecord, type OpenRecord } from './useOpenRecord'

/*
 * Open a record, press Back: the drawer closes and the list is still there.
 *
 * Drawers were component state, so Back skipped straight past them to the page before the
 * list - Home, usually - and took the list with it.
 */

let record: OpenRecord
let back: () => void

function Page({ aliases = [] }: { aliases?: string[] }) {
  record = useOpenRecord('open', ...aliases)
  const navigate = useNavigate()
  back = () => navigate(-1)
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const where = () => screen.getByTestId('where').textContent
const step = (fn: () => void) => act(() => fn())

function start(entries: string[], aliases?: string[]) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Page aliases={aliases} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('a record opened from a list', () => {
  it('is closed by Back, which leaves you on the list', () => {
    start(['/', '/assets'])
    step(() => record.open('a1'))
    expect(where()).toBe('/assets?open=a1')
    expect(record.id).toBe('a1')

    step(back)
    expect(where()).toBe('/assets')
    expect(record.id).toBeNull()
  })

  it('is closed by Close without leaving an entry behind for Back to reopen', () => {
    start(['/', '/assets'])
    step(() => record.open('a1'))
    step(() => record.close())
    expect(where()).toBe('/assets')

    // One more Back goes to where the person was before the list, not back into the record.
    step(back)
    expect(where()).toBe('/')
  })

  it('keeps the filters the list had', () => {
    start(['/assets?status=out_of_service&q=crane'])
    step(() => record.open('a1'))
    expect(where()).toBe('/assets?status=out_of_service&q=crane&open=a1')
    step(() => record.close())
    expect(where()).toBe('/assets?status=out_of_service&q=crane')
  })

  it('swaps in place when another record is opened from inside it, so one Close returns to the list', () => {
    start(['/', '/assets'])
    step(() => record.open('a1'))
    step(() => record.open('a2'))
    expect(where()).toBe('/assets?open=a2')

    step(() => record.close())
    expect(where()).toBe('/assets')
    step(back)
    expect(where()).toBe('/')
  })
})

describe('a record that arrived by link', () => {
  it('closes onto its list, in place', () => {
    start(['/', '/actions?open=ca-1&bucket=overdue'])
    expect(record.id).toBe('ca-1')
    step(() => record.close())
    expect(where()).toBe('/actions?bucket=overdue')
    step(back)
    expect(where()).toBe('/')
  })

  it('is read by its older names too, and closing clears them', () => {
    start(['/assets?qr=a9'], ['qr', 'asset'])
    expect(record.id).toBe('a9')
    step(() => record.close())
    expect(where()).toBe('/assets')
  })

  it('prefers the current name when both are present', () => {
    start(['/permits?open=p2&permit=p1'], ['permit'])
    expect(record.id).toBe('p2')
  })
})
