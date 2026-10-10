// ─── Authenticated request helper ────────────────────────────────────────────
// Shared by every HTTP client that talks to the SafeChain API.

import { API_BASE_URL, authApi, getAccessToken, isBackendConfigured, SESSION_CHANGED } from './authApi'
import { explainNetworkFailure } from './networkError'
import { ApiError } from './types'

/**
 * How long to wait before each retry of a read that got no answer. Two retries, about two
 * seconds in all: long enough to ride out a dropped packet on site wifi or a phone moving
 * between cells, or the API restarting during a deploy; short enough that a real outage is
 * still reported promptly. Mutable only so tests need not wait.
 */
export const READ_RETRY_DELAYS_MS = [500, 1500]

/**
 * Statuses that mean "the API did not answer" rather than "the API said no": what the
 * reverse proxy returns while the API restarts or is briefly overloaded.
 */
const NO_ANSWER = new Set([502, 503, 504])

/** The public offline demo build (scripts/build-demo.mjs). A build-time constant in the bundle. */
const offlineDemoBuild = () => import.meta.env.VITE_OFFLINE_DEMO === 'true'

const isRead = (init: RequestInit) => !init.method || ['GET', 'HEAD'].includes(init.method.toUpperCase())
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Single request.
 *
 * A read that gets no answer is tried again (READ_RETRY_DELAYS_MS). On localhost a request
 * never fails half-way; on a site's wifi or a phone at the edge of coverage it regularly
 * does, and without this one lost packet turned a whole screen into an error. Only reads are
 * retried, because sending one twice changes nothing. A write that got no answer may still
 * have been done, so it is never repeated blindly: it reports the failure, and incident
 * reports - the write that matters most in the field - go through the outbox, which retries
 * with an idempotency key so the server can tell a repeat from a new report.
 *
 * Refreshes a stale access token before the call rather than after a 401, so a normal
 * user action never fails on an expired token. A 401 that still comes back means the
 * session is genuinely gone, and one retry is attempted before giving up.
 */
export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  /*
   * The public demo has no server: nothing to ask. Sending the request anyway reached
   * the static host - index.html for a read, a 405 for a write (every sign-in on the
   * Cloudflare demo tried POST /auth/refresh) - only to arrive at the same answer below.
   * Only the demo build: elsewhere an empty base URL can mean "same origin".
   */
  if (offlineDemoBuild() && !isBackendConfigured()) throw new ApiError(NOT_API, notApiMessage())
  try {
    await authApi.refreshIfNeeded()
  } catch (e) {
    /*
     * A refresh that simply failed is not fatal: let the request go and surface the real
     * 401 below, which says something more useful than a guess made here.
     *
     * A refresh that came back for somebody else is fatal, and must not be swallowed. The
     * refresh cookie is shared by every tab, so the token now belongs to whoever signed in
     * on this browser since - and sending the request would file it under their name.
     */
    if (e instanceof ApiError && e.code === SESSION_CHANGED) throw e
  }

  const isForm = init.body instanceof FormData
  const send = () => fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...init.headers,
    },
  })
  const retries = isRead(init) ? READ_RETRY_DELAYS_MS : []
  let res: Response | undefined
  for (let attempt = 0; ; attempt++) {
    try {
      res = await send()
      if (!NO_ANSWER.has(res.status) || attempt >= retries.length) break
    } catch {
      // A request the caller cancelled is not a failure to retry.
      if (init.signal?.aborted || attempt >= retries.length) {
        /*
         * Network-level failure. Kept distinct from a server rejection so the UI can offer
         * "retry" rather than a validation-style message — and now explained, because a
         * browser reports a blocked cross-origin request and a dead server identically, and
         * telling somebody to "check your connection" while the server answers fine sends
         * them to debug the wrong thing entirely.
         */
        throw new ApiError('network', explainNetworkFailure())
      }
    }
    await wait(retries[attempt])
  }

  if (res.status === 401 && retry) {
    try {
      await authApi.refreshIfNeeded()
      return await request<T>(path, init, false)
    } catch (e) {
      // "Your session has expired" would be false here: it is alive and belongs to
      // somebody else, which is the thing the reader has to be told.
      if (e instanceof ApiError && e.code === SESSION_CHANGED) throw e
      throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.')
    }
  }

  if (res.status === 204) return undefined as T

  const parsed = await res.json().then((b) => ({ ok: true as const, b }), () => ({ ok: false as const, b: {} }))
  const body = parsed.b
  if (!res.ok) {
    throw new ApiError(body.error ?? 'request_failed', body.message ?? 'Something went wrong.')
  }
  /*
   * A success that is not JSON is not data.
   *
   * This used to fall back to `{}` and return it as the result. Whatever answered was not
   * the API - typically the web server's own index.html, sent with 200 for any unknown
   * path, when VITE_API_BASE_URL is unset (the offline demo) or points at the web app
   * instead of the API. Every screen then received `{}` in place of its data and crashed
   * on the first field it read: the dashboard, the incident board, Workforce, Contractors,
   * Visitors and HSE Performance all did. As an error, each shows its own error state.
   */
  if (!parsed.ok) throw new ApiError(NOT_API, notApiMessage())
  return body as T
}

/** Error code for a successful reply that was not the SafeChain API answering. */
export const NOT_API = 'not_api'

const notApiMessage = () => isBackendConfigured()
  ? 'The server sent back something that is not SafeChain data. Check that VITE_API_BASE_URL points at the SafeChain API, not the web app.'
  : offlineDemoBuild()
    // Read by prospects on the public demo, who have no build to reconfigure.
    ? 'This part of SafeChain needs the SafeChain server, which the online demo does not include.'
    : 'This screen needs the SafeChain server, and the offline demo does not include it. Set VITE_API_BASE_URL to the API address to use it.'

/** Query string builder that drops empty, null and undefined values. */
export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  return p.toString()
}

/**
 * Upload a multipart body with real progress.
 *
 * XHR rather than fetch: fetch still cannot report upload progress, and a 10 MB photo over
 * site wifi with no progress bar looks like a hung screen.
 *
 * Lives here rather than in a feature client so there is one implementation of the upload
 * contract to keep correct - the Authorization header, the credentialled request, and
 * parsing the server's message out of a failure rather than showing "Upload failed".
 */
export function upload<T>(
  path: string, form: FormData, onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    xhr.withCredentials = true
    const token = getAccessToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
      } else {
        // The server explains why it refused the file. Saying "Upload failed" instead
        // leaves someone re-trying a .exe forever.
        reject(new Error((body as { message?: string })?.message ?? 'Upload failed.'))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'))
    xhr.send(form)
  })
}

/**
 * Fetch a stored file as a blob.
 *
 * A plain link cannot carry the Authorization header, and the endpoint re-checks
 * membership on every request - a stored filename grants nothing on its own. The caller
 * builds its own object URL, which also keeps a crafted file out of the app origin.
 */
export async function blob(path: string): Promise<Blob> {
  const token = getAccessToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Could not download that file.')
  return res.blob()
}
