// ─── Authenticated request helper ────────────────────────────────────────────
// Shared by the HTTP clients that talk to the SafeOps API.
//
// `incidentsApi.ts` still carries its own private copy of this logic from the first
// vertical. The two are identical; this module is where they should converge, and the
// incident copy is left in place only because that module is not being touched here.

import { API_BASE_URL, authApi, getAccessToken } from './authApi'
import { explainNetworkFailure } from './networkError'
import { ApiError } from './types'

/**
 * Single request.
 *
 * Refreshes a stale access token before the call rather than after a 401, so a normal
 * user action never fails on an expired token. A 401 that still comes back means the
 * session is genuinely gone, and one retry is attempted before giving up.
 */
export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try {
    await authApi.refreshIfNeeded()
  } catch {
    // Refresh failed — let the request proceed and surface the real 401 below.
  }

  const isForm = init.body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    /*
     * Network-level failure. Kept distinct from a server rejection so the UI can offer
     * "retry" rather than a validation-style message — and now explained, because a browser
     * reports a blocked cross-origin request and a dead server identically, and telling
     * somebody to "check your connection" while the server answers fine sends them to
     * debug the wrong thing entirely.
     */
    throw new ApiError('network', explainNetworkFailure())
  }

  if (res.status === 401 && retry) {
    try {
      await authApi.refreshIfNeeded()
      return await request<T>(path, init, false)
    } catch {
      throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.')
    }
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error ?? 'request_failed', body.message ?? 'Something went wrong.')
  }
  return body as T
}

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
