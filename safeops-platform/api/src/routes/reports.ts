import { Router } from 'express'
import { z } from 'zod'
import { join, resolve } from 'node:path'
import { prisma } from '../lib/prisma.js'
import { env } from '../env.js'
import { ReportError, ReportService, REPORT_TYPE_LABEL } from '../lib/reportService.js'
import { renderReportPdf } from '../lib/reportPdf.js'
import { requireAuth } from '../http/requireAuth.js'
import { emailConfiguration } from '../lib/email/index.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * Scheduled reports.
 *
 * Literal paths before /:id, the same rule as every other router here: Express matches in
 * declaration order, and /reports/schedules would otherwise be looked up as a run whose id
 * happens to read "schedules".
 */
const svc = new ReportService(prisma)
export const reportsRouter = Router()

reportsRouter.use(requireAuth)

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const REPORT_TYPE = z.enum([
  'overdue_actions', 'open_investigations', 'monthly_summary', 'weekly_actions', 'site_activity',
])
const FREQUENCY = z.enum(['daily', 'weekly', 'monthly'])

// ── Catalogue and configuration ──────────────────────────────────────────────

/** What can be reported on, and whether email is actually wired up. */
reportsRouter.get('/catalog', (_req, res) => {
  res.json({
    types: (Object.keys(REPORT_TYPE_LABEL) as (keyof typeof REPORT_TYPE_LABEL)[])
      .map((key) => ({ key, label: REPORT_TYPE_LABEL[key] })),
    // Stated plainly so the UI can tell the operator the report will be generated but not
    // emailed, rather than implying an email is on its way. The provider name is safe to
    // show; nothing about its credentials ever leaves the server.
    ...emailConfiguration(),
    mailConfigured: svc.mailConfigured,
  })
})

// ── Preview and ad-hoc generation ────────────────────────────────────────────

const previewQuery = z.object({
  companyId: z.string().min(1),
  type: REPORT_TYPE,
  siteId: z.string().optional(),
  /** Narrows to a project's sites. Resolved and tenant-checked in the service. */
  projectId: z.string().optional(),
  /*
   * Which month to report on. Coerced because a query string carries text, and bounded
   * here as well as in the service so an absurd value is refused before any query runs.
   */
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  /** site_activity: today, or the last seven days. */
  period: z.enum(['day', 'week']).optional(),
})

/** The report as data, for the on-screen preview. */
reportsRouter.get('/preview', asyncRoute(async (req, res) => {
  const parsed = previewQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid report request.' })
  }
  const { companyId, type, ...opts } = parsed.data
  const data = await svc.preview(callerOf(req), companyId, type, opts)
  res.json({
    ...data,
    generatedAt: data.generatedAt.toISOString(),
    periodEnd: data.periodEnd.toISOString(),
    periodStart: data.periodStart?.toISOString() ?? null,
  })
}))

/** The same report as a PDF, generated on demand and streamed straight back. */
reportsRouter.get('/preview.pdf', asyncRoute(async (req, res) => {
  const parsed = previewQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid report request.' })
  }
  const { companyId, type, ...opts } = parsed.data
  const data = await svc.preview(callerOf(req), companyId, type, opts)
  const pdf = await renderReportPdf(data)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdf.fileName)}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(pdf.bytes)
}))

// ── Recipients ───────────────────────────────────────────────────────────────

reportsRouter.get('/recipients', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json({ rows: await svc.recipientOptions(callerOf(req), companyId) })
}))

// ── Schedules ────────────────────────────────────────────────────────────────

reportsRouter.get('/schedules', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json({ rows: await svc.listSchedules(callerOf(req), companyId) })
}))

const scheduleBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(160),
  reportType: REPORT_TYPE,
  frequency: FREQUENCY.default('weekly'),
  dayOfWeek: z.coerce.number().int().min(1).max(7).default(1),
  timeOfDay: z.string().max(5).default('08:00'),
  timezone: z.string().max(64).default('Asia/Kuching'),
  recipientUserIds: z.array(z.string()).min(1),
  siteId: z.string().nullable().optional(),
  /** A schedule may cover a whole project. Tenant-checked in the service, like siteId. */
  projectId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
})

reportsRouter.post('/schedules', asyncRoute(async (req, res) => {
  const parsed = scheduleBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'A name, report type and recipients are required.',
    })
  }
  const { companyId, ...rest } = parsed.data
  res.status(201).json(await svc.createSchedule(callerOf(req), companyId, rest, ctxOf(req)))
}))

const schedulePatch = z.object({
  name: z.string().min(1).max(160).optional(),
  frequency: FREQUENCY.optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  timeOfDay: z.string().max(5).optional(),
  timezone: z.string().max(64).optional(),
  recipientUserIds: z.array(z.string()).optional(),
  siteId: z.string().nullable().optional(),
  /** A schedule may cover a whole project. Tenant-checked in the service, like siteId. */
  projectId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
})

reportsRouter.patch('/schedules/:id', asyncRoute(async (req, res) => {
  const parsed = schedulePatch.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'That schedule update is not valid.' })
  }
  res.json(await svc.updateSchedule(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

reportsRouter.delete('/schedules/:id', asyncRoute(async (req, res) => {
  await svc.deleteSchedule(callerOf(req), req.params.id, ctxOf(req))
  res.status(204).end()
}))

/** Run now. Records a run, leaves the schedule's timing alone. */
reportsRouter.post('/schedules/:id/run', asyncRoute(async (req, res) => {
  res.json(await svc.runNow(callerOf(req), req.params.id, ctxOf(req)))
}))

// ── History ──────────────────────────────────────────────────────────────────

reportsRouter.get('/runs', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  const scheduleId = req.query.scheduleId ? String(req.query.scheduleId) : undefined
  res.json({ rows: await svc.history(callerOf(req), companyId, scheduleId) })
}))

/** The stored PDF for a run. Membership and role are re-checked on every request. */
reportsRouter.get('/runs/:id/file', asyncRoute(async (req, res) => {
  const run = await svc.runFile(callerOf(req), req.params.id)
  const dir = resolve(process.cwd(), env.UPLOAD_DIR)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(run.originalName ?? 'report.pdf')}"`,
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(join(dir, run.storedName!), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'not_found', message: 'File is missing from storage.' })
    }
  })
}))

export { ReportError }
