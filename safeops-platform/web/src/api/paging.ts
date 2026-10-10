/**
 * Drains a paged endpoint.
 *
 * The list screens are not paginated: they ask for one page and render it. That is fine
 * at demo volume and wrong at customer volume — measured against 5,012 incidents, the
 * interface reached 100 of them and the header's count, derived from the loaded page,
 * was wrong too. A user cannot tell a record is missing, which is worse than an error.
 *
 * Rather than rebuild five list screens, this walks the pages the server already returns
 * and hands back the whole set. The server keeps doing the filtering and ordering; the
 * client just stops stopping after the first page.
 *
 * It is bounded on purpose. Beyond MAX_ROWS the honest answer is that these screens need
 * real pagination, and silently rendering fifty thousand rows would trade a correctness
 * bug for a browser that stops responding. When the bound is hit, `complete` is false and
 * the caller can say so.
 */

/** Ceiling on rows drained into one view. Above this, the screen needs proper paging. */
export const MAX_ROWS = 2000

/** Ceiling on requests, so a server reporting a bad `total` cannot spin forever. */
const MAX_REQUESTS = 40

export interface Paged<T> {
  rows: T[]
  total: number
}

export interface Drained<T> {
  rows: T[]
  /** What the server says exists, which may exceed `rows.length`. */
  total: number
  /** False when the bound stopped the walk before the end of the data. */
  complete: boolean
}

/**
 * Calls `fetchPage` from page 1 until every row is in hand or a bound is reached.
 *
 * Pages are fetched in sequence, not in parallel: the row count is only known after the
 * first response, and firing speculative requests at a customer's API to save a few
 * hundred milliseconds is a poor trade.
 */
export async function drain<T>(
  fetchPage: (page: number, pageSize: number) => Promise<Paged<T>>,
  pageSize = 100,
): Promise<Drained<T>> {
  const first = await fetchPage(1, pageSize)
  const rows = [...first.rows]
  const total = first.total ?? rows.length

  let page = 1
  while (rows.length < total && rows.length < MAX_ROWS && page < MAX_REQUESTS) {
    page++
    const next = await fetchPage(page, pageSize)
    if (next.rows.length === 0) break // server disagrees with its own total; stop.
    rows.push(...next.rows)
  }

  const complete = rows.length >= total
  if (!complete) {
    // Discoverable in support without a screen change. Above this volume the list screens
    // need real pagination, and a customer reporting "I can't find last year's report"
    // should leave a trace in their console rather than a mystery.
    // eslint-disable-next-line no-console
    console.warn(
      `[SafeChain] Showing ${Math.min(rows.length, MAX_ROWS)} of ${total} records. ` +
        'This list is capped; narrow the filters to reach the rest.',
    )
  }

  return { rows: rows.slice(0, MAX_ROWS), total, complete }
}

/** Convenience for callers that only want the rows. */
export async function drainRows<T>(
  fetchPage: (page: number, pageSize: number) => Promise<Paged<T>>,
  pageSize = 100,
): Promise<T[]> {
  return (await drain(fetchPage, pageSize)).rows
}
