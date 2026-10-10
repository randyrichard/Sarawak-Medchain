import { createContext, useContext, useEffect } from 'react'

/** What the tab says when no page has claimed a name — and what index.html ships with. */
export const DEFAULT_TITLE = 'SafeChain — Safety Intelligence Platform'

export const titleOf = (page: string) => `${page} · SafeChain`

/*
 * Set by AppShell so a page inside the shell can name itself.
 *
 * The indirection is not decoration - it exists because of the order React runs effects in.
 * Children run their effects before parents, so a detail page setting `document.title`
 * directly would be overwritten a moment later by the shell's own route-derived title. The
 * page registers its name here instead, that lands in the shell's state, and the shell
 * writes the title once from both facts.
 *
 * Null outside the shell. The auth, legal and not-found screens have no shell competing for
 * the title, so `usePageTitle` writes it directly for them.
 */
export const PageTitleContext = createContext<((title: string | null) => void) | null>(null)

/**
 * What the tab should say, given where we are and whether the page named itself.
 *
 * Pure, and separate from the hook, so the rules can be tested without a DOM: a claimed name
 * wins; otherwise the longest matching section wins, which is what makes `/incidents/board`
 * resolve to Incidents rather than to the dashboard's `/`; and the dashboard itself falls
 * through to the product name rather than being titled "Home".
 */
export function resolveTitle(
  pathname: string,
  sections: readonly { to: string; label: string }[],
  claimed: string | null,
): string {
  if (claimed) return titleOf(claimed)

  const match = sections
    .filter((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]

  return match && match.to !== '/' ? titleOf(match.label) : DEFAULT_TITLE
}

/**
 * Name the current screen. Pass nothing to release the name and fall back to the route.
 *
 * Every page had the same title before this: a single-page app changes the URL without
 * touching `document.title`. That is a real accessibility problem, not a cosmetic one -
 * a screen reader announces the title on navigation, so every move around the product was
 * announced identically. It is also why a dozen open tabs were indistinguishable.
 */
export function usePageTitle(title?: string | null) {
  const register = useContext(PageTitleContext)

  useEffect(() => {
    const name = title ?? null

    if (register) {
      register(name)
      return () => register(null)
    }

    document.title = name ? titleOf(name) : DEFAULT_TITLE
  }, [register, title])
}
