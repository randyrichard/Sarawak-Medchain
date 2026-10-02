import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * A piece of view state - the open tab, a filter - kept in the URL instead of in memory.
 *
 * Jakob's law: people spend most of their time on other sites, and on those sites the URL is
 * the view. Back returns to the tab you were on, refresh keeps it, and a copied link opens
 * the same thing for a colleague. A tab held in `useState` breaks all three: Back leaves the
 * page entirely, refresh snaps to the first tab, and "look at the Roles tab" cannot be sent
 * as a link.
 *
 * - `allowed` is the whitelist. A hand-edited or stale URL (`?tab=nonsense`) falls back to
 *   the default rather than rendering a view that does not exist.
 * - The default value is left out of the URL, so a page's plain address stays plain.
 * - `push` (the default) makes each change a history entry, the way tabs behave on GitHub
 *   and Jira, so Back steps back through tabs. Pass `{ replace: true }` for state that
 *   changes on every keystroke, such as a search box, so Back is not a character-by-
 *   character undo.
 * - Every other query parameter is preserved, so a tab change keeps the filters set on it.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, (next: T, options?: { replace?: boolean }) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as T) : fallback

  const setValue = useCallback(
    (next: T, { replace = false }: { replace?: boolean } = {}) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === fallback || next === '') updated.delete(key)
          else updated.set(key, next)
          return updated
        },
        { replace },
      )
    },
    [key, fallback, setParams],
  )

  return [value, setValue]
}
