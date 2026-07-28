// ─── Authenticated request helper ────────────────────────────────────────────
// Shared by the HTTP clients that talk to the SafeOps API.
//
// `incidentsApi.ts` still carries its own private copy of this logic from the first
// vertical. The two are identical; this module is where they should converge, and the
// incident copy is left in place only because that module is not being touched here.

import { API_BASE_URL, authApi, getAccessToken } from './authApi'
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
    // Network-level failure — distinguishable from a server rejection so the UI can
    // offer "retry" rather than showing a validation-style message.
    throw new ApiError('network', 'Cannot reach the server. Check your connection and try again.')
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
