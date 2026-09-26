import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { InvestigationError, InvestigationService } from '../lib/incidentInvestigation.js'
import {
  INCIDENT_SEVERITIES, INCIDENT_TYPES, SHIFTS, WEATHER,
} from '../lib/incidentCatalog.js'
import { IncidentService, type Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { IncidentSummaryService } from '../lib/incidentSummary.js'
import { renderReportPdf } from '../lib/reportPdf.js'

/**
 * The investigation half of the incident API: people, related records, causal analysis.
 *
 * Mounted on /incidents ahead of the router that owns /:id, the same ordering rule the
 * incident extras router already follows - /incidents/catalog would otherwise be looked up
 * as an incident whose id reads "catalog".
 */
const svc = new InvestigationService(prisma)
const incidents = new IncidentService(prisma)
export const incidentInvestigationRouter = Router()

incidentInvestigationRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const PERSON_ROLE = z.enum(['witness', 'injured', 'involved', 'first_aider'])
const LINK_KIND = z.enum(['permit', 'employee', 'contractor', 'contractor_worker', 'visitor', 'asset'])

// ── Literal paths first ──────────────────────────────────────────────────────

/**
 * The classification lists, served so the report form offers exactly what the server will
 * accept. Legacy values are flagged rather than hidden: the register still renders them.
 */
incidentInvestigationRouter.get('/catalog', (_req, res) => {
  res.json({
    types: INCIDENT_TYPES,
    severities: INCIDENT_SEVERITIES,
    shifts: SHIFTS,
    weather: WEATHER,
  })
})

/** The incident board: counts, breakdowns and the recurring root causes. */
incidentInvestigationRouter.get('/board', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined
    res.json(await incidents.board(callerOf(req), companyId, siteId))
  } catch (e) {
    next(e)
  }
})

/** What has gone wrong around a given permit, contractor, visitor or asset. */
incidentInvestigationRouter.get('/linked/:kind/:targetId', async (req, res, next) => {
  try {
    const kind = LINK_KIND.safeParse(req.params.kind)
    const companyId = String(req.query.companyId ?? '')
    if (!kind.success || !companyId) {
      return res.status(400).json({ error: 'validation', message: 'Unknown record kind.' })
    }
    res.json(await svc.incidentsFor(callerOf(req), companyId, kind.data, req.params.targetId))
  } catch (e) {
    next(e)
  }
})

// ── People ───────────────────────────────────────────────────────────────────

incidentInvestigationRouter.get('/:id/people', async (req, res, next) => {
  try {
    res.json({ rows: await svc.listPeople(callerOf(req), req.params.id) })
  } catch (e) {
    next(e)
  }
})

const personBody = z.object({
  role: PERSON_ROLE,
  employeeId: z.string().optional(),
  contractorWorkerId: z.string().optional(),
  visitorId: z.string().optional(),
  name: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  injuryType: z.string().max(200).optional(),
  bodyPart: z.string().max(200).optional(),
  treatment: z.string().max(500).optional(),
  daysLost: z.number().int().min(0).max(10_000).optional(),
  statement: z.string().max(8000).optional(),
})

incidentInvestigationRouter.post('/:id/people', async (req, res, next) => {
  try {
    const parsed = personBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Choose a role, and name the person or pick them from a register.',
      })
    }
    res.status(201).json(await svc.addPerson(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

const personPatch = z.object({
  statement: z.string().max(8000).optional(),
  injuryType: z.string().max(200).optional(),
  bodyPart: z.string().max(200).optional(),
  treatment: z.string().max(500).optional(),
  daysLost: z.number().int().min(0).max(10_000).optional(),
})

incidentInvestigationRouter.patch('/people/:personId', async (req, res, next) => {
  try {
    const parsed = personPatch.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That update is not valid.' })
    }
    res.json(await svc.updatePerson(callerOf(req), req.params.personId, parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

incidentInvestigationRouter.delete('/people/:personId', async (req, res, next) => {
  try {
    await svc.removePerson(callerOf(req), req.params.personId, ctxOf(req))
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

// ── Related records ──────────────────────────────────────────────────────────

incidentInvestigationRouter.get('/:id/links', async (req, res, next) => {
  try {
    res.json({ rows: await svc.listLinks(callerOf(req), req.params.id) })
  } catch (e) {
    next(e)
  }
})

const linkBody = z.object({
  kind: LINK_KIND,
  targetId: z.string().min(1),
  note: z.string().max(2000).optional(),
})

incidentInvestigationRouter.post('/:id/links', async (req, res, next) => {
  try {
    const parsed = linkBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Choose a record to link.' })
    }
    res.status(201).json(await svc.addLink(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

incidentInvestigationRouter.delete('/links/:linkId', async (req, res, next) => {
  try {
    await svc.removeLink(callerOf(req), req.params.linkId, ctxOf(req))
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

// ── The one-page summary ─────────────────────────────────────────────────────

const summaries = new IncidentSummaryService(prisma)

incidentInvestigationRouter.get('/:id/summary', async (req, res, next) => {
  try {
    const data = await summaries.build(callerOf(req), req.params.id)
    res.json({ ...data, generatedAt: data.generatedAt.toISOString(), periodEnd: data.periodEnd.toISOString(), periodStart: null })
  } catch (e) {
    next(e)
  }
})

incidentInvestigationRouter.get('/:id/summary.pdf', async (req, res, next) => {
  try {
    const pdf = await renderReportPdf(await summaries.build(callerOf(req), req.params.id))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdf.fileName)}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(pdf.bytes)
  } catch (e) {
    next(e)
  }
})

// ── The investigation ────────────────────────────────────────────────────────

incidentInvestigationRouter.get('/:id/investigation', async (req, res, next) => {
  try {
    res.json(await svc.getInvestigation(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const investigationBody = z.object({
  leadInvestigator: z.string().max(200).optional(),
  investigationTeam: z.string().max(2000).optional(),
  directCause: z.string().max(4000).optional(),
  underlyingCause: z.string().max(4000).optional(),
  rootCause: z.string().max(4000).optional(),
  contributingFactors: z.string().max(4000).optional(),
  recommendations: z.string().max(4000).optional(),
  fishbone: z.record(z.array(z.string().max(500))).optional(),
})

incidentInvestigationRouter.put('/:id/investigation', async (req, res, next) => {
  try {
    const parsed = investigationBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That investigation update is not valid.' })
    }
    res.json(await svc.saveInvestigation(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

incidentInvestigationRouter.post('/:id/investigation/complete', async (req, res, next) => {
  try {
    res.json(await svc.completeInvestigation(callerOf(req), req.params.id, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

export { InvestigationError }
