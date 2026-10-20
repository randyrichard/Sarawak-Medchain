/*
 * Names for JSA rows that were written before the server had ever heard of them, and the
 * server ids they turn out to have.
 *
 * A job safety analysis is written at a desk and walked down at the job. Amending a row
 * there always worked, because every cell edit is addressed by the row's server id and the
 * row already existed. A hazard found *at* the job had no such id — so adding a row with no
 * signal was refused, and a crew that found an unguarded opening was told to come back when
 * there was coverage.
 *
 * So the device names the row itself, the queued `jsa-add` carries that name, and the
 * server keeps it beside the id it generates. This file is the other half: when the add
 * finally lands, the reply says which server row the name became, and every amendment still
 * addressed by the local name has to find its way to it.
 *
 * Why this outlives the queue entry rather than being fixed up inside it. Rewriting the
 * queued amendments as the add drains would cover the ordinary case — the queue drains
 * oldest-first, so the add always goes before its edits — but not the one that follows it:
 * the add lands, its entry is gone, the table on screen still shows the row under the name
 * the device gave it, and the next cell the supervisor corrects is addressed by a name the
 * queue can no longer translate. That amendment would be refused by a server that has never
 * heard of the row, and a correction made to a control is not a thing to lose. So the
 * translation is kept where it can be read later, and read at the moment of sending.
 *
 * localStorage, not the IndexedDB outbox: these are a handful of short strings with no
 * bytes attached, and the table needs to look one up while rendering a keystroke.
 */

/** How many translations to keep. Far more rows than one shift of one crew will add. */
const LIMIT = 500

const KEY = 'safechain.jsa-local-ids'

/**
 * The fallback when localStorage is unavailable or refuses a write — a locked-down device,
 * a private window, a full quota.
 *
 * Lost when the tab closes, which is worse than persistence and much better than losing the
 * translation outright: within one session the add and its amendments drain together, and
 * that is the case this exists for.
 */
const memory = new Map<string, string>()

/** The name a device gives a row it has just invented. */
export function newLocalJsaId(): string {
  // randomUUID needs a secure context, which a plain-http staging host is not.
  const rand = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `local-jsa-${rand}`
}

/**
 * Is this a name the device made up, rather than a row the server knows?
 *
 * The prefix is what keeps the two apart with no lookup, and it is deliberately not a shape
 * a server id could take: a row addressed by the wrong kind of id is either an amendment
 * sent nowhere or an amendment sent to the wrong hazard.
 */
export const isLocalJsaId = (id: string): boolean => id.startsWith('local-jsa-')

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** Records what the server called the row the device named. */
export function rememberJsaId(localId: string, serverId: string): void {
  if (!isLocalJsaId(localId) || !serverId) return
  memory.set(localId, serverId)
  try {
    const map = load()
    delete map[localId]
    map[localId] = serverId
    // Oldest out first. Insertion order is the order of the object's own keys, which is
    // enough here: the only thing a stale translation costs is an amendment to a row
    // nobody has touched in hundreds of rows' time.
    const keys = Object.keys(map)
    for (const k of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete map[k]
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // The in-memory copy above still holds for this tab.
  }
}

/**
 * The id to address this row by: the server's, once it has one.
 *
 * Returns the id unchanged when it is already a server id, and the local name back when the
 * add has not landed yet — which the caller has to read as "the server does not know this
 * row", not as a failure.
 */
export function resolveJsaId(id: string): string {
  if (!isLocalJsaId(id)) return id
  return memory.get(id) ?? load()[id] ?? id
}

/** Drops a translation, for a locally-created row that was discarded before it ever synced. */
export function forgetJsaId(localId: string): void {
  memory.delete(localId)
  try {
    const map = load()
    if (!(localId in map)) return
    delete map[localId]
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch { /* nothing kept, nothing to clear */ }
}
