/**
 * Registers the service worker that lets the app boot with no network (public/sw.js).
 *
 * Production builds only. In development Vite serves unbundled modules whose URLs change
 * with every edit, and a shell cache in front of that produces the worst class of bug there
 * is: a stale module served to a developer who is looking at new source. `npm run preview`
 * is the way to exercise this locally.
 */

/** Set once a worker is in `waiting` — a new build is installed and ready for the next load. */
let waiting: ServiceWorker | null = null

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /*
   * After load, not during it. Registration competes with the app's own first requests for
   * the connection, and the install fetches the whole shell — on site wifi that measurably
   * delays first paint for a benefit that only matters on the *next* load.
   */
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        if (!next) return
        next.addEventListener('statechange', () => {
          // `waiting` with a controller already present means this is an update rather
          // than a first install, and the old shell is still driving the open page.
          if (next.state === 'installed' && navigator.serviceWorker.controller) waiting = next
        })
      })
    }).catch(() => {
      /*
       * Registration fails on an insecure origin, with storage blocked, or in a private
       * window. None of those is worth a message: the app works exactly as it did before
       * this file existed, it just will not open without a network.
       */
    })
  })
}

/** Is a newer build installed and waiting for the page to let it take over? */
export const updateReady = () => waiting !== null

/**
 * Hands the page over to a newly installed build, then reloads.
 *
 * Only safe from a standing start — nothing part-finished on screen, no permit drawer open
 * over a form somebody is filling in. The worker refuses to skip waiting on its own for
 * that reason (see public/sw.js), so this is the one route to it and the caller owns the
 * judgement about when.
 */
export function applyUpdate() {
  if (!waiting) return
  waiting.postMessage('skip-waiting')
  waiting = null
  // The new worker claims the page on activate; reloading once it has is what swaps the
  // assets. `controllerchange` is the event that says the swap actually happened.
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
}
