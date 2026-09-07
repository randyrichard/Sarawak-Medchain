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
/**
 * What an empty person picker should say.
 *
 * There are two reasons the list can be empty and they need opposite advice, which the old
 * single sentence could not give. "Add people under Employees or Contractors" is right for
 * a workspace whose registers really are empty. It is wrong - and expensively wrong - for a
 * reader whose account is limited to one site while the people are at another: following it
 * means adding duplicates of colleagues who are already on the register.
 *
 * That is not hypothetical. It is what a workspace with three employees at Bintulu Plant
 * and an administrator scoped to LMG was told, and the message was the only thing on screen
 * claiming to explain it.
 *
 * The scoped wording deliberately does not say anyone exists elsewhere. The client cannot
 * see past its own scope and must not imply that it can; it says what is being filtered and
 * leaves the conclusion to somebody who can look.
 */
export function personRegisterHint(siteScope: string[] = []): string {
  if (siteScope.length === 0) {
    return '— Add people under Employees or Contractors to pick them here —'
  }
  if (siteScope.length === 1) {
    return `— Nobody at ${siteScope[0]}. Your account only covers that site, so anyone `
      + 'at another is not listed —'
  }
  return `— Nobody at the ${siteScope.length} sites your account covers, so anyone at `
    + 'another is not listed —'
}

export function PersonRegisterOptions({
  people,
  siteScope = [],
  emptyHint,
}: {
  people: EquipmentHolderOption[]
  /**
   * Names of the sites the reader's account is limited to. Empty means organisation-wide,
   * which is the common case and the one the original wording assumed.
   */
  siteScope?: string[]
  /** Overrides the wording entirely. Rarely needed; the default explains both cases. */
  emptyHint?: string
}) {
  const employees = people.filter((p) => p.kind === 'employee')
  const contractors = people.filter((p) => p.kind === 'contractor')

  if (employees.length === 0 && contractors.length === 0) {
    // Disabled: it explains the empty list rather than offering a choice.
    return <option value="" disabled>{emptyHint ?? personRegisterHint(siteScope)}</option>
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
