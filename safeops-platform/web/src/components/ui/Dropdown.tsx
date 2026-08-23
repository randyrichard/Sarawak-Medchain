import {
  createContext, useContext, useEffect, useRef, useState,
  type ReactNode, type HTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

// Lightweight popover menu: click-outside + Esc to dismiss, no positioning lib.

const DropdownCtx = createContext<{ close: () => void }>({ close: () => {} })

export function Dropdown({
  trigger, children, align = 'end', width = 'w-64', className,
}: {
  trigger: (open: boolean) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  width?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    /*
     * `min-w-0` on both wrappers, so a dropdown used as a flex child can actually shrink.
     *
     * A flex item defaults to `min-width: auto`, which refuses to go below its content.
     * These two divs sit between the flex row and the trigger, so a trigger that truncates
     * perfectly well never got the chance: the header's company and site switchers wanted
     * 323px inside a 184px row and simply overflowed, putting the site name 5px past a
     * 375px viewport and giving every page a horizontal scroll.
     *
     * Worth recording how long this took to find. The first fix put `min-w-0` on the
     * trigger button, which was the wrong element and changed nothing. The second added
     * `flex-1` to the row, which was also correct and also changed nothing. Neither could
     * work while these wrappers still refused to shrink - the constraint has to reach every
     * element between the flex container and the text, not just the ends.
     *
     * A no-op anywhere a dropdown is not a flex child, which is most of its uses.
     */
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <div className="min-w-0" onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1.5 animate-scale-in rounded-xl border bg-raised p-1.5 shadow-pop',
            width,
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <DropdownCtx.Provider value={{ close: () => setOpen(false) }}>{children}</DropdownCtx.Provider>
        </div>
      )}
    </div>
  )
}

export function DropdownItem({
  icon, children, danger, onSelect, className, ...rest
}: HTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; danger?: boolean; onSelect?: () => void }) {
  const { close } = useContext(DropdownCtx)
  return (
    <button
      role="menuitem"
      onClick={() => {
        onSelect?.()
        close()
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        danger ? 'text-critical hover:bg-critical-soft' : 'text-ink-2 hover:bg-accent-soft hover:text-ink',
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted">{children}</p>
}

export function DropdownSeparator() {
  return <div className="my-1.5 border-t" />
}
