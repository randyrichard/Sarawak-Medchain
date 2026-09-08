import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * What a person picker offers when there is nobody to offer.
 *
 * Sixteen selects across actions, assets, audits, permits, training and incidents each
 * rendered `people.map(...)` and nothing else. An empty list therefore produced a dropdown
 * with no entries and no explanation, and on Owner - which is required - the form could not
 * be submitted at all. That was reported from the deployment as a broken dialog, and the
 * reason turned out to be an account scoped to one site while the workforce sat at another,
 * which nothing on screen said.
 *
 * So what is worth asserting is not that names render. It is that the empty case is never
 * silent, and that the option carrying the explanation cannot be chosen and submitted as if
 * it were a person's name.
 *
 * Rendered to static markup, matching the rest of the suite - there is no DOM renderer here
 * and what this asserts is what the browser is handed.
 */
const scope = vi.hoisted(() => ({ value: [] as string[] }))

/*
 * Only the site scope is mocked. Importing the real OrgContext would pull a provider, a
 * workspace and an API client into a test about six option elements.
 */
vi.mock('./OrgContext', () => ({ useSiteScope: () => scope.value }))

const { PeopleOptions } = await import('./PeopleOptions')

const render = (people: string[], addUnder?: string) =>
  renderToStaticMarkup(<PeopleOptions people={people} addUnder={addUnder} />)

describe('PeopleOptions', () => {
  it('offers every name it is given', () => {
    scope.value = []
    const html = render(['Aminah Yusof', 'Chong Wei Ming'])
    expect(html).toContain('Aminah Yusof')
    expect(html).toContain('Chong Wei Ming')
  })

  it('says nothing extra when there are people, so the list is not padded', () => {
    scope.value = []
    expect(render(['Aminah Yusof'])).not.toMatch(/Add people/i)
  })

  it('explains an empty list rather than rendering no options', () => {
    // The defect this exists for. An empty select reads as a broken control, and the
    // reader has no way to tell a permission problem from an empty register.
    scope.value = []
    const html = render([])
    expect(html).toContain('<option')
    expect(html).toMatch(/Add people/i)
  })

  it('makes the explanation unselectable and empty-valued', () => {
    /*
     * It is a sentence, not a person. These fields are submitted as a name string, so a
     * selectable hint would be stored as the owner of a corrective action and then
     * notified - and an empty value is what the required-field check already refuses.
     */
    scope.value = []
    const html = render([])
    expect(html).toContain('disabled')
    expect(html).toContain('value=""')
  })

  it('does not tell a site-scoped reader to add somebody', () => {
    /*
     * The expensive half. Their colleagues are already on the register at a site they
     * cannot see; following that advice creates duplicate employee records, which is the
     * one thing the workforce register exists to prevent. The wording lives in
     * personRegisterHint - this asserts the scope actually reaches it, which is the part a
     * call site used to have to remember and did not.
     */
    scope.value = ['LMG']
    const html = render([])
    expect(html).toContain('LMG')
    expect(html).not.toMatch(/Add people/i)
  })

  it('passes on where to add somebody, because that differs by picker', () => {
    scope.value = []
    expect(render([], 'Employees')).toContain('Employees')
    expect(render([], 'Employees')).not.toContain('Contractors')
  })
})
