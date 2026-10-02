import {
  cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState,
  type ReactElement, type ReactNode, type HTMLAttributes, type KeyboardEvent,
} from 'react'
import { cn } from '@/lib/cn'

// Lightweight popover menu: click-outside + Esc to dismiss, no positioning lib.
//
// Keyboard, per the WAI-ARIA menu-button pattern:
//   - Enter / Space / ArrowDown on the trigger opens the menu with focus on the first item;
//     ArrowUp opens it on the last.
//   - Arrow keys move through the items (wrapping), Home / End jump to the ends, and a
//     letter jumps to the next item starting with it.
//   - Esc closes and puts focus back on the trigger; Tab closes and lets focus move on.

const ITEM = '[role="menuitem"]:not([disabled])'

const DropdownCtx = createContext<{ close: () => void }>({ close: () => {} })

/**
 * Adds the menu-button semantics to whatever the caller rendered as its trigger.
 *
 * `aria-haspopup` says the control opens a menu; `aria-expanded` says whether it is open
 * right now. Without the pair, a screen reader announces a button and gives no indication
 * that anything appeared when it was pressed.
 *
 * Falls through untouched for a non-element trigger (a bare string), and never overwrites
 * an attribute a caller set deliberately.
 */
function annotateTrigger(node: ReactNode, open: boolean): ReactNode {
  if (!isValidElement(node)) return node
  const existing = node.props as Record<string, unknown>
  return cloneElement(node as ReactElement<Record<string, unknown>>, {
    'aria-haspopup': existing['aria-haspopup'] ?? 'menu',
    'aria-expanded': existing['aria-expanded'] ?? open,
  })
}

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
  // Which item takes focus when the menu opens: the first, or the last for ArrowUp.
  const [entry, setEntry] = useState<'first' | 'last'>('first')
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
  const triggerEl = () =>
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup]') ?? null

  /** Closes the menu; `refocus` returns focus to the trigger (Esc, or choosing an item). */
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerEl()?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus moves into the menu as it opens, so the arrow keys act on it straight away.
  useEffect(() => {
    if (!open) return
    const all = items()
    ;(entry === 'last' ? all[all.length - 1] : all[0])?.focus()
  }, [open, entry])

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setEntry(e.key === 'ArrowUp' ? 'last' : 'first')
      setOpen(true)
    }
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items()
    const at = all.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus() }
    switch (e.key) {
      case 'ArrowDown': return move(at + 1)
      case 'ArrowUp': return move(at < 0 ? all.length - 1 : at - 1)
      case 'Home': return move(0)
      case 'End': return move(all.length - 1)
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // an enclosing dialog must not close too
        return close(true)
      case 'Tab':
        return close(false)
      default:
        // Type-ahead: the next item whose text starts with the letter pressed.
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const key = e.key.toLowerCase()
          for (let step = 1; step <= all.length; step++) {
            const i = (at + step) % all.length
            if (all[i].textContent?.trim().toLowerCase().startsWith(key)) return move(i)
          }
        }
    }
  }

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
      {/*
        The trigger is annotated rather than wrapped in ARIA.

        Every caller returns a real <button>, so the keyboard already worked — Enter and
        Space fire a click that bubbles to this div. What a screen reader had no way to know
        was that the button opens a menu, or whether it is currently open: nothing announced
        it, so the control read as an unlabelled action with no state.

        Injected here instead of asked of each caller, because six callers is six chances to
        forget, and the component is the only place that knows `open`. Putting the
        attributes on this wrapper instead would be wrong twice over — it is not the control,
        and a div carrying button semantics around a real button is a worse tree than the one
        it replaces.
      */}
      <div
        className="min-w-0"
        onClick={() => { setEntry('first'); setOpen((o) => !o) }}
        onKeyDown={onTriggerKeyDown}
      >
        {annotateTrigger(trigger(open), open)}
      </div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute z-40 mt-1.5 animate-scale-in rounded-xl border bg-raised p-1.5 shadow-pop',
            width,
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <DropdownCtx.Provider value={{ close: () => close(true) }}>{children}</DropdownCtx.Provider>
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
      type="button"
      role="menuitem"
      // Reached with the arrow keys, not Tab: a menu is one stop in the page's Tab order.
      tabIndex={-1}
      onClick={() => {
        onSelect?.()
        close()
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-none focus:bg-accent-soft',
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
  // `role="presentation"` keeps a heading-like label from being counted as a menu item.
  return <p role="presentation" className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted">{children}</p>
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1.5 border-t" />
}
