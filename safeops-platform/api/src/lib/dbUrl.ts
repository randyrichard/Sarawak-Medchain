/**
 * A database URL with its pool size set, whatever the URL said before.
 *
 * Every process sizes its pool from DATABASE_URL's connection_limit. The worker runs its
 * sweeps one after another and needs a handful of connections, but inherited the API's 20
 * - so each worker cost as much of PostgreSQL's 100 as an API replica, and four replicas
 * plus a worker left nothing for pg_dump or a psql session during an incident. The worker
 * sets its own, smaller limit here, including on a managed DATABASE_URL given wholesale.
 */
export function withConnectionLimit(url: string, limit: number): string {
  const u = new URL(url)
  u.searchParams.set('connection_limit', String(limit))
  return u.toString()
}
