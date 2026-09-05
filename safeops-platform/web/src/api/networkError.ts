import { API_BASE_URL } from './authApi'

/**
 * Explains a failed fetch, as far as a browser will let us.
 *
 * A cross-origin rejection and a dead server are deliberately indistinguishable to page
 * script: both arrive as `TypeError: Failed to fetch`, with no status and no headers. The
 * browser withholds the reason on purpose, so that a page cannot use failure messages to
 * map a network it should not be able to see. No amount of inspecting the error will
 * separate the two.
 *
 * What we can inspect is the configuration, which is where this failure almost always comes
 * from. If the page is served from one origin and the API is configured at another, every
 * request is cross-origin and will be blocked unless the API names that exact origin in
 * CORS_ORIGINS. Same-origin comparison is textual — `localhost` and `127.0.0.1` are the same
 * machine and different origins — so this is easy to hit by typing the address a different
 * way, which is exactly how it was hit here.
 *
 * The distinction matters because the two failures need opposite responses. "Check your
 * connection" sends somebody to look at their network while the server is answering
 * perfectly well; naming the mismatch points at the one line of configuration that is wrong.
 */
export function explainNetworkFailure(
  /*
   * Both inputs are injectable so this can be reasoned about — and tested — without a DOM.
   * They default to the real values, so every caller passes nothing.
   */
  apiBase: string = API_BASE_URL,
  pageOrigin: string | undefined = typeof window === 'undefined' ? undefined : window.location.origin,
): string {
  const generic = 'Cannot reach the server. It may be down, or your connection may have dropped.'

  // No configured base URL means same-origin calls, which cannot be a CORS problem.
  if (!apiBase || !pageOrigin) return generic

  let api: URL
  let page: URL
  try {
    page = new URL(pageOrigin)
    api = new URL(apiBase, pageOrigin)
  } catch {
    return generic
  }

  if (api.origin === page.origin) return generic

  /*
   * Different origins. This is still not proof — the API could also simply be down — so the
   * wording offers the mismatch as the likely cause rather than asserting it, and gives the
   * address that would resolve it.
   */
  return (
    `Cannot reach the server. This page is served from ${page.origin} `
    + `but the API is configured at ${api.origin}. Those are different origins, so the browser `
    + `blocks the response unless the API allows this one. `
    + `Try opening the app at ${api.protocol}//${api.hostname}:${page.port || '80'} `
    + `— or check CORS_ORIGINS on the server. If the addresses look right, the API may be down.`
  )
}
