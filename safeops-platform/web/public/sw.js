/*
 * Service worker: makes the app itself survive having no internet.
 *
 * The situation this exists for. A permit to work is signed at the job, not at a desk —
 * a confined space on a bund, a flare line, a pump house two hundred metres inside a plant
 * where there is no signal and no wifi. Before this, the outbox could hold an incident
 * report that failed to send, but only if the app was already running: a worker who locked
 * the phone walking to the job and opened it again at the worksite got the browser's
 * "no internet" page. Nothing to queue into, nothing to read, no permit on the screen.
 * The field answer was paper, which is the problem the product exists to replace.
 *
 * So the shell is cached, and the app boots with no network at all.
 *
 * What is deliberately NOT cached: anything from the API.
 *
 * Two reasons, and both matter more than the convenience would.
 *
 * Privacy first. Site phones are shared — one device, a shift's worth of people, passed
 * between them. API responses carry named workers' medical expiry, injury detail and
 * disciplinary context. A cache keyed by URL has no idea who is signed in, so a cached
 * response outlives the session that was allowed to see it. The outbox is keyed per user
 * for exactly this reason; a response cache cannot be.
 *
 * Then correctness, which is the same reason permits were taken out of localStorage in the
 * first place (see SERVER_PERMITS in src/api/client.ts): a permit board restored from a
 * cache can disagree with the plant. A permit that reads "active" on a phone while the
 * database says "suspended" is worse than a phone that admits it does not know — one of
 * those sends somebody into a confined space on a withdrawn authority.
 *
 * So: the shell is cached and the data is not. Offline, the app loads, says plainly what it
 * cannot reach, and lets the field record what happened into the outbox, which syncs later.
 *
 * Served with Cache-Control: no-store (nginx.conf.template), so a deploy is never pinned
 * behind a stale copy of this file.
 */

/*
 * Bump this when the shell logic below changes. Activation deletes every cache that is not
 * this one, which is how an old shell leaves. Asset files are content-hashed by the build,
 * so their entries are safe to keep within a version — stale bytes under a given URL are
 * not possible — but a renamed cache is the only way to evict a shell that has gone wrong.
 */
const VERSION = 'safechain-shell-v1'

/*
 * Precached at install so the very first offline load works, rather than only after the
 * user has happened to visit while online.
 *
 * '/' rather than '/index.html': that is the URL a navigation falls back to below, and the
 * two are separate cache entries even though nginx serves the same bytes for both.
 *
 * compat.js is here because it runs before the app and decides whether the browser is
 * supported at all. Without it a cached shell on an old browser renders a half-working page
 * instead of the explanation.
 */
const SHELL = ['/', '/compat.js', '/favicon.svg', '/manifest.webmanifest']

/*
 * Same-origin paths that are data, not shell, in case a deployment ever puts the API behind
 * the same hostname. Today it does not — the API is a separate origin named in the CSP's
 * connect-src — and the cross-origin check below already covers that. This is the belt to
 * that braces: if somebody later adds a proxy_pass, the privacy rule above must not quietly
 * stop holding.
 */
const API_PREFIXES = ['/api/', '/v1/', '/auth/']

/*
 * Shown only on a device that has never loaded the app with a connection, so it cannot rely
 * on any of the app's own styles being cached. Inline style attributes only: the CSP allows
 * those (style-src-attr 'unsafe-inline') and does not allow an injected <style> element.
 */
const OFFLINE_FIRST_RUN = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SafeChain — no connection</title></head>
<body style="margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#1b1f24">
<div style="max-width:28rem;margin:4rem auto;padding:0 1.5rem">
<h1 style="font-size:1.25rem;margin:0 0 .75rem">No connection, and nothing saved yet</h1>
<p style="margin:0 0 .75rem">SafeChain works without a signal once it has been opened on this
device at least once with one. This phone has not done that yet, so there is nothing here to
run.</p>
<p style="margin:0 0 1.5rem">Open SafeChain once where there is signal — the office, the
gate, a wifi connection — and it will work at the job after that.</p>
<a href="/" style="display:inline-block;padding:.625rem 1rem;background:#2a78d6;color:#fff;
border-radius:.375rem;text-decoration:none">Try again</a>
</div></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION)
    /*
     * Individually, not cache.addAll. addAll is atomic: one 404 rejects the whole install
     * and the worker never takes over, so a single renamed file in public/ would silently
     * cost every user offline support. A missing shell file should degrade, not disable.
     */
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)))
    await precacheEntry(cache)
  })())
})

/*
 * Caches the JavaScript and CSS the page needs to boot, at install.
 *
 * Without this, one online visit is not enough. A worker registers the service worker on
 * their first load — but registration happens after that page has already fetched its own
 * scripts, so those requests were never seen by this worker and nothing cached them. Go
 * offline at that point and the shell is served from cache, then every chunk 404s against a
 * dead network: a blank screen, which is worse than the honest "no connection" page below,
 * because it looks like the app is broken rather than unreachable.
 *
 * The filenames are content-hashed by the build and so cannot be listed here. They are read
 * out of index.html instead, which the build has just written and which names exactly the
 * entry files for this deployment. Only the entry is taken; the lazily-loaded page chunks
 * are cached as they are visited, because precaching all 109 of them at install would pull
 * the whole app over a site connection before anybody asked for a single screen.
 */
