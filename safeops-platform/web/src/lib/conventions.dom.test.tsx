// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useUrlState } from './useUrlState'
import { isApplePlatform, isTypingTarget, modKey } from './shortcuts'
import { useUnsavedChangesWarning, UNSAVED_MESSAGE } from './useUnsavedChangesWarning'
import { DataTable, sortRows, type Column } from '@/components/ui/Table'
import { KeyboardShortcuts } from '@/components/layout/KeyboardShortcuts'

/*
 * Jakob's law: people spend most of their time on other products, so SafeChain should work the
 * way those do. Each test names a convention people already rely on elsewhere, and what they
 * would lose here if it broke.
 */

afterEach(cleanup)

function Where() {
  const l = useLocation()
  return <output data-testid="url">{l.pathname + l.search}</output>
}

// ─── View state in the URL ───────────────────────────────────────────────────

const TABS = ['overview', 'actions', 'people'] as const
type Tab = (typeof TABS)[number]

function TabHarness() {
  const [tab, setTab] = useUrlState<Tab>('tab', 'overview', TABS)
  const [q, setQ] = useUrlState<string>('q', '')
  return (
    <>
      <p data-testid="tab">{tab}</p>
      <button onClick={() => setTab('actions')}>Actions</button>
      <button onClick={() => setTab('overview')}>Overview</button>
      <input aria-label="q" value={q} onChange={(e) => setQ(e.target.value, { replace: true })} />
      <Where />
    </>
  )
}

const renderAt = (url: string, ui = <TabHarness />) =>
  render(<MemoryRouter initialEntries={[url]}><Routes><Route path="*" element={ui} /></Routes></MemoryRouter>)

describe('view state lives in the URL, like every other site', () => {
  it('opens on the tab a shared link names', () => {
    renderAt('/incidents/1?tab=actions')
    expect(screen.getByTestId('tab').textContent).toBe('actions')
  })

  it('writes the tab to the URL, keeping the other parameters', () => {
    renderAt('/incidents/1?site=btu')
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByTestId('url').textContent).toBe('/incidents/1?site=btu&tab=actions')
  })

  it('keeps the default out of the URL, so the plain address stays plain', () => {
    renderAt('/incidents/1?tab=actions')
    fireEvent.click(screen.getByText('Overview'))
    expect(screen.getByTestId('url').textContent).toBe('/incidents/1')
  })

  it('falls back to the default for a stale or hand-edited value', () => {
    renderAt('/incidents/1?tab=nonsense')
    expect(screen.getByTestId('tab').textContent).toBe('overview')
  })

  it('makes each tab a history entry, so Back returns to the previous tab', () => {
    // Asserted through the router: a push adds an entry, so navigating back (-1) restores it.
    function WithBack() {
      return <><TabHarness /><BackButton /></>
    }
    renderAt('/x', <WithBack />)
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByTestId('tab').textContent).toBe('actions')
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByTestId('tab').textContent).toBe('overview')
  })
})

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Back</button>
}

// ─── Tables: sort by header, rows are links ──────────────────────────────────

