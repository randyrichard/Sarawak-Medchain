// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { Tabs, TabPanel, type TabItem } from './Tabs'
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from './Dropdown'
import { Dialog } from './Dialog'
import { DataTable, type Column } from './Table'
import { Input, PasswordInput, Select, Textarea } from './Field'
import { AsyncContent, ErrorState, Loading } from './AsyncContent'
import { Button } from './Button'
import { Switch } from './Switch'
import { EmptyState } from './EmptyState'

/*
 * Behaviour tests for the interactive primitives, in a real DOM.
 *
 * These are the contracts every page inherits - keyboard operation, focus, and what
 * assistive technology is told - so they are tested here once rather than trusted to each
 * of the hundred screens that use them. Each test names what a person would lose if it
 * failed.
 */

afterEach(cleanup)

// ─── Tabs ────────────────────────────────────────────────────────────────────

type View = 'a' | 'b' | 'c' | 'd'
const TAB_ITEMS: TabItem<View>[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie', disabled: true },
  { value: 'd', label: 'Delta' },
]

function TabsHarness({ initial = 'a' as View }) {
  const [v, setV] = useState<View>(initial)
  return (
    <>
      <Tabs id="t" label="Views" items={TAB_ITEMS} value={v} onChange={setV} />
      {TAB_ITEMS.map((i) => (
        <TabPanel key={i.value} tabsId="t" value={i.value} selected={v}>Panel {i.label}</TabPanel>
      ))}
    </>
  )
}

describe('Tabs', () => {
  it('is one tab stop: only the selected tab is in the Tab order', () => {
    render(<TabsHarness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
  })

  it('moves and selects with the arrow keys, skipping disabled tabs and wrapping', () => {
    render(<TabsHarness />)
    const list = screen.getByRole('tablist')
    screen.getByRole('tab', { name: 'Alpha' }).focus()

    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Bravo' })).toHaveProperty('ariaSelected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Bravo' }))

    fireEvent.keyDown(list, { key: 'ArrowRight' }) // Charlie is disabled
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Delta' }))

    fireEvent.keyDown(list, { key: 'ArrowRight' }) // wraps
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Alpha' }))

    fireEvent.keyDown(list, { key: 'ArrowLeft' }) // wraps backwards
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Delta' }))
  })

  it('jumps to the ends with Home and End', () => {
    render(<TabsHarness initial="b" />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'End' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Delta' }))
    fireEvent.keyDown(list, { key: 'Home' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Alpha' }))
  })

  it('ties each tab to a labelled panel', () => {
    render(<TabsHarness />)
    const tab = screen.getByRole('tab', { name: 'Alpha' })
    const panel = screen.getByRole('tabpanel', { name: 'Alpha' })
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.textContent).toBe('Panel Alpha')
    // Only the selected panel is mounted.
    expect(screen.queryByText('Panel Bravo')).toBeNull()
  })

  it('leaves aria-controls off when there are no panels to point at', () => {
    render(<Tabs items={TAB_ITEMS} value="a" onChange={() => {}} />)
    for (const tab of screen.getAllByRole('tab')) expect(tab.hasAttribute('aria-controls')).toBe(false)
  })

  it('keeps the row reachable when the value matches no tab', () => {
    render(<Tabs items={TAB_ITEMS} value={'zzz' as View} onChange={() => {}} />)
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
  })
})

// ─── Dropdown ────────────────────────────────────────────────────────────────

function Menu({ onSelect = () => {} }: { onSelect?: (v: string) => void }) {
  return (
    <Dropdown trigger={() => <button type="button">Actions</button>}>
      <DropdownLabel>Record</DropdownLabel>
      <DropdownItem onSelect={() => onSelect('edit')}>Edit</DropdownItem>
      <DropdownItem onSelect={() => onSelect('duplicate')}>Duplicate</DropdownItem>
      <DropdownSeparator />
      <DropdownItem onSelect={() => onSelect('archive')}>Archive</DropdownItem>
    </Dropdown>
  )
}

describe('Dropdown', () => {
  it('states that the trigger opens a menu, and whether it is open', () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('moves focus into the menu as it opens, so the arrow keys work at once', () => {
    render(<Menu />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }))
  })

  it('opens from the keyboard with ArrowDown (first item) and ArrowUp (last item)', () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Archive' }))
  })

  it('walks the items with the arrow keys, Home, End and type-ahead', () => {
    render(<Menu />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Duplicate')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    fireEvent.keyDown(menu, { key: 'ArrowDown' }) // wraps past the end
    expect(document.activeElement?.textContent).toBe('Edit')
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement?.textContent).toBe('Archive')
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement?.textContent).toBe('Edit')
    fireEvent.keyDown(menu, { key: 'a' })
    expect(document.activeElement?.textContent).toBe('Archive')
  })

  it('closes on Esc and puts focus back on the trigger', () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('runs the chosen item, closes, and returns focus to the trigger', () => {
    const onSelect = vi.fn()
    render(<Menu onSelect={onSelect} />)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(onSelect).toHaveBeenCalledWith('duplicate')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps menu items out of the Tab order, and never submits a surrounding form', () => {
    render(<Menu />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.tabIndex).toBe(-1)
      expect(item.getAttribute('type')).toBe('button')
    }
  })
})

