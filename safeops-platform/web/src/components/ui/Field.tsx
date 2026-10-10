import {
  forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

// Form primitives share one visual contract: 36px control height, hairline
// border, accent focus ring, error state in --critical with a message slot.
//
// And one accessibility contract: the hint or error under a control is tied to it with
// `aria-describedby`, and an error sets `aria-invalid`. Before this the message was only
// *near* the field - a screen reader focusing the input heard its label and nothing else,
// so "Must be at least 12 characters" was never read to the person it was for.

/** The id of the message (hint or error) under the control with this id. */
const messageId = (controlId: string) => `${controlId}-message`

/**
 * The attributes that tie a control to its message. Keeps any `aria-describedby` the caller
 * passed, so wiring a control to something else on the page is not lost.
 */
export function fieldA11y(
  controlId: string,
  { hint, error, describedBy }: { hint?: string; error?: string; describedBy?: string },
) {
  const ids = [describedBy, hint || error ? messageId(controlId) : undefined].filter(Boolean)
  return {
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': ids.length ? ids.join(' ') : undefined,
  }
}

export function FieldShell({
  label, hint, error, required, htmlFor, children,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-2">
          {label}
          {/* The control's own `required` is what assistive technology reads; the star is visual. */}
          {required && <span aria-hidden className="ml-0.5 text-critical">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor && messageId(htmlFor)} className="text-xs font-medium text-critical" role="alert">{error}</p>
      ) : hint ? (
        <p id={htmlFor && messageId(htmlFor)} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/*
 * 36px tall for a mouse, 44px on a touch screen - Fitts's law.
 *
 * Time to hit a target grows as it shrinks (T = a + b·log2(D/W + 1)), and a fingertip is a
 * far blunter pointer than a cursor: Apple asks for 44pt and Material for 48dp. The buttons
 * already grew on `coarse:`; the fields beside them did not, so on a phone every input,
 * select and date picker was a 36px strip - in the form people fill in standing in a plant.
 * `coarse:` keys off the pointer, not the screen width, so a desktop keeps its density.
 */
const controlCls = (error?: string) =>
  cn(
    'h-9 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none transition-colors coarse:h-11',
    'placeholder:text-muted focus:border-accent',
    error && 'border-critical',
  )

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <input
        ref={ref} id={inputId} required={required} className={cn(controlCls(error), className)} {...rest}
        {...fieldA11y(inputId, { hint, error, describedBy: rest['aria-describedby'] })}
      />
    </FieldShell>
  )
})

/**
 * A dropdown of what the workspace already has, with a way in for what it does not.
 *
 * This is the same control as every other picker on the form - a real `<select>` - because
 * that was the requirement, and the two earlier attempts at it both failed on the same
 * point. A plain `<input list>` looked close once its indicator was restyled, but the panel
 * it opens is browser chrome: a datalist popup and a select popup are drawn by different
 * code paths and no stylesheet reaches either. Matching the closed state and not the open
 * one is not matching.
 *
 * So the list is a select, and the escape hatch is an explicit option in it. Choosing
 * "Add a new one" swaps in a text field, and what is typed there is saved exactly as it
 * was before. That keeps the property this whole field depends on: Department is required
 * on an incident, an asset and a corrective action, so a workspace on its first day - with
 * nothing in any register yet - has to be able to answer. With no options at all the text
 * field is simply what renders, and there is no empty dropdown to open.
 *
 * A value that is not in the list keeps the field in text mode rather than silently
 * dropping it. Editing an asset whose department was retired last year must not quietly
 * blank the field, which is what a select alone would do.
 */
const ADD_NEW = '__add_new__'

export interface SuggestSelectProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  value: string
  onChange: (value: string) => void
  /** What the workspace already has. Never a restriction - only a shortcut. */
  options: string[]
  placeholder?: string
  /** Wording for the escape hatch, e.g. "Add a new department…". */
  addLabel?: string
  /**
   * Whether the placeholder is a choosable value rather than a prompt.
   *
   * For a filter, where "any" is a real answer and has to be reachable again after one is
   * picked. On a form it stays disabled, so a required field cannot be emptied back into
   * an invalid state by choosing the prompt.
   */
  allowEmpty?: boolean
}

