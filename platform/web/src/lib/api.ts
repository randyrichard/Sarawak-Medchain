'use client';

/**
 * API client with automatic token attachment and refresh-token rotation.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005';

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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  let res = await rawFetch(path, init, session?.accessToken);

  // Transparent refresh on expiry
  if (res.status === 401 && session?.refreshToken) {
    const refreshRes = await rawFetch('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (refreshRes.ok) {
      const next = (await refreshRes.json()) as Session;
      setSession(next);
      res = await rawFetch(path, init, next.accessToken);
    } else {
      setSession(null);
    }
  }

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string })?.error ?? 'Request failed', (body as { details?: unknown })?.details);
  }
  return body as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const session = getSession();
  const res = await rawFetch(path, {}, session?.accessToken);
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  return res.blob();
}

export { API_URL };
