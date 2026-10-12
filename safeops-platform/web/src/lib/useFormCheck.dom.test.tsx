// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button, Dialog, Input } from '@/components/ui'
import { focusFirstInvalid, useFormCheck } from './useFormCheck'

/*
 * A Save button that stays grey until the form is right says nothing about what is wrong.
 * These forms can always be sent; sending one that is not ready says what each field needs
 * and goes to the first of them.
 */

function Form({ onSave }: { onSave: () => void }) {
  const [site, setSite] = useState('')
  const [title, setTitle] = useState('')
  const check = useFormCheck({
    site: !site.trim() && 'Choose the site.',
    title: !title.trim() && 'Describe the work.',
  })
  return (
    <>
      <Input label="Site" value={site} onChange={(e) => setSite(e.target.value)} error={check.errorFor('site')} />
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={check.errorFor('title')} />
      <Button onClick={() => { if (check.check()) onSave() }}>Save</Button>
    </>
  )
}

afterEach(cleanup)

describe('a form checked when it is sent', () => {
  it('says nothing before the first press', () => {
    render(<Form onSave={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says what each field needs and goes to the first, instead of sending', () => {
    const onSave = vi.fn()
    render(<Form onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Choose the site.', 'Describe the work.'])
    expect(document.activeElement).toBe(screen.getByLabelText('Site'))
  })

  it('follows the fields as they are put right, and then sends', () => {
    const onSave = vi.fn()
    render(<Form onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'Kuching' } })
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Describe the work.'])

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hot work on the jetty' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('starts each opening of a dialog afresh', () => {
    function Reopening() {
      const [open, setOpen] = useState(true)
      const check = useFormCheck({ name: 'Enter a name.' }, open)
      return (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)}>Toggle</button>
          <button type="button" onClick={() => check.check()}>Send</button>
          <p data-testid="said">{check.errorFor('name') ?? ''}</p>
        </>
      )
    }
    render(<Reopening />)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByTestId('said').textContent).toBe('Enter a name.')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(screen.getByTestId('said').textContent).toBe('')
  })
})

describe('focusFirstInvalid', () => {
  it('looks in the dialog on top, never at the page behind it', () => {
    render(
      <>
        <Input label="Behind" error="Wrong too" />
        <Dialog open onClose={() => {}} title="Front">
          <Input label="In front" error="Wrong" />
        </Dialog>
      </>,
    )
    expect(focusFirstInvalid()).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText('In front'))
  })

  it('reports when there is nothing to go to', () => {
    render(<Input label="Fine" />)
    expect(focusFirstInvalid()).toBe(false)
  })
})
