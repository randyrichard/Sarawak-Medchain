import { describe, expect, it } from 'vitest'
import {
  addMonths, controlsState, hirarcAttention, hirarcProblem, LIKELIHOOD, riskLevel, riskScore, SEVERITY,
  type HirarcFields,
} from './hirarc.js'

const fields = (over: Partial<HirarcFields> = {}): HirarcFields => ({
  activity: 'Loading at Bay 4', hazard: 'Reversing forklift', effect: 'Struck-by injury, crushing',
  existingControls: 'Reversing alarm', likelihood: 4, severity: 4,
  additionalControls: '', owner: '', controlsDue: null, residualLikelihood: null, residualSeverity: null,
  assessedBy: 'Grace Lim', assessedOn: '2026-10-20', reviewDue: '2027-10-20',
  ...over,
})
const TODAY = '2026-10-25'

describe('the DOSH 2008 risk matrix', () => {
  it('rates each axis 1 to 5, as the guideline\'s tables do', () => {
    expect(LIKELIHOOD.map((s) => `${s.value} ${s.label}`)).toEqual(['5 Most Likely', '4 Possible', '3 Conceivable', '2 Remote', '1 Inconceivable'])
    expect(SEVERITY.map((s) => `${s.value} ${s.label}`)).toEqual(['5 Catastrophic', '4 Fatal', '3 Serious', '2 Minor', '1 Negligible'])
  })

  it('bands likelihood times severity: 15-25 high, 5-12 medium, 1-4 low', () => {
    const band = (l: number, s: number) => riskLevel(riskScore(l, s))
    expect(band(5, 5)).toBe('high')
    expect(band(3, 5)).toBe('high')
    expect(band(4, 3)).toBe('medium')
    expect(band(5, 1)).toBe('medium')
    expect(band(2, 2)).toBe('low')
    expect(band(4, 1)).toBe('low')
  })

  it('leaves no cell of the matrix outside a band', () => {
    for (let l = 1; l <= 5; l++) for (let s = 1; s <= 5; s++) {
      const score = riskScore(l, s)
      expect(score >= 15 || (score >= 5 && score <= 12) || score <= 4).toBe(true)
    }
  })
})

describe('what a row needs before it is saved', () => {
  it('accepts a hazard written down before anyone has decided on further controls', () => {
    expect(hirarcProblem(fields(), TODAY)).toBeNull()
  })

  it('asks for the activity, the hazard and what it can cause', () => {
    expect(hirarcProblem(fields({ activity: ' ' }), TODAY)).toBe('Name the work activity.')
    expect(hirarcProblem(fields({ hazard: '' }), TODAY)).toBe('Name the hazard.')
    expect(hirarcProblem(fields({ effect: '' }), TODAY)).toBe('Say what the hazard can cause.')
  })

  it('keeps ratings on the 1-5 scale', () => {
    expect(hirarcProblem(fields({ likelihood: 6 }), TODAY)).toBe('Likelihood is rated 1 to 5.')
    expect(hirarcProblem(fields({ severity: 0 }), TODAY)).toBe('Severity is rated 1 to 5.')
    expect(hirarcProblem(fields({ severity: 2.5 }), TODAY)).toBe('Severity is rated 1 to 5.')
  })

  it('rates the risk after controls only once the controls are named, and never above the risk now', () => {
    expect(hirarcProblem(fields({ residualLikelihood: 2, residualSeverity: null }), TODAY)).toMatch(/or neither/)
    expect(hirarcProblem(fields({ residualLikelihood: 2, residualSeverity: 4 }), TODAY)).toMatch(/recommended controls are before rating/)
    expect(hirarcProblem(fields({ additionalControls: 'Banksman', residualLikelihood: 5, residualSeverity: 5 }), TODAY)).toMatch(/cannot be higher/)
    expect(hirarcProblem(fields({ additionalControls: 'Banksman, exclusion zone', residualLikelihood: 2, residualSeverity: 4 }), TODAY)).toBeNull()
  })

  it('keeps the dates in order', () => {
    expect(hirarcProblem(fields({ assessedOn: '2026-10-26' }), TODAY)).toBe('The assessment date is in the future.')
    expect(hirarcProblem(fields({ reviewDue: '2026-10-20' }), TODAY)).toBe('The review date must be after the assessment.')
    expect(hirarcProblem(fields({ reviewDue: '2062-10-20' }), TODAY)).toMatch(/not a review/)
    expect(hirarcProblem(fields({ assessedOn: '2026-02-30' }), TODAY)).toBe('Assessment date is not a date.')
    expect(hirarcProblem(fields({ controlsDue: '2026-11-30' }), TODAY)).toMatch(/as well as when they are due/)
    expect(hirarcProblem(fields({ additionalControls: 'Banksman', controlsDue: '2026-10-01' }), TODAY)).toBe('The date for completion is before the assessment.')
  })

  it('moves a review date by calendar months, keeping to the end of a short month', () => {
    expect(addMonths('2026-10-20', 12)).toBe('2027-10-20')
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28')
  })
})

describe('what the register says a row still needs', () => {
  const row = (over: Partial<Parameters<typeof hirarcAttention>[0]> = {}) => ({
    riskScore: 16, residualScore: null, additionalControls: '', controlsDue: null, reviewDue: '2027-10-20', archived: false, ...over,
  })

  it('asks for further controls on a high or medium risk, and not on a low one', () => {
    expect(hirarcAttention(row(), [], TODAY)).toMatchObject({ level: 'high', needsControls: true, controls: 'none' })
    expect(hirarcAttention(row({ riskScore: 4 }), [], TODAY)).toMatchObject({ level: 'low', needsControls: false })
  })

  it('asks for a date for completion, and says when it has passed with the work not done', () => {
    expect(hirarcAttention(row({ additionalControls: 'Banksman' }), [], TODAY)).toMatchObject({ needsDate: true, controls: 'planned' })
    const late = hirarcAttention(row({ additionalControls: 'Banksman', controlsDue: '2026-10-24' }), [{ status: 'in_progress' }], TODAY)
    expect(late).toMatchObject({ needsDate: false, controlsOverdue: true, controls: 'in_progress' })
    const done = hirarcAttention(row({ additionalControls: 'Banksman', controlsDue: '2026-10-24' }), [{ status: 'verified' }, { status: 'cancelled' }], TODAY)
    expect(done).toMatchObject({ controlsOverdue: false, controls: 'done' })
  })

  it('counts the controls as done only when every live action raised for them is', () => {
    expect(controlsState('Banksman', [{ status: 'completed' }, { status: 'open' }])).toBe('in_progress')
    expect(controlsState('Banksman', [{ status: 'cancelled' }])).toBe('planned')
    expect(controlsState('Banksman', [{ status: 'completed' }, { status: 'verified' }])).toBe('done')
  })

  it('flags a review that has fallen due, and nothing on an archived row', () => {
    expect(hirarcAttention(row({ reviewDue: '2026-10-24' }), [], TODAY).reviewOverdue).toBe(true)
    expect(hirarcAttention(row({ reviewDue: '2026-10-25' }), [], TODAY).reviewOverdue).toBe(false)
    expect(hirarcAttention(row({ reviewDue: '2026-10-24', archived: true }), [], TODAY)).toMatchObject({ reviewOverdue: false, needsControls: false })
  })
})
