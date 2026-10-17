// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DashboardFilters, rangeProblem } from './DashboardFilters'
import type { DashboardFilterState } from '../useDashboard'

/*
 * Home's own dates apply when Apply is pressed, not as each one is picked.
 *
 * Each date used to apply on change, so choosing a range reloaded the page after the first
 * date (for a window nobody chose), on a phone again on every turn of the date wheel, and
 * there was no Apply to confirm the choice.
 */

afterEach(cleanup)

const none: DashboardFilterState = { from: null, to: null, department: null }

const filtersBar = (filters = none, onChange = vi.fn()) => {
  const utils = render(
    <DashboardFilters filters={filters} departments={[]} onChange={onChange} onClear={() => {}} filtered={false} />,
  )
  return { ...utils, onChange }
}

describe('the dates on Home', () => {
  it('wait for Apply, then apply together', () => {
    const { onChange } = filtersBar()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Not applied yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('say what is wrong with a backwards range instead of applying it', () => {
    const { onChange } = filtersBar()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('The start date is after the end date.')
    expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBe('true')
  })

  it('still apply a preset at once: it is one choice, not two', () => {
    const { onChange } = filtersBar()
    fireEvent.click(screen.getByRole('button', { name: '30 Days' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(Object.keys(onChange.mock.calls[0][0]).sort()).toEqual(['from', 'to'])
  })

  it('follow a range applied elsewhere (a preset, Clear, a shared link)', () => {
    const { rerender } = filtersBar()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } })
    rerender(
      <DashboardFilters
        filters={{ from: '2026-10-10', to: '2026-10-17', department: null }}
        departments={[]} onChange={vi.fn()} onClear={() => {}} filtered
      />,
    )
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-10-10')
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-10-17')
    expect(screen.queryByText('Not applied yet')).toBeNull()
  })

  it('show the window the figures cover when no dates were chosen, with its preset marked', () => {
    // The server's default is the last 30 days. Instants built from local times, so the
    // dates read the same in any time zone the suite runs in.
    const shown = { from: new Date(2026, 8, 17, 9, 0).toISOString(), to: new Date(2026, 9, 17, 9, 0).toISOString() }
    const onChange = vi.fn()
    render(
      <DashboardFilters filters={none} shown={shown} departments={[]} onChange={onChange} onClear={() => {}} filtered={false} />,
    )
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-09-17')
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-10-17')
    expect(screen.getByRole('button', { name: '30 Days' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Not applied yet')).toBeNull()
    // Apply with nothing changed applies nothing: it would only pin the rolling window.
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('rangeProblem', () => {
  const today = '2026-10-17'
  it('accepts a range, either end open, or none', () => {
    expect(rangeProblem('2026-09-01', '2026-09-30', today)).toBeNull()
    expect(rangeProblem('2026-09-01', '', today)).toBeNull()
    expect(rangeProblem('', '2026-09-30', today)).toBeNull()
    expect(rangeProblem('', '', today)).toBeNull()
    expect(rangeProblem(today, today, today)).toBeNull()
  })
  it('refuses a backwards range or a day that has not happened', () => {
    expect(rangeProblem('2026-09-30', '2026-09-01', today)).toBe('The start date is after the end date.')
    expect(rangeProblem('2026-10-18', '', today)).toBe('The start date is later than today.')
    expect(rangeProblem('', '2026-10-18', today)).toBe('The end date is later than today.')
  })
})
