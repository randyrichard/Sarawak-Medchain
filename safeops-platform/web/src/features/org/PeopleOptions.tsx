import { useSiteScope } from './OrgContext'
import { personRegisterHint } from '@/components/ui'

/**
 * The name options inside a person picker, and what the picker says when there are none.
 *
 * Sixteen selects rendered `people.map(...)` and nothing else, so an empty list produced a
 * dropdown with no entries and no explanation. On the deployment that is not a rare state:
 * an account scoped to one site sees an empty list whenever the workforce is at another,
 * and Owner is a required field - the form could not be submitted and nothing on screen
 * said why. It cost most of an afternoon to trace once already.
 *
 * The wording is `personRegisterHint`, the same helper the equipment and visitor pickers
 * use, so the two reasons a list can be empty keep giving opposite advice: add somebody
 * when the register really is empty, and explicitly do NOT add somebody when the reader is
 * simply scoped away from them.
 *
 * A component rather than a helper returning nodes, because it needs the reader's site
 * scope and every call site would otherwise have to remember to pass it - which is the
 * omission this exists to make impossible.
 */
export function PeopleOptions({
  people,
  /** Where to add somebody, when the registers really are empty. Differs by picker. */
  addUnder,
}: {
  people: string[]
  addUnder?: string
}) {
  const siteScope = useSiteScope()

  if (people.length === 0) {
    // Disabled: it explains the empty list rather than offering a choice.
    return <option value="" disabled>{personRegisterHint(siteScope, addUnder)}</option>
  }

  return <>{people.map((p) => <option key={p}>{p}</option>)}</>
}
