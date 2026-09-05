import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const variantCls: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-card',
  secondary: 'border bg-surface text-ink hover:bg-accent-soft',
  ghost: 'text-ink-2 hover:bg-accent-soft hover:text-ink',
  danger: 'bg-critical text-white hover:opacity-90 shadow-card',
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  )
})
