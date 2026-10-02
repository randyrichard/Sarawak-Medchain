import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { PrismaClient } from '@prisma/client'
import { JOBS, readJobRuns } from './jobRuns.js'

/**
 * Prometheus metrics for the API, in the text exposition format, with no dependency.
 *
 * The questions an operator asks during an incident, each answerable from one series:
 *
 *   - is it up, and is the database reachable?       safeops_up, safeops_db_up
 *   - is it erroring, and where?                     safeops_http_requests_total{status}
 *   - is it slow, and where?                         safeops_http_request_duration_seconds
 *   - is the background work running?                safeops_job_last_success_age_seconds
 *   - is the process healthy?                        memory, event-loop delay, uptime
 *
 * Routes are labelled by their template (`/incidents/:id`), never the raw path: a raw path
 * carries record ids, so every incident would become its own series and the metrics store
 * would grow without bound. A request that matched no route is labelled `unmatched`.
 */

const BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

interface Histogram { buckets: number[]; sum: number; count: number }

const requests = new Map<string, number>()
const durations = new Map<string, Histogram>()
const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.enable()

const key = (labels: Record<string, string>) => JSON.stringify(labels)

/** Records one finished HTTP request. */
export function observeRequest(method: string, route: string, status: number, seconds: number): void {
  const counterKey = key({ method, route, status: String(status) })
  requests.set(counterKey, (requests.get(counterKey) ?? 0) + 1)

  const histKey = key({ method, route })
  let h = durations.get(histKey)
  if (!h) {
    h = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }
    durations.set(histKey, h)
  }
  BUCKETS.forEach((le, i) => { if (seconds <= le) h!.buckets[i] += 1 })
  h.sum += seconds
  h.count += 1
}

/** Clears the HTTP series. For tests only. */
export function resetMetrics(): void {
  requests.clear()
  durations.clear()
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function labelText(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`)
  return parts.length ? `{${parts.join(',')}}` : ''
}

/**
 * The whole exposition. Reads the database twice - a `SELECT 1` and the job history - so a
 * scrape also answers "can the API reach Postgres" without a separate probe.
 */
export async function renderMetrics(db: PrismaClient): Promise<string> {
  const out: string[] = []
  const metric = (name: string, type: string, help: string) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
  }

  metric('safeops_up', 'gauge', 'Always 1 while the API process answers.')
  out.push('safeops_up 1')

  let dbUp = 0
  try {
    await db.$queryRaw`SELECT 1`
    dbUp = 1
  } catch { /* reported as 0 */ }
  metric('safeops_db_up', 'gauge', 'Whether the API could reach PostgreSQL during this scrape.')
  out.push(`safeops_db_up ${dbUp}`)

  metric('safeops_http_requests_total', 'counter', 'HTTP requests, by method, route template and status.')
  for (const [k, n] of requests) out.push(`safeops_http_requests_total${labelText(JSON.parse(k))} ${n}`)

  metric('safeops_http_request_duration_seconds', 'histogram', 'HTTP request duration, by method and route template.')
  for (const [k, h] of durations) {
    const labels = JSON.parse(k) as Record<string, string>
    BUCKETS.forEach((le, i) => {
      out.push(`safeops_http_request_duration_seconds_bucket${labelText({ ...labels, le: String(le) })} ${h.buckets[i]}`)
    })
    out.push(`safeops_http_request_duration_seconds_bucket${labelText({ ...labels, le: '+Inf' })} ${h.count}`)
    out.push(`safeops_http_request_duration_seconds_sum${labelText(labels)} ${h.sum}`)
    out.push(`safeops_http_request_duration_seconds_count${labelText(labels)} ${h.count}`)
  }

  /*
   * Background work, from the job history the worker writes. Age since the last successful
   * finish - the number an alert wants ("reminders have not run for an hour") - and whether
   * the most recent run failed. A job that has never run reports no age, so an alert on a
   * fresh install does not fire before the first pass.
   */
  if (dbUp) {
    try {
      const runs = await readJobRuns(db)
      metric('safeops_job_last_success_age_seconds', 'gauge', 'Seconds since each background job last finished successfully.')
      metric('safeops_job_last_run_failed', 'gauge', '1 when the most recent run of a job failed.')
      const now = Date.now()
      for (const job of JOBS) {
        const r = runs[job]
        if (!r) continue
        if (r.lastOk && r.lastFinishedAt) {
          out.push(`safeops_job_last_success_age_seconds{job="${job}"} ${Math.round((now - Date.parse(r.lastFinishedAt)) / 1000)}`)
        }
        out.push(`safeops_job_last_run_failed{job="${job}"} ${r.lastOk ? 0 : 1}`)
      }
    } catch { /* job history unreadable: the db_up series already says why */ }
  }

  const mem = process.memoryUsage()
  metric('process_resident_memory_bytes', 'gauge', 'Resident memory of the API process.')
  out.push(`process_resident_memory_bytes ${mem.rss}`)
  metric('nodejs_heap_used_bytes', 'gauge', 'V8 heap in use.')
  out.push(`nodejs_heap_used_bytes ${mem.heapUsed}`)
  metric('process_uptime_seconds', 'gauge', 'Seconds since the API process started.')
  out.push(`process_uptime_seconds ${Math.round(process.uptime())}`)
  metric('nodejs_eventloop_delay_p99_seconds', 'gauge', 'p99 event-loop delay since the previous scrape: how long requests waited to be picked up.')
  out.push(`nodejs_eventloop_delay_p99_seconds ${(loopDelay.percentile(99) / 1e9).toFixed(4)}`)
  loopDelay.reset()

  return `${out.join('\n')}\n`
}