// ─── Dialog ──────────────────────────────────────────────────────────────────

function DialogHarness({ withField = true, autofocus = false }: { withField?: boolean; autofocus?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Close incident"
        description="This cannot be undone."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button data-autofocus={autofocus || undefined}>Confirm</Button></>}
      >
        {withField ? <Input label="Reason" /> : <p>Closing records the time and your name.</p>}
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('is named by its heading and described by its subtitle', () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Close incident' })
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy && document.getElementById(describedBy)?.textContent).toBe('This cannot be undone.')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('opens a form ready to type into, not on the close button', () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Reason'))
  })

  it('opens a confirmation on the dialog itself, so nothing is one Enter from happening', () => {
    render(<DialogHarness withField={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('honours data-autofocus', () => {
    render(<DialogHarness withField={false} autofocus />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }))
  })

  it('keeps Tab inside, entering at the start from the panel and wrapping at the end', () => {
    render(<DialogHarness withField={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }))
    screen.getByRole('button', { name: 'Confirm' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirm' }))
  })

  it('closes on Esc, returns focus to what opened it, and unlocks the page scroll', () => {
    render(<DialogHarness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps focus in a field while typing re-renders the parent', () => {
    // The regression this component's focus effect was rewritten for: every keystroke
    // used to drag focus back to the first button.
    function Typing() {
      const [v, setV] = useState('')
      return (
        <Dialog open onClose={() => {}} title="New">
          <Input label="Name" value={v} onChange={(e) => setV(e.target.value)} />
        </Dialog>
      )
    }
    render(<Typing />)
    const input = screen.getByLabelText('Name')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(document.activeElement).toBe(input)
  })
})

// ─── DataTable ───────────────────────────────────────────────────────────────

interface Row { id: string; name: string; score: number }
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'score', header: 'Score', render: (r) => r.score, align: 'right' },
]
const ROWS: Row[] = [{ id: '1', name: 'Aisha', score: 9 }, { id: '2', name: 'Ben', score: 7 }]

