import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * Takes the keyboard to the first field marked invalid, and scrolls it into view - so pressing
 * Save on a long form, or Continue at the foot of a phone screen, shows what to put right
 * instead of appearing to do nothing.
 *
 * Looks inside the dialog on top when one is open, so a field on the page behind it is
 * never the one chosen. Returns whether there was one.
 */
export function focusFirstInvalid(root?: ParentNode | null): boolean {
  const dialogs = document.querySelectorAll('[aria-modal="true"]')
  const scope = root ?? dialogs[dialogs.length - 1] ?? document
  // `data-invalid` marks what cannot carry aria-invalid, such as the first of a row of toggle
  // buttons that nothing has been chosen from.
  const field = scope.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid]')
  if (!field) return false
  field.scrollIntoView?.({ block: 'center' })
  field.focus({ preventScroll: true })
  return true
}

/**
 * A form that is checked when it is sent, not before.
 *
 * Save buttons used to stay greyed out until every required field was right, and said
 * nothing about which one was not. "Submit Near Miss" stayed grey for "Fire" - four letters
 * where five were wanted, written nowhere - and "Create Draft" for a location left blank
 * half a screen above. A grey button is a dead end: it cannot be pressed to find out why,
 * a screen reader skips it, and the person is left guessing.
 *
 * Now the button can always be pressed. If something is missing, each field says what it
 * needs, under the field, and the keyboard goes to the first of them. Messages appear only
 * after that first press, so nobody is told off for a form they have not finished, and
 * then follow the fields as they are put right.
 *
 * `problems` holds, for each field, what is wrong with it, or nothing. `active` is the
 * dialog's `open`: each opening starts with no messages.
 */
export function useFormCheck<K extends string>(problems: Record<K, string | false | null | undefined>, active = true) {
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (active) setTried(false)
  }, [active])

  const errorFor = (field: K): string | undefined => (tried ? problems[field] || undefined : undefined)
  const ok = !Object.values<string | false | null | undefined>(problems).some(Boolean)

  /** True when the form may be sent. Otherwise shows what is missing and goes to it. */
  const check = (): boolean => {
    if (ok) return true
    flushSync(() => setTried(true))
    focusFirstInvalid()
    return false
  }
  const reset = useCallback(() => setTried(false), [])

  return { errorFor, check, reset, ok, tried }
}
