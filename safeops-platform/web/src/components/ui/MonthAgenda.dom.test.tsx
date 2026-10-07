// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MonthAgenda } from './MonthAgenda'

afterEach(cleanup)

const day = (d: number) => ({ key: `2026-10-${String(d).padStart(2, '0')}`, date: new Date(2026, 9, d) })

describe('MonthAgenda', () => {
  it('lists only days with entries, each with its code, title and status in words', () => {
    const open = vi.fn()
    render(<MonthAgenda todayKey="2026-10-06" empty="Nothing" days={[
      { ...day(5), entries: [] },
      { ...day(6), entries: [{ id: 'a', code: 'CA-1', title: 'Fix guard', status: 'Overdue', color: 'red', onSelect: open }] },
      { ...day(7), entries: [{ id: 'b', code: 'INS-2', title: 'Ladder', status: 'Scheduled', color: 'blue' }] },
    ]} />)
    expect(screen.queryByText(/5 Oct/)).toBeNull()
    expect(screen.getByText(/Today/)).toBeTruthy()
    // Status is text, not only the colour of the border.
    expect(screen.getByText('Overdue')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /CA-1/ }))
    expect(open).toHaveBeenCalledOnce()
    // An entry that cannot be acted on from here is not dressed up as a button.
    expect(screen.queryByRole('button', { name: /INS-2/ })).toBeNull()
    expect(screen.getByText('Ladder')).toBeTruthy()
  })

  it('says so when the month is empty', () => {
    render(<MonthAgenda todayKey="2026-10-06" empty="Nothing due this month." days={[{ ...day(1), entries: [] }]} />)
    expect(screen.getByText('Nothing due this month.')).toBeTruthy()
  })
})
