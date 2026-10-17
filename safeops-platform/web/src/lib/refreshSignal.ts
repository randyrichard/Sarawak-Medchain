/**
 * "Refresh" pressed on one page, heard by everything else showing the same records.
 *
 * Home's Refresh reloaded Home. The counts beside the menu and the bell's unread number
 * are read by the shell, on their own schedules, so after a refresh they could still show
 * the figures from a minute before - two answers on one screen to the same question.
 * Whatever reloads on its own timer also listens here, and reloads now.
 */
const EVENT = 'safechain:refresh'

export function announceRefresh(): void {
  window.dispatchEvent(new Event(EVENT))
}

/** Calls `listener` on every refresh until the returned function is called. */
export function onRefresh(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
