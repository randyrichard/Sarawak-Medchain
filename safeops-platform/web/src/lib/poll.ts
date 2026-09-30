/**
 * Repeats `tick` every `intervalMs`, but only while the page is visible.
 *
 * The notification bell, the permit board and the admin overview each refresh on a timer.
 * A plain setInterval keeps firing in every background tab - one left open overnight
 * makes a request every few seconds until morning, each one a database query - and that
 * load grows with every user and every tab, not with anything anybody is looking at.
 *
 * While the page is hidden the ticks are skipped. The moment it is shown again, one runs
 * straight away if any were skipped, so what the person sees is no staler than before:
 * they get fresh data exactly when they look, rather than on the next tick.
 *
 * Returns the cleanup, for a useEffect to return.
 */
export function pollWhileVisible(
  tick: () => unknown,
  intervalMs: number,
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
): () => void {
  let missed = false
  const timer = setInterval(() => {
    if (doc.visibilityState === 'hidden') {
      missed = true
      return
    }
    tick()
  }, intervalMs)

  const onVisibility = () => {
    if (doc.visibilityState !== 'hidden' && missed) {
      missed = false
      tick()
    }
  }
  doc.addEventListener('visibilitychange', onVisibility)

  return () => {
    clearInterval(timer)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
