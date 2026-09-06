import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/*
 * Paths whose URL carries a single-use credential.
 *
 * These never get a canonical tag. An invitation token sits in the path itself, so a
 * canonical link would write a working credential into the page markup — somewhere it can be
 * copied out of a saved page, a screenshot of "view source", or an archived copy. The reset
 * link keeps its token in the query string, which a canonical would strip, but it is listed
 * here too: the page should not be advertising a preferred URL for itself at all.
 */
const NEVER_CANONICAL = ['/accept-invitation', '/reset-password']

/*
 * Maintains <link rel="canonical"> for the current route.
 *
 * The URL has to be absolute, and this deployment does not know its own public address at
 * build time — the bundle is built once and served from whatever domain it lands on. So the
 * value comes from location.origin at runtime rather than from a baked-in constant that
 * would be wrong on every deployment but one.
 *
 * The query string and hash are dropped deliberately. That is the duplicate-content case
 * canonical exists for: `/login?next=/incidents` and `/login` are the same page, and only
 * one of them should be the address of record.
 *
 * Renders nothing. It is a component rather than a hook call in App so that it sits inside
 * BrowserRouter and can read the location.
 */
export function Canonical() {
  const { pathname } = useLocation()

  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')

    if (NEVER_CANONICAL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      existing?.remove()
      return
    }

    const link = existing ?? document.createElement('link')
    link.rel = 'canonical'
    link.href = `${window.location.origin}${pathname}`
    if (!existing) document.head.appendChild(link)
  }, [pathname])

  return null
}
