import { Children, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Shown only when the button has no words of its own (see hasText). */
  icon?: ReactNode
}

/*
 * Hover is for a button that can be pressed. A disabled one lit up under the pointer like any
 * other, so it read as a button that was broken rather than one that was off - which is how
 * the toolbox attendance bin was reported. The `disabled:hover:` resets outrank the hover
 * colours on specificity, and never match a LinkButton, since a link cannot be disabled.
 */
const variantCls: Record<Variant, string> = {
  primary: 'bg-accent-solid text-white hover:bg-accent-solid-hover disabled:hover:bg-accent-solid shadow-card',
  secondary: 'border bg-surface text-ink hover:bg-accent-soft disabled:hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-accent-soft hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-2',
  danger: 'bg-critical-solid text-white hover:opacity-90 disabled:hover:opacity-55 shadow-card',
}

/*
 * Heights are the desk sizes; `coarse:` raises them for a finger.
 *
 * Measured at 320px, twenty-five interactive elements came out under 32px tall, `sm` at 28px
 * among them. That clears WCAG 2.5.8 AA, which asks for 24, and is still an awkward target
 * for the people this product is for — a supervisor tapping "Refresh" on a fabrication yard
 * is often wearing gloves.
 *
 * Raised only on touch pointers, not on narrow windows: the dense desktop layout is
 * deliberate and a mouse gains nothing from a taller control. Horizontal padding grows with
 * the height so the shape stays right rather than becoming a tall thin slab.
 */
const sizeCls: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 coarse:h-11 coarse:px-3.5',
  md: 'h-9 px-3.5 text-sm gap-2 coarse:h-11 coarse:px-4',
  lg: 'h-10 px-4 text-base gap-2 coarse:h-12 coarse:px-5',
}

/*
 * Exported so a link can be made to look like a button without becoming one.
 *
 * Five places wrapped a <Button> in a react-router <Link>, which renders <a><button>. That
 * is invalid HTML - a button is interactive content and the spec forbids it inside an anchor
 * - and browsers disagree about what to do with it: the nested button can swallow the click,
 * and assistive technology is handed two nested controls where the author meant one. The fix
 * is a real anchor wearing these classes, which is what LinkButton is.
 */
export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex select-none items-center justify-center rounded-lg font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-55',
    variantCls[variant],
    sizeCls[size],
    className,
  )
}

/**
 * Whether a button says what it does in words.
 *
 * Icons are for buttons that have no words: close, menu, notifications. Beside a label they
 * only repeated it - a plus beside "New action", a printer beside "Print" - and across a page
 * that was dozens of small symbols competing with the one or two marks that mean something
 * (an overdue count, a critical incident). So a button with text shows the text, and the
 * `icon` it was given is kept for the case where it is the only thing on the button.
 */
export function hasText(children: ReactNode): boolean {
  return Children.toArray(children).some((c) => {
    if (typeof c === 'string' || typeof c === 'number') return String(c).trim().length > 0
    if (!isValidElement<{ children?: ReactNode; className?: string }>(c)) return false
    // Words only a screen reader hears leave the button blank to everyone else.
    if (/(^|\s)sr-only(\s|$)/.test(c.props.className ?? '')) return false
    return hasText(c.props.children)
  })
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      // Busy, not just disabled: says the action is under way rather than unavailable.
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : hasText(children) ? null : icon}
      {children}
    </button>
  )
})
