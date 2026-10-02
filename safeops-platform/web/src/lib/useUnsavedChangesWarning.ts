import { useEffect } from 'react'

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave this page and lose them?'

/**
 * Asks before leaving a form that has unsaved input, as Gmail, Google Docs and Jira do.
 *
 * Covers the two ways a half-written report is lost:
 *
 * - **Closing, reloading or typing a new address.** The browser's own "Leave site?" prompt,
 *   via `beforeunload`. Browsers show their own wording; the message is ignored by design.
 * - **Clicking a link inside SafeOps** - the sidebar, the logo, a notification. These never
 *   unload the page, so `beforeunload` does not fire; a capture-phase click listener asks
 *   first, and cancels the click if the answer is no.
 *
 * Not covered: the browser Back button inside the app, which the router does not let a page
 * veto. Forms where losing input matters most should also keep a draft, as the incident
 * report does.
 *
 * Pass `dirty: false` once the form is saved, so a successful submit can navigate freely.
 */
const browserConfirm = (message: string) => window.confirm(message)

export function useUnsavedChangesWarning(
  dirty: boolean,
  confirmLeave: (message: string) => boolean = browserConfirm,
) {
  useEffect(() => {
    if (!dirty) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // still required by some browsers to show the prompt
    }

    const onClick = (e: MouseEvent) => {
      // A new-tab click leaves this page as it is, so there is nothing to lose.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return // beforeunload handles leaving the site
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!confirmLeave(UNSAVED_MESSAGE)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    // Capture phase, so this runs before the router's own handler on the link.
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, confirmLeave])
}
