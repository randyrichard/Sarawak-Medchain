import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** History entries this hook added carry this mark, per parameter, in `location.state`. */
const mark = (key: string) => `openedRecord:${key}`

export interface OpenRecord {
  /** The id of the record open in the page's drawer, or null when none is. */
  id: string | null
  /** Show this record. */
  open: (id: string) => void
  /** Put the record away and return to the list. */
  close: () => void
}

/**
 * The record a list page has open in its drawer, kept in the address as `?open=<id>`.
 *
 * Drawers used to be held in component state, so the address never changed when one opened.
 * The browser's Back button - the first thing most people press to get out of something, and
 * the only one an Android phone has - then went back to the page *before* the list: open an
 * asset, press Back, and you were on Home with the list gone and no idea why. Now opening a
 * record adds a history entry, so Back closes the drawer and leaves you on the list, with its
 * filters and scroll where they were. A refresh keeps the record open, and the address can be
 * sent to a colleague.
 *
 * - `open` adds a history entry. Opening another record from inside the drawer swaps it in
 *   place instead, so one Back or one Close still returns to the list, not to the previous
 *   record.
 * - `close` steps back through the entry `open` added, so Close and Back leave the same
 *   history behind. A record that arrived by link (search, a notification, a QR label) has
 *   no entry of ours to step back through, so closing it removes it from the address in place.
 * - `aliases` are older names for the same parameter. Stored reminders and printed labels
 *   cannot be rewritten, so they are read, and cleared on close, but never written.
 */
export function useOpenRecord(key = 'open', ...aliases: string[]): OpenRecord {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const id = [key, ...aliases].map((k) => params.get(k)).find(Boolean) ?? null
  const state = (location.state ?? null) as Record<string, unknown> | null
  const addedByUs = Boolean(state?.[mark(key)])

  const go = useCallback(
    (next: string | null, options: { replace: boolean; state: unknown }) => {
      const updated = new URLSearchParams(location.search)
      for (const k of [key, ...aliases]) updated.delete(k)
      if (next) updated.set(key, next)
      const search = updated.toString()
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, options)
    },
    // `aliases` is a fresh array on every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, location.pathname, location.search, location.hash, key, aliases.join(',')],
  )

  const open = useCallback(
    (next: string) => {
      if (next === id) return
      if (id) go(next, { replace: true, state })
      else go(next, { replace: false, state: { ...state, [mark(key)]: true } })
    },
    [go, id, state, key],
  )

  const close = useCallback(() => {
    if (!id) return
    if (addedByUs) navigate(-1)
    else go(null, { replace: true, state })
  }, [go, id, addedByUs, navigate, state])

  return { id, open, close }
}
