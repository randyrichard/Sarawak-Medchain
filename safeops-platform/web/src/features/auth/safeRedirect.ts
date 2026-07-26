/**
 * Open-redirect guard for post-login navigation.
 *
 * Only an absolute, same-origin *internal* path is allowed as a redirect target.
 * Anything protocol-relative (`//evil.com`), backslash-tricked (`/\evil.com` — the
 * vector behind the React Router open-redirect advisory), an absolute URL, or
 * containing control characters falls back to the home route.
 */
export function safeInternalPath(path: string | null | undefined, fallback = '/'): string {
  if (typeof path !== 'string' || path.length === 0) return fallback
  // Must be an absolute internal path.
  if (path[0] !== '/') return fallback
  // Reject protocol-relative ("//host") and backslash tricks ("/\host").
  if (path[1] === '/' || path[1] === '\\') return fallback
  // Reject control characters (< 0x20) that can smuggle a scheme or split the URL.
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) < 0x20) return fallback
  }
  return path
}
