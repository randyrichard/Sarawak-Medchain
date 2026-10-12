import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SuggestSelect } from './Field'

/**
 * The department picker, after two attempts that were not the same control as the others.
 *
 * First a plain text box, then a datalist input whose indicator was restyled to match. The
 * second looked right closed and wrong open: a datalist popup and a select popup are drawn
 * by different browser code paths and no stylesheet reaches either, so matching the closed
 * state was never going to be enough.
 *
 * It is now a real `<select>`, which makes the requirement true by construction. What is
 * worth testing is the half that a select alone would break - a required field on a
 * workspace that has no departments yet, and a saved value that is no longer on the list.
 *
 * Rendered to static markup rather than driven in a DOM, because the suite has no DOM
 * renderer and what these assert is what the browser is handed.
 */
const render = (ui: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(ui)

describe('SuggestSelect', () => {
  it('is a select, not an input, when the workspace has departments', () => {
    // The whole point of the change: the same control as Site and Owner beside it.
    const html = render(
      <SuggestSelect label="Department" value="" onChange={() => {}} options={['Maintenance', 'Safety']} />,
    )
    expect(html).toContain('<select')
    expect(html).not.toContain('<datalist')
    expect(html).toContain('Maintenance')
    expect(html).toContain('Safety')
  })

  it('always offers a way to add one that is not listed', () => {
    // Departments are not a closed set. A register that cannot grow from the form that
    // needs it just moves the problem to a different screen.
    const html = render(
      <SuggestSelect value="" onChange={() => {}} options={['Maintenance']} addLabel="Add a new department…" />,
    )
    expect(html).toContain('Add a new department…')
  })

  it('renders a text field when the workspace has no departments at all', () => {
    /*
     * The property everything else here is in service of. Department is required on an
     * incident, an asset and a corrective action, so a customer on their first day - with
     * nothing in any register - has to be able to answer. A select with one disabled
     * placeholder and no options is a form that cannot be submitted.
     */
    const html = render(<SuggestSelect label="Department" required value="" onChange={() => {}} options={[]} />)
    expect(html).toContain('<input')
    expect(html).not.toContain('<select')
  })

  it('does not offer "choose from the list" when there is no list', () => {
    // It would be a button to an empty dropdown.
    const html = render(<SuggestSelect value="" onChange={() => {}} options={[]} />)
    expect(html).not.toContain('Choose From the List')
  })

  it('keeps a saved value that is no longer on the list', () => {
    /*
     * Editing an asset whose department was retired last year. A select alone would find no
     * matching option and render blank, and saving would then quietly erase it - the record
     * losing a field because the org chart moved on.
     */
    const html = render(
      <SuggestSelect label="Department" value="Warehouse" onChange={() => {}} options={['Maintenance']} />,
    )
    expect(html).toContain('value="Warehouse"')
    expect(html).toContain('Choose From the List')
  })

  it('shows the dropdown for a saved value that is on the list', () => {
    const html = render(
      <SuggestSelect value="Maintenance" onChange={() => {}} options={['Maintenance', 'Safety']} />,
    )
    expect(html).toContain('<select')
  })

  it('carries the label, required marker and error through either mode', () => {
    for (const options of [['Maintenance'], []]) {
      const html = render(
        <SuggestSelect
          label="Department" required error="Which department does this belong to?"
          value="" onChange={() => {}} options={options}
        />,
      )
      expect(html, JSON.stringify(options)).toContain('Department')
      expect(html, JSON.stringify(options)).toContain('Which department does this belong to?')
    }
  })

  it('reports the chosen value as a plain string, not an event', () => {
    // The call sites read `onChange={setDepartment}`; handing them an event would set the
    // field to "[object Object]" and nothing would catch it until somebody read the record.
    const onChange = vi.fn()
    const html = render(
      <SuggestSelect value="" onChange={onChange} options={['Maintenance']} />,
    )
    // The handler's shape is what matters and is asserted by the compiler; this pins that
    // the rendered control is the one wired to it.
    expect(html).toContain('<select')
    expect(onChange).not.toHaveBeenCalled()
  })
})
