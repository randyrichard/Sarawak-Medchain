'use client';

/**
 * API client with automatic token attachment and refresh-token rotation.
 */
// PaaS blueprints (e.g. Render fromService) may provide a bare hostname
const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005';
const API_URL = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;

export interface SessionUser {
  id: string;
  role:
    | 'SUPER_ADMIN'
    | 'STATE_ADMIN'
    | 'HOSPITAL_ADMIN'
    | 'CLINIC_ADMIN'
    | 'DOCTOR'
    | 'EMPLOYER'
    | 'PATIENT';
  fullName: string;
  email: string;
  facilityId: string | null;
  mustChangePassword?: boolean;
}

const STORAGE_KEY = 'emc_session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null): void {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('emc-session-changed'));
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

async function rawFetch(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Single-flight refresh. Refresh tokens rotate on every use and the API
 * treats reuse of a rotated token as theft (revoking every session), so
 * concurrent 401s must NOT each fire their own refresh — they share one
 * in-flight refresh and reuse its result.
 */
let refreshInFlight: Promise<Session | null> | null = null;

async function refreshSession(refreshToken: string): Promise<Session | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await rawFetch('/api/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          setSession(null);
          return null;
        }
        const next = (await res.json()) as Session;
        setSession(next);
        return next;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Fetch with one transparent refresh-and-retry on 401. */
async function fetchWithRefresh(path: string, init: RequestInit = {}): Promise<Response> {
  const session = getSession();
  const res = await rawFetch(path, init, session?.accessToken);
  if (res.status !== 401 || !session?.refreshToken) return res;
  const next = await refreshSession(session.refreshToken);
  if (!next) return res;
  return rawFetch(path, init, next.accessToken);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithRefresh(path, init);
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string })?.error ?? 'Request failed', (body as { details?: unknown })?.details);
  }
  return body as T;
}

export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const res = await fetchWithRefresh(path, init);
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  return res.blob();
}

/** Trigger a browser download of an authenticated endpoint's blob response. */
export async function downloadFile(path: string, filename: string, init: RequestInit = {}): Promise<void> {
  const blob = await apiBlob(path, init);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { API_URL };
