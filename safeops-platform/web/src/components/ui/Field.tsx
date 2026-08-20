import {
  forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

// Form primitives share one visual contract: 36px control height, hairline
// border, accent focus ring, error state in --critical with a message slot.

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
          {required && <span className="ml-0.5 text-critical">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-critical" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

const controlCls = (error?: string) =>
  cn(
    'h-9 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none transition-colors',
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
      <input ref={ref} id={inputId} required={required} className={cn(controlCls(error), className)} {...rest} />
    </FieldShell>
  )
})

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
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
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
        <select ref={ref} id={inputId} required={required} className={cn(controlCls(error), 'appearance-none pr-8', className)} {...rest}>
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  )
})

export function Checkbox({
  label, className, id, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input id={inputId} type="checkbox" className={cn('h-4 w-4 rounded border accent-[var(--accent)]', className)} {...rest} />
      {label}
    </label>
  )
}