export function SuggestSelect({
  label, hint, error, required, disabled, value, onChange, options,
  placeholder, addLabel = 'Add a new one…', allowEmpty = false,
}: SuggestSelectProps) {
  /*
   * Typing mode is derived from the value on the first render and then held, so that
   * clearing the box to retype does not throw the operator back to the dropdown mid-word.
   */
  const [typing, setTyping] = useState(() => Boolean(value) && !options.includes(value))
  const showText = typing || options.length === 0

  if (showText) {
    return (
      <div className="space-y-1.5">
        <Input
          label={label}
          hint={hint}
          error={error}
          required={required}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {/*
          Only offered when there is a list to go back to. On a workspace with nothing in
          the register yet this would be a button to an empty dropdown.
        */}
        {options.length > 0 && (
          <button
            type="button"
            className="text-2xs font-semibold text-accent hover:underline"
            onClick={() => { setTyping(false); onChange('') }}
          >
            Choose From the List Instead
          </button>
        )}
      </div>
    )
  }

  return (
    <Select
      label={label}
      hint={hint}
      error={error}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) {
          setTyping(true)
          onChange('')
          return
        }
        onChange(e.target.value)
      }}
    >
      <option value="" disabled={!allowEmpty}>{placeholder ?? 'Select…'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value={ADD_NEW}>{addLabel}</option>
    </Select>
  )
}

/**
 * A password field with a reveal toggle.
 *
 * Typing a long password blind, into a field that shows nothing but dots, is where sign-in
 * attempts are lost - and the people it costs most are the ones on a phone keyboard in a
 * plant, which is much of who uses this product. Being able to check what you typed before
 * submitting removes a whole class of "it says my password is wrong" support calls.
 *
 * Details that matter:
 *
 * - `type="button"`, or it submits the form instead of toggling.
 * - The field keeps its `autoComplete` value, so password managers still fill and save it.
 *   Swapping the input for a text field would otherwise look like a different field to
 *   them.
 * - The button is a real focusable control, not an icon with a click handler, so it can be
 *   reached and operated from the keyboard.
 * - `aria-pressed` states the toggle, and the label says what pressing it will do next.
 * - `pr-10` keeps typed text from running underneath the button.
 *
 * Defaults to hidden, always: revealed-by-default would put somebody's password on a screen
 * in a shared office without them asking.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { label, hint, error, required, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [revealed, setRevealed] = useState(false)
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          required={required}
          type={revealed ? 'text' : 'password'}
          className={cn(controlCls(error), 'pr-10', className)}
          {...rest}
          {...fieldA11y(inputId, { hint, error, describedBy: rest['aria-describedby'] })}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          title={revealed ? 'Hide password' : 'Show password'}
          className={cn(
            'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg',
            'text-muted transition-colors hover:text-ink focus:outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent',
          )}
        >
          {revealed ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>
      </div>
    </FieldShell>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id, rows = 3, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        ref={ref} id={inputId} rows={rows} required={required}
        className={cn(controlCls(error), 'h-auto py-2', className)} {...rest}
        {...fieldA11y(inputId, { hint, error, describedBy: rest['aria-describedby'] })}
      />
    </FieldShell>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, id, children, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <div className="relative">
        <select
          ref={ref} id={inputId} required={required} className={cn(controlCls(error), 'appearance-none pr-8', className)} {...rest}
          {...fieldA11y(inputId, { hint, error, describedBy: rest['aria-describedby'] })}
        >
          {children}
        </select>
        <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  )
})

export function Checkbox({
  label, className, id, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const autoId = useId()
  const inputId = id ?? autoId
  // The 16px box is not the target - the label is, because a <label htmlFor> toggles the
  // input natively across the whole of its own area. So the row is what gets raised on a
  // touch pointer; inflating the box itself would only make it an ugly 44px square.
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 text-sm text-ink coarse:min-h-11">
      <input id={inputId} type="checkbox" className={cn('h-4 w-4 rounded border accent-[var(--accent)]', className)} {...rest} />
      {label}
    </label>
  )
}
