import { describe, expect, it } from 'vitest'
import { doshProblem, doshStatus, suggestDosh, type DoshRecord } from './doshNotification.js'

const KCH = 'Asia/Kuching'
// 10:00 on 20 October 2026 in Malaysia (UTC+8).
const NOW = new Date('2026-10-20T02:00:00Z')
const at = (iso: string) => new Date(iso)

const record = (over: Partial<DoshRecord> = {}): DoshRecord => ({
  category: null, occurredAt: at('2026-10-15T01:00:00Z'), clockFrom: null, informedAt: null, submittedAt: null,
  ...over,
})

describe('the question DOSH notification asks', () => {
  it('points a death at the immediate notice and JKKP 6', () => {
    const s = suggestDosh({ type: 'injury', severity: 'fatality', injured: [] })
    expect(s).toMatchObject({ category: 'death', flagged: true })
  })

  it('names more than four days off work as notifiable', () => {
    const s = suggestDosh({ type: 'injury', severity: 'lost_time_injury', injured: [{ daysLost: 2 }, { daysLost: 6 }] })
    expect(s.category).toBe('over_four_days')
    expect(s.reason).toMatch(/6 days/)
  })

  it('asks, without answering, about a lost-time injury with no days recorded yet', () => {
    const s = suggestDosh({ type: 'injury', severity: 'lost_time_injury', injured: [{ daysLost: null }] })
    expect(s).toMatchObject({ category: null, flagged: true })
  })

  it('asks about a dangerous occurrence when nobody was hurt', () => {
    // A scaffold collapse or a fire is notifiable for what happened, not for an injury.
    for (const type of ['fire', 'equipment_failure', 'chemical_spill', 'property_damage']) {
      expect(suggestDosh({ type, severity: 'near_miss', injured: [] })).toMatchObject({ flagged: true, category: null })
    }
  })

  it('asks about JKKP 7 for an occupational illness', () => {
    expect(suggestDosh({ type: 'occupational_illness', severity: 'Moderate', injured: [] }).reason).toMatch(/JKKP 7/)
  })

  it('does not raise a minor unsafe condition', () => {
    expect(suggestDosh({ type: 'unsafe_condition', severity: 'Minor', injured: [] }).flagged).toBe(false)
  })
})

describe('where a DOSH notification stands', () => {
  it('shows the JKKP 6 deadline while nobody has decided - the seven days run anyway', () => {
    const s = doshStatus(record(), true, NOW, KCH)
    expect(s).toMatchObject({ state: 'decide', dueDate: '2026-10-22', daysLeft: 2 })
  })

  it('owes nothing when nothing points at it and nobody has decided', () => {
    expect(doshStatus(record(), false, NOW, KCH)).toMatchObject({ state: 'unflagged', dueDate: null })
  })

  it('counts the seven days from the local date of the event', () => {
    // 01:00 on 16 October in Kuching is still 15 October in UTC. Counted in UTC, the
    // deadline would be a day early on the page and a day late in the register.
    const s = doshStatus(record({ category: 'over_four_days', occurredAt: at('2026-10-15T17:00:00Z') }), true, NOW, KCH)
    expect(s.dueDate).toBe('2026-10-23')
  })

  it('keeps the immediate notice outstanding until it is recorded', () => {
    const owed = doshStatus(record({ category: 'death' }), true, NOW, KCH)
    expect(owed).toMatchObject({ state: 'due', form: 'JKKP 6', immediate: true, immediateOutstanding: true })
    const told = doshStatus(record({ category: 'death', informedAt: at('2026-10-15T03:00:00Z') }), true, NOW, KCH)
    expect(told.immediateOutstanding).toBe(false)
  })

  it('does not ask for an immediate notice where the rule does not', () => {
    expect(doshStatus(record({ category: 'over_four_days' }), true, NOW, KCH).immediateOutstanding).toBe(false)
  })

  it('is overdue the day after the deadline, and done once the form is sent', () => {
    const late = doshStatus(record({ category: 'dangerous_occurrence', occurredAt: at('2026-10-10T01:00:00Z') }), true, NOW, KCH)
    expect(late).toMatchObject({ state: 'overdue', dueDate: '2026-10-17', daysLeft: -3 })
    const sent = doshStatus(record({ category: 'dangerous_occurrence', submittedAt: at('2026-10-16T01:00:00Z') }), true, NOW, KCH)
    expect(sent).toMatchObject({ state: 'submitted', daysLeft: null })
  })

  it('runs JKKP 7 from the diagnosis when that came later', () => {
    const s = doshStatus(record({ category: 'occupational_disease', clockFrom: at('2026-10-19T01:00:00Z') }), true, NOW, KCH)
    expect(s).toMatchObject({ form: 'JKKP 7', dueDate: '2026-10-26' })
  })

  it('owes nothing once marked not notifiable', () => {
    expect(doshStatus(record({ category: 'not_notifiable' }), true, NOW, KCH)).toMatchObject({ state: 'not_required', form: null })
  })
})

describe('what a DOSH record must contain', () => {
  const ctx = { occurredAt: at('2026-10-15T01:00:00Z'), now: NOW }

  it('refuses "not notifiable" without a reason', () => {
    expect(doshProblem({ category: 'not_notifiable' }, ctx)).toMatch(/why/i)
    expect(doshProblem({ category: 'not_notifiable', notRequiredReason: 'Bruised hand, back at work the same day.' }, ctx)).toBeNull()
  })

  it('asks which schedule item a serious injury or dangerous occurrence was', () => {
    expect(doshProblem({ category: 'serious_bodily_injury' }, ctx)).toMatch(/First Schedule/)
    expect(doshProblem({ category: 'dangerous_occurrence' }, ctx)).toMatch(/dangerous occurrence/)
    expect(doshProblem({ category: 'serious_bodily_injury', detail: 'Fracture of the left wrist' }, ctx)).toBeNull()
  })

  it('refuses dates in the future or before the incident', () => {
    expect(doshProblem({ category: 'death', informedAt: at('2026-10-21T02:00:00Z') }, ctx)).toMatch(/future/)
    expect(doshProblem({ category: 'death', submittedAt: at('2026-10-01T02:00:00Z') }, ctx)).toMatch(/before the incident/)
  })

  it('records no notification against an incident marked not notifiable', () => {
    expect(doshProblem({
      category: 'not_notifiable', notRequiredReason: 'Back at work the same shift.', reference: 'KKP-123',
    }, ctx)).toMatch(/cannot be recorded/)
  })

  it('takes a diagnosis date only for poisoning or disease', () => {
    expect(doshProblem({ category: 'over_four_days', clockFrom: at('2026-10-16T01:00:00Z') }, ctx)).toMatch(/poisoning or disease/)
    expect(doshProblem({ category: 'occupational_poisoning', clockFrom: at('2026-10-16T01:00:00Z') }, ctx)).toBeNull()
  })
})
