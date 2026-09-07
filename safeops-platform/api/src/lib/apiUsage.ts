import { Prisma, type PrismaClient } from '@prisma/client'

/**
 * What the integration API served, counted per key per day.
 *
 * A rollup and not a request log, deliberately. The console asks two questions - how many
 * calls today, and how did the last week look - and keeping every request to answer them
 * would create a second dataset larger and more sensitive than the first: request paths
 * carry incident ids, and a log of which records an integration read is a log of what the
 * customer's contractor was looking at. Counts answer both questions and carry neither.
 *
 * This replaces `ApiKey.callsToday`, a column set to zero at issuance, incremented by
 * nothing, and reset by nobody - so the console's usage figure was always zero and its
 * midnight rollover was a job that did not exist. A day-keyed row has no rollover.
 */

/** UTC midnight, matching every other date-only value in this codebase. */
export function utcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Adds to today's row, creating it if this is the day's first call.
 *
 * Written through Prisma's typed client rather than raw SQL. That is not a style
 * preference: `day` is a `TIMESTAMP` without a zone, and a JS `Date` sent through
 * `$queryRaw` is serialised as local time and read back as UTC - an eight-hour error on a
 * UTC+8 host, which is exactly the bug the rate-limit store had to be rewritten to avoid.
 * The typed path does not have that problem.
 *
 * `upsert` can lose a race between two concurrent first calls; the loser gets P2002 and
 * increments instead. Anything else is swallowed, because a metering failure must never
 * be the reason an integration's request fails.
 */
async function bump(
  db: PrismaClient, apiKeyId: string, companyId: string, field: 'calls' | 'errors',
): Promise<void> {
  const day = utcDay()
  try {
    await db.apiUsageDay.upsert({
      where: { apiKeyId_day: { apiKeyId, day } },
      update: { [field]: { increment: 1 } },
      create: { apiKeyId, companyId, day, calls: field === 'calls' ? 1 : 0, errors: field === 'errors' ? 1 : 0 },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await db.apiUsageDay.update({
        where: { apiKeyId_day: { apiKeyId, day } },
        data: { [field]: { increment: 1 } },
      }).catch(() => undefined)
      return
    }
    // eslint-disable-next-line no-console
    console.error('[safeops-api-usage] could not record a call:', e)
  }
}

/** Counts a request, and marks the key as used. */
export async function countApiCall(
  db: PrismaClient, apiKeyId: string, companyId: string,
): Promise<void> {
  await Promise.all([
    bump(db, apiKeyId, companyId, 'calls'),
    db.apiKey.update({ where: { id: apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined),
  ])
}

/** Counts a request that answered 4xx or 5xx. */
export async function countApiError(
  db: PrismaClient, apiKeyId: string, companyId: string,
): Promise<void> {
  await bump(db, apiKeyId, companyId, 'errors')
}

export interface UsagePoint {
  label: string
  calls: number
  errors: number
}

/**
 * The last `days` days for one workspace, oldest first, with empty days present as zero.
 *
 * Gaps are filled rather than omitted so the chart's bars line up with real dates. A
 * series that silently skips a quiet Sunday draws a week that never happened.
 */
export async function usageSeries(
  db: PrismaClient, companyId: string, days = 7,
): Promise<{ series: UsagePoint[]; totalToday: number; errorRate: number }> {
  const today = utcDay()
  const from = new Date(today.getTime() - (days - 1) * 86_400_000)

  const rows = await db.apiUsageDay.groupBy({
    by: ['day'],
    where: { companyId, day: { gte: from } },
    _sum: { calls: true, errors: true },
  })
  const byDay = new Map(rows.map((r) => [r.day.getTime(), r._sum]))

  const series: UsagePoint[] = []
  for (let i = 0; i < days; i += 1) {
    const d = new Date(from.getTime() + i * 86_400_000)
    const sum = byDay.get(d.getTime())
    series.push({
      // Three-letter weekday in UTC, which is the day the row is keyed by. Formatting it
      // in the server's local zone would label a UTC row with a neighbouring day's name.
      label: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      calls: sum?.calls ?? 0,
      errors: sum?.errors ?? 0,
    })
  }

  const totalToday = byDay.get(today.getTime())?.calls ?? 0
  const calls = series.reduce((s, p) => s + p.calls, 0)
  const errors = series.reduce((s, p) => s + p.errors, 0)
  return {
    series,
    totalToday,
    // One decimal place, and zero rather than NaN for a week with no traffic at all.
    errorRate: calls === 0 ? 0 : Math.round((errors / calls) * 1000) / 10,
  }
}

/** Today's call count for each of the given keys, for the per-key column in the console. */
export async function callsTodayByKey(
  db: PrismaClient, apiKeyIds: string[],
): Promise<Map<string, number>> {
  if (apiKeyIds.length === 0) return new Map()
  const rows = await db.apiUsageDay.findMany({
    where: { apiKeyId: { in: apiKeyIds }, day: utcDay() },
    select: { apiKeyId: true, calls: true },
  })
  return new Map(rows.map((r) => [r.apiKeyId, r.calls]))
}
