import type { EquipmentHolderOption } from '@/api/equipmentHolders'

/**
 * The Employees / Contractor workers groups inside a person picker.
 *
 * Extracted because the same markup existed in three places - naming somebody on an
 * incident, handing over an asset, assigning a new one - and all three carried the same
 * defect: the two `<optgroup>` elements were rendered whether or not anybody was in them.
 *
 * On a workspace whose registers are still empty, which is every new customer on day one,
 * that produced two bold headings with nothing underneath. An optgroup label is not
 * selectable by design, so people clicked "Employees", nothing happened, and the control
 * read as broken. It was reported exactly that way. In the asset picker it was worse than
 * cosmetic: the only other entry there is a placeholder, so the list had nothing selectable
 * at all and there was no way to hand equipment to anyone - with no explanation.
 *
 * A group now appears only when it has members, and when neither does, the picker says why
 * instead of showing headings that cannot be chosen. One implementation, so a fourth picker
 * cannot reintroduce it.
 */
export function PersonRegisterOptions({
  people,
  emptyHint = '— Add people under Employees or Contractors to pick them here —',
}: {
  people: EquipmentHolderOption[]
  /** Shown, disabled, when both registers are empty. */
  emptyHint?: string
}) {
  const employees = people.filter((p) => p.kind === 'employee')
  const contractors = people.filter((p) => p.kind === 'contractor')

  if (employees.length === 0 && contractors.length === 0) {
    // Disabled: it explains the empty list rather than offering a choice.
    return <option value="" disabled>{emptyHint}</option>
  }

  return (
    <>
      {employees.length > 0 && (
        <optgroup label="Employees">
          {employees.map((p) => (
            <option key={`e-${p.id}`} value={`employee:${p.id}`}>
              {p.name}{p.reference ? ` — ${p.reference}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {contractors.length > 0 && (
        <optgroup label="Contractor workers">
          {contractors.map((p) => (
            <option key={`c-${p.id}`} value={`contractor:${p.id}`}>
              {p.name}{p.reference ? ` — ${p.reference}` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

/** Whether either register has anybody in it, for callers wording their own hint. */
export function hasRegisteredPeople(people: EquipmentHolderOption[] | null): boolean {
  return !!people?.some((p) => p.kind === 'employee' || p.kind === 'contractor')
}
