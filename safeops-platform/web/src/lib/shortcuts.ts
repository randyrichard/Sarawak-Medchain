/**
 * Keyboard shortcut helpers, so every shortcut in the product follows the conventions people
 * already use elsewhere (Jakob's law): ⌘ on a Mac and Ctrl everywhere else, `/` to search as
 * on GitHub, Gmail and YouTube, `?` for the list of shortcuts as on GitHub and Gmail.
 */

/** True on macOS and iOS, where the command key - not Ctrl - is the modifier people reach for. */
export function isApplePlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined =
  typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false
  return /mac|iphone|ipad|ipod/i.test(nav.platform || nav.userAgent)
}

/**
 * The label for "modifier + key" on this platform: "⌘K" on a Mac, "Ctrl K" elsewhere.
 * The search box said ⌘K to everyone, which is a symbol most Windows users have never
 * pressed and cannot find on their keyboard.
 */
export function modKey(key: string, apple = isApplePlatform()): string {
  return apple ? `⌘${key}` : `Ctrl ${key}`
}

/**
 * Whether a key press belongs to whatever the person is typing into, so a single-key
 * shortcut must leave it alone. Typing "/" or "?" into a description is text, not a command.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  // Checkboxes, radios and buttons take no text, so shortcuts still work while they have focus.
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type)
}

/** Event that asks the shortcuts dialog to open, from anywhere (the account menu, a link). */
export const OPEN_SHORTCUTS_EVENT = 'safeops:open-shortcuts'
export const openShortcuts = () => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))
