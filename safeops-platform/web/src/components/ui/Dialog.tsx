import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export function Dialog({
  open, onClose, title, description, children, footer, width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  /*
   * Focus moves into the dialog once, when it opens - and only then.
   *
   * This used to live in the same effect as the key handler, which depends on `onClose`.
   * Every caller passes that inline (`onClose={() => setOpen(false)}`), so its identity
   * changed on every render, the effect re-ran on every render, and this line dragged
   * focus back to the dialog's first focusable element each time.
   *
   * The result was that no dialog in the product could be typed into. One keystroke
   * updated the parent's state, the parent re-rendered, focus jumped to the close button,
   * and the next keystroke went nowhere - across all 52 components that use this. Anything
   * that changes on each keystroke made it worse: the "New customer" form recomputes its
   * workspace-id hint as you type, so it re-rendered on every single character.
   *
   * Depending on `open` alone is what makes it fire once per opening.
   */
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    // Returning focus where it came from is why the dialog does not lose the page's place
    // when it closes.
    return () => { previouslyFocused?.focus?.() }
  }, [open])

  // Esc to close + rudimentary focus containment. Safe to re-bind on every render: adding
  // and removing a listener has no effect on where the caret is.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative w-full animate-scale-in rounded-xl border bg-surface shadow-modal', width)}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-muted hover:bg-accent-soft hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {children && <div className="px-5 py-3">{children}</div>}
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          {footer ?? <Button variant="secondary" onClick={onClose}>Close</Button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