describe('DataTable', () => {
  it('keeps clickable rows as rows, operable from the keyboard', () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onRowClick={onRowClick} rowLabel={(r) => `Open ${r.name}`} />)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2: no row was turned into a button
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    const aisha = screen.getByRole('row', { name: 'Open Aisha' })
    expect(aisha.tabIndex).toBe(0)
    fireEvent.keyDown(aisha, { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0])
  })

  it('does not hijack Enter from a control inside a row', () => {
    const onRowClick = vi.fn()
    const cols: Column<Row>[] = [...COLUMNS, { key: 'x', header: 'Actions', render: () => <button type="button">Edit</button> }]
    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} onRowClick={onRowClick} />)
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Edit' })[0], { key: 'Enter' })
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('shows placeholder rows under the real header while loading, and says so', () => {
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} loading loadingRows={3} />)
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Score'])
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    // The empty message must not flash while the first page is still coming.
    expect(screen.queryByText('No records.')).toBeNull()
  })

  it('reports a failure with a retry instead of an empty table', () => {
    const onRetry = vi.fn()
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} error={new Error('Network down')} onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Network down')
    expect(screen.queryByText('No records.')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows the empty state when there is nothing to show', () => {
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty={<EmptyState title="No people yet" />} />)
    expect(screen.getByText('No people yet')).toBeTruthy()
  })

  it('names itself with a caption, as a scrollable region a keyboard can reach', () => {
    render(<DataTable caption="Employees" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)
    expect(screen.getByRole('table', { name: 'Employees' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Employees' }).tabIndex).toBe(0)
  })
})

// ─── Fields ──────────────────────────────────────────────────────────────────

describe('Fields', () => {
  it('reads the hint with the control', () => {
    render(<Input label="Badge number" hint="Six digits, on the back of the card" />)
    const input = screen.getByLabelText('Badge number')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent)
      .toBe('Six digits, on the back of the card')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('marks an error invalid and reads it with the control', () => {
    for (const [Comp, name] of [[Input, 'A'], [Textarea, 'B'], [PasswordInput, 'C']] as const) {
      render(<Comp label={name} error="Required" />)
      const el = screen.getByLabelText(name)
      expect(el.getAttribute('aria-invalid')).toBe('true')
      expect(document.getElementById(el.getAttribute('aria-describedby')!)?.textContent).toBe('Required')
    }
    render(<Select label="D" error="Pick one"><option>x</option></Select>)
    expect(screen.getByLabelText('D').getAttribute('aria-invalid')).toBe('true')
  })

  it("keeps a caller's own aria-describedby", () => {
    render(<><p id="policy">Policy text</p><Input label="Code" hint="From your app" aria-describedby="policy" /></>)
    const ids = screen.getByLabelText('Code').getAttribute('aria-describedby')!.split(' ')
    expect(ids[0]).toBe('policy')
    expect(ids).toHaveLength(2)
  })

  it('does not read the required star as text', () => {
    render(<Input label="Site" required />)
    // The accessible name is "Site", not "Site*" - the star is visual only.
    expect(screen.getByRole('textbox', { name: 'Site' })).toBeTruthy()
  })
})

// ─── Async states ────────────────────────────────────────────────────────────

const base = { reload: () => {}, refreshing: false, error: undefined }

describe('AsyncContent', () => {
  it('announces loading politely and shows the placeholder', () => {
    render(<AsyncContent state={{ ...base, status: 'loading', data: undefined }} loadingLabel="Loading people…">{() => 'x'}</AsyncContent>)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Loading people…')
    expect(status.getAttribute('aria-busy')).toBe('true')
  })

  it('treats idle (inputs not ready yet) as loading, not as empty', () => {
    render(<AsyncContent state={{ ...base, status: 'idle', data: undefined }} empty="Nothing" isEmpty={() => true}>{() => 'x'}</AsyncContent>)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Nothing')).toBeNull()
  })

  it('offers a retry when the first load fails', () => {
    const reload = vi.fn()
    render(<AsyncContent state={{ ...base, reload, status: 'error', data: undefined, error: new Error('Timed out') }} errorTitle="Couldn't load people">{() => 'x'}</AsyncContent>)
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load people")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('shows the empty state for empty data and the content otherwise', () => {
    const { rerender } = render(
      <AsyncContent state={{ ...base, status: 'success', data: [] as string[] }} isEmpty={(d) => d.length === 0} empty="No rows">{(d) => d.join(',')}</AsyncContent>,
    )
    expect(screen.getByText('No rows')).toBeTruthy()
    rerender(<AsyncContent state={{ ...base, status: 'success', data: ['a', 'b'] }} isEmpty={(d) => d.length === 0} empty="No rows">{(d) => d.join(',')}</AsyncContent>)
    expect(screen.getByText('a,b')).toBeTruthy()
  })

  it('keeps data on screen when a reload fails, with the error above it', () => {
    render(<AsyncContent state={{ ...base, status: 'error', data: ['kept'], error: new Error('Blip') }}>{(d) => d.join(',')}</AsyncContent>)
    expect(screen.getByText('kept')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Blip')
  })
})

// ─── Automated accessibility audit ───────────────────────────────────────────

describe('axe audit', () => {
  it('finds no violations across the component set', async () => {
    function Gallery() {
      const [on, setOn] = useState(true)
      const [tab, setTab] = useState<View>('a')
      return (
        <main>
          <h1>Gallery</h1>
          <Tabs id="g" label="Views" items={TAB_ITEMS} value={tab} onChange={setTab} />
          <TabPanel tabsId="g" value="a" selected={tab}>
            <Input label="Name" hint="Full name" required />
            <Input label="Email" error="Enter a valid email" />
            <PasswordInput label="Password" />
            <Textarea label="Notes" />
            <Select label="Site"><option>Kuching</option></Select>
            <Switch checked={on} onChange={setOn} label="Notify me" />
            <Button loading>Saving</Button>
            <Menu />
            <DataTable caption="People" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
            <DataTable caption="Clickable" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onRowClick={() => {}} rowLabel={(r) => `Open ${r.name}`} />
            <DataTable caption="Loading" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} loading />
            <DataTable caption="Failed" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} error={new Error('x')} onRetry={() => {}} />
            <Loading label="Loading reports…" />
            <ErrorState error={new Error('Server unavailable')} onRetry={() => {}} />
            <EmptyState title="No reports yet">Reports appear here.</EmptyState>
          </TabPanel>
        </main>
      )
    }
    const { container } = render(<Gallery />)
    // Open the menu too, so its markup is audited.
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const result = await axe.run(container, {
      // jsdom does no layout, so contrast cannot be computed here.
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })

  it('finds no violations in an open dialog', async () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })
})
