import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Alert } from './Alert'
import { Button } from './Button'

/**
 * The classes that keep a dialog inside the window, named so they can be asserted.
 *
 * Exported because this suite has no DOM renderer and the component uses a portal, so the
 * only alternatives were adding jsdom for one layout check or matching a regex against
 * this file. These are the values the component renders, so a test reading them cannot
 * drift from what ships.
 *
 * Each line is load-bearing:
 *
 *  - `max-h-full` on the panel: without it the panel grows to its content and, because the
 *    wrapper centres it, overflows the top and the bottom at once - title and buttons both
 *    unreachable, nothing scrollable.
 *  - `min-h-0` on the body: a flex child will not shrink below its content without it, so
 *    the panel keeps growing and the overflow rule never engages. The one most likely to
 *    look redundant and be deleted.
 *  - `shrink-0` on the header and footer: they are the title and the buttons, and they must
 *    survive exactly the situation this exists for.
 *  - `overscroll-contain`: a scroll reaching the end of the body stops there rather than
 *    carrying on into the page behind.
 */
export const DIALOG_LAYOUT = {
  /*
   * `short:` - on a short screen (landscape, or the keyboard up) the pinned header and footer
   * took all of the height: the body shrank to nothing, and the field being typed into sat
   * below the panel's edge with no way to scroll to it. There the whole panel scrolls as one
   * instead, header and buttons included.
   */
  panel: 'relative flex max-h-full w-full flex-col animate-scale-in rounded-xl border bg-surface shadow-modal short:overflow-y-auto short:overscroll-contain',
  header: 'flex shrink-0 items-start justify-between gap-4 px-5 pb-1 pt-4',
  body: 'min-h-0 overflow-y-auto overscroll-contain px-5 py-3 short:min-h-fit short:overflow-visible',
  footer: 'flex shrink-0 justify-end gap-2 border-t px-5 py-3',
  /** Sits directly on top of the footer, so it is pinned with it and never scrolls away. */
  error: 'shrink-0 border-t px-5 pt-3',
} as const

/** What can take focus inside the panel. Disabled controls are skipped, as the browser does. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where focus goes when a dialog opens.
 *
 * It used to be the first button in the panel - which is the close X in the header, so every
 * form dialog opened with focus on "Close dialog" and the first keystroke after "New
 * incident" went nowhere useful. Now, in order:
 *
 *  1. an element the caller marked with `data-autofocus`;
 *  2. the first form field in the body, so a form is ready to type into;
 *  3. the panel itself, so a screen reader reads the title and description first - right
 *     for a confirmation, where landing on "Delete" would invite an accidental Enter.
 */
export function initialFocusTarget(panel: HTMLElement): HTMLElement {
  return (
    panel.querySelector<HTMLElement>('[data-autofocus]') ??
    panel.querySelector<HTMLElement>(
      '[data-dialog-body] input:not([disabled]):not([type="hidden"]), [data-dialog-body] select:not([disabled]), [data-dialog-body] textarea:not([disabled])',
    ) ??
    panel
  )
}

export function Dialog({
  open, onClose, title, description, children, footer, width = 'max-w-md', error,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  width?: string
  /**
   * Why the last action failed, shown directly above the footer buttons.
   *
   * Law of proximity: feedback belongs next to the thing that caused it. Dialogs used to
   * put this Alert at the top of the body - and the body scrolls, while the buttons are
   * pinned at the bottom. On any form taller than the window, pressing "Save" and being
   * refused put the reason off-screen, a scroll away from where the person was looking,
   * so the click seemed to do nothing. Here it sits against the button that was pressed,
   * pinned with the footer, in view whatever the body's scroll position.
   */
  error?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

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
    if (panelRef.current) initialFocusTarget(panelRef.current).focus()
    // The page behind does not scroll under the dialog. Restored to what it was, so a
    // dialog opened from inside another does not unlock the page when it closes.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Returning focus where it came from is why the dialog does not lose the page's place
    // when it closes.
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  // Esc to close + rudimentary focus containment. Safe to re-bind on every render: adding
  // and removing a listener has no effect on where the caret is.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        // Focus on the panel itself (a confirmation) or somewhere outside it: Tab enters
        // at the start and Shift+Tab at the end, never escaping to the page behind.
        const inside = Array.prototype.includes.call(focusables, document.activeElement)
        if (!inside) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
        } else if (e.shiftKey && document.activeElement === first) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 short:p-2">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // Named by its visible heading rather than a copy of it, so the two cannot drift,
        // and described by the subtitle so it is read on opening.
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(DIALOG_LAYOUT.panel, 'outline-none', width)}
      >
        <div className={DIALOG_LAYOUT.header}>
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p id={descriptionId} className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="shrink-0 rounded-lg p-1 coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center text-muted hover:bg-accent-soft hover:text-ink">
            <X size={16} aria-hidden />
          </button>
        </div>
        {children && <div data-dialog-body className={DIALOG_LAYOUT.body}>{children}</div>}
        {error && (
          <div className={DIALOG_LAYOUT.error}>
            <Alert tone="critical">{error}</Alert>
          </div>
        )}
        <div className={cn(DIALOG_LAYOUT.footer, Boolean(error) && 'border-t-0')}>
          {footer ?? <Button variant="secondary" onClick={onClose}>Close</Button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