interface Row { id: string; ref: string; days: number | null; name: string }
const ROWS: Row[] = [
  { id: 'a', ref: 'INC-10', days: 3, name: 'Bravo' },
  { id: 'b', ref: 'INC-9', days: null, name: 'alpha' },
  { id: 'c', ref: 'INC-11', days: 12, name: 'Charlie' },
]
const COLUMNS: Column<Row>[] = [
  { key: 'ref', header: 'Ref', render: (r) => r.ref, sortValue: (r) => r.ref },
  { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
  { key: 'days', header: 'Days', render: (r) => r.days ?? '—', sortValue: (r) => r.days, align: 'right' },
]
const firstCells = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')!.textContent)

describe('tables sort by their column headers, like a spreadsheet', () => {
  it('sorts ascending on the first click and descending on the second, announcing it', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)
    const header = screen.getByRole('columnheader', { name: /Ref/ })
    expect(header.getAttribute('aria-sort')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: /Ref/ }))
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    // Numeric-aware: INC-9 before INC-10, as a person reads them.
    expect(firstCells()).toEqual(['INC-9', 'INC-10', 'INC-11'])
    fireEvent.click(screen.getByRole('button', { name: /Ref/ }))
    expect(header.getAttribute('aria-sort')).toBe('descending')
    expect(firstCells()).toEqual(['INC-11', 'INC-10', 'INC-9'])
  })

  it('ignores case, and puts empty values last in either direction', () => {
    expect(sortRows(ROWS, COLUMNS, { key: 'name', direction: 'asc' }).map((r) => r.name)).toEqual(['alpha', 'Bravo', 'Charlie'])
    expect(sortRows(ROWS, COLUMNS, { key: 'days', direction: 'asc' }).map((r) => r.days)).toEqual([3, 12, null])
    expect(sortRows(ROWS, COLUMNS, { key: 'days', direction: 'desc' }).map((r) => r.days)).toEqual([12, 3, null])
  })

  it('leaves columns without a sort value as plain headers', () => {
    render(<DataTable columns={[{ key: 'x', header: 'Plain', render: () => 'x' }]} rows={[ROWS[0]]} rowKey={(r) => r.id} />)
    expect(screen.queryByRole('button', { name: 'Plain' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Plain' }).hasAttribute('aria-sort')).toBe(false)
  })
})

describe('rows that open a record are real links', () => {
  const table = (
    <>
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} rowHref={(r) => `/incidents/${r.id}`} rowLabel={(r) => `Open ${r.ref}`} />
      <Where />
    </>
  )

  it('puts a real link in the row, so hover, right-click and new-tab all work', () => {
    renderAt('/incidents', table)
    const link = screen.getByRole('link', { name: 'Open INC-10' })
    expect(link.getAttribute('href')).toBe('/incidents/a')
  })

  it('follows the link when the row is clicked anywhere', () => {
    renderAt('/incidents', table)
    fireEvent.click(screen.getAllByRole('row')[1].querySelectorAll('td')[2])
    expect(screen.getByTestId('url').textContent).toBe('/incidents/a')
  })

  it('opens a new tab on Ctrl/Cmd-click or middle-click, and stays on the list', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderAt('/incidents', table)
    const cell = screen.getAllByRole('row')[1].querySelectorAll('td')[1]
    fireEvent.click(cell, { ctrlKey: true })
    fireEvent.click(cell, { metaKey: true })
    fireEvent(cell, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(open).toHaveBeenCalledTimes(3)
    expect(open).toHaveBeenCalledWith('/incidents/a', '_blank', 'noopener')
    expect(screen.getByTestId('url').textContent).toBe('/incidents')
    open.mockRestore()
  })

  it('makes the link the tab stop, not the row', () => {
    renderAt('/incidents', table)
    expect(screen.getAllByRole('row')[1].hasAttribute('tabindex')).toBe(false)
  })
})

// ─── Keyboard shortcuts people already know ──────────────────────────────────

describe('keyboard shortcuts follow the usual conventions', () => {
  it('names the modifier the way this platform does', () => {
    expect(modKey('K', true)).toBe('⌘K')
    expect(modKey('K', false)).toBe('Ctrl K')
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true)
    expect(isApplePlatform({ platform: 'Win32', userAgent: '' })).toBe(false)
  })

  it('leaves single keys to whatever the person is typing into', () => {
    const text = document.createElement('input')
    const box = document.createElement('input'); box.type = 'checkbox'
    const area = document.createElement('textarea')
    expect(isTypingTarget(text)).toBe(true)
    expect(isTypingTarget(area)).toBe(true)
    expect(isTypingTarget(box)).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
  })

  it('opens the shortcut list on "?", but not while typing a question mark', () => {
    render(<><KeyboardShortcuts /><input aria-label="notes" /></>)
    fireEvent.keyDown(screen.getByLabelText('notes'), { key: '?' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(document.body, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })
})

// ─── Unsaved changes ─────────────────────────────────────────────────────────

describe('leaving a half-filled form asks first, as Gmail and Docs do', () => {
  function Form({ confirm }: { confirm: (m: string) => boolean }) {
    const [text, setText] = useState('')
    useUnsavedChangesWarning(text !== '', confirm)
    return (
      <>
        <input aria-label="what" value={text} onChange={(e) => setText(e.target.value)} />
        <Link to="/elsewhere">Elsewhere</Link>
        <Where />
      </>
    )
  }

  it('lets a clean form go without asking', () => {
    const confirm = vi.fn(() => false)
    renderAt('/near-miss', <Form confirm={confirm} />)
    fireEvent.click(screen.getByText('Elsewhere'))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('url').textContent).toBe('/elsewhere')
  })

  it('asks before an in-app link discards typed input, and stays if told to', () => {
    const confirm = vi.fn(() => false)
    renderAt('/near-miss', <Form confirm={confirm} />)
    fireEvent.change(screen.getByLabelText('what'), { target: { value: 'Loose grating' } })
    fireEvent.click(screen.getByText('Elsewhere'))
    expect(confirm).toHaveBeenCalledWith(UNSAVED_MESSAGE)
    expect(screen.getByTestId('url').textContent).toBe('/near-miss')
  })

  it('leaves when the person confirms', () => {
    renderAt('/near-miss', <Form confirm={() => true} />)
    fireEvent.change(screen.getByLabelText('what'), { target: { value: 'Loose grating' } })
    fireEvent.click(screen.getByText('Elsewhere'))
    expect(screen.getByTestId('url').textContent).toBe('/elsewhere')
  })

  it('arms the browser prompt for closing or reloading the tab', () => {
    renderAt('/near-miss', <Form confirm={() => true} />)
    fireEvent.change(screen.getByLabelText('what'), { target: { value: 'x' } })
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})
