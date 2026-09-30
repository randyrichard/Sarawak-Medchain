import { hostname } from 'node:os'
import type { PrismaClient } from '@prisma/client'

/**
 * Background job history, kept in the database.
 *
 * The scheduler's jobs used to note their last run in a Map in the memory of the process
 * that ran them. That was right while the API ran its own jobs and there was one API. It
 * stopped being right twice: behind the leader lock only one replica runs each pass, so
 * the others reported "never run"; and with jobs moved to a worker process, no API process
 * runs them at all. The row is the answer every process can read.
 */

/** The jobs the scheduler runs, keyed as stored. */
export const JOBS = ['reminders', 'expiry', 'equipment', 'visitors', 'reports', 'webhooks'] as const
export type JobKey = (typeof JOBS)[number]

/** Identifies this process in the history: two workers are then told apart. */
export const INSTANCE = `${hostname()}:${process.pid}`

export interface JobRunView {
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastOk: boolean
  lastError: string | null
  lastDurationMs: number | null
  instance: string | null
  runCount: number
  failureCount: number
}

/**
 * Records one run of a job. Never throws.
 *
 * History is for the operator; a sweep that did its work must not be reported as failed,
 * or retried, because the line saying so could not be written. A failure here is logged
 * and swallowed.
 */
export async function recordJobRun(
  db: PrismaClient, job: JobKey, startedAt: Date, error: unknown = null,
): Promise<void> {
  const finishedAt = new Date()
  const ok = error === null
  const message = ok ? null : firstLine(error)
  try {
    await db.jobRun.upsert({
      where: { job },
      create: {
        job, lastStartedAt: startedAt, lastFinishedAt: finishedAt, lastOk: ok, lastError: message,
        lastDurationMs: finishedAt.getTime() - startedAt.getTime(), instance: INSTANCE,
        runCount: 1, failureCount: ok ? 0 : 1,
      },
      update: {
        lastStartedAt: startedAt, lastFinishedAt: finishedAt, lastOk: ok, lastError: message,
        lastDurationMs: finishedAt.getTime() - startedAt.getTime(), instance: INSTANCE,
        runCount: { increment: 1 }, ...(ok ? {} : { failureCount: { increment: 1 } }),
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[safeops-jobs] could not record a run of ${job}:`, firstLine(err))
  }
}

/** Every job's last run; a job that has never run is null. */
export async function readJobRuns(db: PrismaClient): Promise<Record<JobKey, JobRunView | null>> {
  const rows = await db.jobRun.findMany()
  const byJob = new Map(rows.map((r) => [r.job, r]))
  return Object.fromEntries(JOBS.map((job) => {
    const r = byJob.get(job)
    return [job, r ? {
      lastStartedAt: r.lastStartedAt?.toISOString() ?? null,
      lastFinishedAt: r.lastFinishedAt?.toISOString() ?? null,
      lastOk: r.lastOk,
      lastError: r.lastError,
      lastDurationMs: r.lastDurationMs,
      instance: r.instance,
      runCount: r.runCount,
      failureCount: r.failureCount,
    } : null]
  })) as Record<JobKey, JobRunView | null>
}

/** The first line of an error, capped: enough to act on, never a stack or a payload. */
function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return (text.split('\n')[0] ?? '').slice(0, 300)
}
