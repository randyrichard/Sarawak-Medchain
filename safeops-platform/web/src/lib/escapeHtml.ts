/**
 * Escapes a value for interpolation into an HTML string.
 *
 * This exists because three print views each defined their own, all with the same partial
 * implementation — `&` and `<` only — and because a local helper is a helper the next print
 * view will not know to copy. Whoever wrote the second one copied the first, including its
 * gaps, which is how a field ends up unescaped: not by anybody deciding to skip it, but by a
 * new interpolation being added next to ones that looked safe.
 *
 * The concrete miss was `audit.gps` in the audit report — free text captured from a device,
 * written straight into a document that is then handed to `document.write` in a new window.
 * React protects everything rendered through JSX; these print helpers build raw HTML strings
 * and step outside that protection entirely, which is exactly why they need this.
 *
 * All five characters, not two. `>` cannot begin a tag so escaping it is belt-and-braces,
 * but the quotes are not optional the moment anybody interpolates into an attribute — and
 * the whole failure mode here is somebody adding an interpolation later without re-deriving
 * which characters matter.
 *
 * Takes `unknown` deliberately. A helper that only accepts `string` invites callers to skip
 * it for a number or a possibly-null field, and "this one is a number so it is fine" is the
 * reasoning that leaves the next one unescaped when it stops being a number.
 */
const REPLACEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (c) => REPLACEMENTS[c])
}