async function precacheEntry(cache) {
  try {
    const res = await fetch('/', { cache: 'reload' })
    if (!res.ok) return
    const html = await res.text()
    // src="/assets/index-abc123.js" and href="/assets/index-abc123.css", including the
    // modulepreload links Vite emits for the entry's shared chunks.
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await Promise.all([...new Set(urls)].map((u) => cache.add(u).catch(() => undefined)))
  } catch {
    // No network at install, or index.html was not parseable. The worker still installs and
    // still caches as pages are visited; this was the optimisation, not the mechanism.
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

/*
 * No skipWaiting, on purpose.
 *
 * skipWaiting would let a newly installed shell take over a page that is already running on
 * the previous build. The app code-splits, so a screen opened before the swap can then
 * lazily import a chunk whose hashed filename no longer exists on the server — the permit
 * drawer failing to open, mid-job, because a deploy happened. Waiting for the pages holding
 * the old worker to go away costs one extra load after a deploy and cannot do that.
 *
 * The page asks for the swap explicitly when it is safe (src/lib/serviceWorker.ts).
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})

/*
 * Looks a request up in the cache, ignoring Vary.
 *
 * `caches.match(request)` honours the Vary header of the stored response, and that is what
 * broke the first working version of this file. The server compresses, so it answers with
 * `Vary: Accept-Encoding` — and Accept-Encoding is set by the network stack, not by the
 * page, so it is absent from the Request object a service worker sees. The stored response
 * therefore never matched the script tag's request: with the server up nobody noticed,
 * because the fetch behind the cache lookup succeeded. With the server down, every asset
 * request missed the cache and then failed, and the app loaded to a blank page — the shell
 * cached, the code unreachable, which is the exact failure this worker exists to prevent.
 *
 * Measured on a real build: /login was served from cache, and index.js, react.js and
 * index.css all failed with ERR_FAILED while sitting in that same cache.
 *
 * Ignoring Vary is safe for what is cached here. Assets under /assets/ are content-hashed,
 * so one URL has exactly one body; the shell files are single-variant too. There is no
 * negotiated content in this cache for Vary to be protecting.
 */
const fromCache = (req) => caches.match(req, { ignoreVary: true })

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Writes are never served from or written to a cache. A queued write is the outbox's job,
  // and it holds the payload rather than a Request, so it survives a closed tab.
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Another origin: the API, and anything else. Left entirely alone — see the header.
  if (url.origin !== self.location.origin) return
  if (API_PREFIXES.some((p) => url.pathname.startsWith(p))) return

  /*
   * A navigation: the app being opened or reloaded.
   *
   * Network first, so a deploy is picked up as soon as there is signal and nobody is pinned
   * to an old build. Falling back to the cached shell is what makes an offline open work at
   * all; the SPA router then resolves the route client-side, which is why any path can be
   * answered from the one '/' entry.
   */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        /*
         * Cloned here, before the response is handed back, and this line is load-bearing.
         *
         * Cloning inside the `then` instead looks equivalent and is not: by the time
         * caches.open resolves, the page has started reading the body, and clone() on a
         * used response throws. The failure is silent — the fetch succeeds, the page
         * renders, and nothing is ever written to the cache. Measured on a real build
         * before this was fixed: the shell cached 4 files at install and 0 assets
         * afterwards, so an offline reload served index.html and then failed on every
         * script it asked for.
         *
         * Only a real page is worth keeping: an error page cached as the shell would be
         * served to every later offline load.
         */
        if (res.ok) {
          const copy = res.clone()
          void caches.open(VERSION).then((c) => c.put('/', copy))
        }
        return res
      } catch {
        const cached = await fromCache('/')
        if (cached) return cached
        /*
         * No network and nothing cached — the app has never been opened on this device
         * while online. A browser error page here reads as "SafeChain is broken", so it
         * says what is actually true and what to do about it.
         */
        return new Response(OFFLINE_FIRST_RUN, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
    })())
    return
  }

  /*
   * Build output under /assets/ is content-hashed, so a given URL's bytes never change.
   * Cache first: no revalidation, and the offline load does not wait on a network attempt
   * that is going to fail.
   */
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await fromCache(req)
      if (cached) return cached
      try {
        const res = await fetch(req)
        // Cloned before returning — see the note in the navigation branch above.
        if (res.ok) {
          const copy = res.clone()
          void caches.open(VERSION).then((c) => c.put(req, copy))
        }
        return res
      } catch (e) {
        /*
         * Offline and not in the cache: a page chunk for a screen this device has never
         * opened. Nothing can be served, and the rejection is the honest answer — but it
         * must not be the answer for a file that *is* cached, which is what `fromCache`
         * below exists to guarantee.
         */
        throw e
      }
    })())
    return
  }

  /*
   * Everything else same-origin: the icon, compat.js, robots.txt. Small, unhashed, and
   * allowed to change under a stable URL — so the network decides, and the cache is the
   * fallback rather than the answer.
   */
  event.respondWith((async () => {
    try {
      const res = await fetch(req)
      // Cloned before returning — see the note in the navigation branch above.
      if (res.ok) {
        const copy = res.clone()
        void caches.open(VERSION).then((c) => c.put(req, copy))
      }
      return res
    } catch {
      const cached = await fromCache(req)
      if (cached) return cached
      throw new Error('offline and not cached')
    }
  })())
})
