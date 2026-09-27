import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageStepper } from './StageStepper'

/**
 * The step bar shows the investigation workflow, and only that.
 *
 * "Draft" is stored after "Closed", and drawing the stored list put it on screen as step 9 -
 * a closed incident that still seemed to have a stage left. Rendered to static markup,
 * matching the rest of the suite.
 */
const labels = (html: string) => [...html.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1])

describe('StageStepper', () => {
  it('draws the eight workflow steps, ending at Closed', () => {
    const steps = labels(renderToStaticMarkup(<StageStepper stage="investigation" />))
    expect(steps).toEqual([
      'Reported', 'Initial Assessment', 'Investigation', 'Root Cause Analysis',
      'Corrective Actions', 'Manager Review', 'Verification', 'Closed',
    ])
  })

  it('marks the current step', () => {
    const html = renderToStaticMarkup(<StageStepper stage="rca" />)
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
  })

  it('says a draft has not started rather than drawing Draft as a step', () => {
    const html = renderToStaticMarkup(<StageStepper stage="draft" />)
    expect(html).toContain('not yet submitted')
    expect(labels(html)).not.toContain('Draft')
    expect(html).not.toContain('aria-current')
  })
})
