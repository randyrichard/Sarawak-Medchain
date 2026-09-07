import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireApiKey } from '../middleware/requireApiKey.js'
import {
  INCIDENT_STATUS_FILTERS, IncidentService, SORT_KEYS, type Caller,
} from '../lib/incidentService.js'
import { InspectionService } from '../lib/inspectionService.js'
import { AuditService } from '../lib/auditService.js'
import { TrainingService } from '../lib/trainingService.js'
import { INCIDENT_SEVERITIES, INCIDENT_TYPES } from '../lib/incidentCatalog.js'

/** The same catalogue the report form is built from, so the two cannot drift apart. */
const TYPE_VALUES = z.enum(INCIDENT_TYPES.map((t) => t.value) as [string, ...string[]])
const SEVERITY_VALUES = z.enum(INCIDENT_SEVERITIES.map((s) => s.value) as [string, ...string[]])

/**
 * The integration API.
 *
 * What the administration console has always documented - `GET /v1/incidents` with a
 * `sk_live_` bearer token - and what, until now, did not exist: keys authenticated
 * nothing, so every example in that panel was fiction.
 *
 * Three properties hold across everything here, and they are the reason this is a separate
 * router rather than a flag on the existing ones:
 *
 *   1. **The tenant comes from the key.** Never from a query parameter, a body field or a
 *      header. A key belongs to exactly one workspace and cannot be pointed at another.
 *   2. **The surface is what is mounted.** A key acts as `ceo` (see apiKeyAuth.ts for why
 *      that role and not `admin`), which bounds what it could reach; this file bounds what
 *      it can reach. Nothing administrative is here, and nothing here reaches the platform
 *      console, user management, security policy or another company's data.
 *   3. **Scopes are checked before the handler.** `requireApiKey` derives the scope from
 *      the HTTP method, so a route added below is covered the moment it is mounted rather
 *      than when somebody remembers to declare it.
 *
 * Reads reuse the same services the application uses, so an integration cannot see a
 * different answer from the one an HSE manager sees on the screen.
 */
const incidents = new IncidentService(prisma)
const inspections = new InspectionService(prisma)
const audits = new AuditService(prisma)
const training = new TrainingService(prisma)

export const v1Router = Router()

v1Router.use(requireApiKey)

/** The key's own workspace, and the only one it can address. */
function callerOf(req: { apiKey?: { caller: Caller } }): Caller {
  return req.apiKey!.caller
}
function companyOf(req: { apiKey?: { companyId: string } }): string {
  return req.apiKey!.companyId
}

/**
 * Refuses a request that names a workspace.
 *
 * The tenant is already decided by the key, so a `companyId` here is either redundant or
 * an attempt to read somebody else's data. Answering 400 rather than ignoring it means an
 * integrator who sends the wrong one finds out, instead of quietly receiving their own
 * workspace's rows and believing they read another's.
 */
function rejectsCompanyId(req: { query: Record<string, unknown>; body?: unknown }): string | null {
  const fromQuery = req.query?.companyId
  const fromBody = (req.body as { companyId?: unknown } | undefined)?.companyId
  return fromQuery !== undefined || fromBody !== undefined
    ? 'Do not send companyId. An API key addresses exactly one workspace, and it is already known from the key.'
    : null
}

const MAX_PAGE_SIZE = 100
const paging = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(25),
}

const bad = (res: Parameters<Parameters<typeof v1Router.get>[1]>[1], message: string) =>
  res.status(400).json({ error: 'validation', message })

// ── Incidents ────────────────────────────────────────────────────────────────

const incidentListQuery = z.object({
  ...paging,
  q: z.string().max(200).optional(),
  type: z.string().optional(),
  severity: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(INCIDENT_STATUS_FILTERS).optional(),
  department: z.string().max(160).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  shift: z.string().max(60).optional(),
  sort: z.enum(SORT_KEYS).optional(),
  siteId: z.string().optional(),
})

v1Router.get('/incidents', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    const parsed = incidentListQuery.safeParse(req.query)
    if (!parsed.success) return bad(res, 'Invalid query parameters.')
    res.json(await incidents.list(callerOf(req), { ...parsed.data, companyId: companyOf(req) }))
  } catch (e) { next(e) }
})

v1Router.get('/incidents/:id', async (req, res, next) => {
  try {
    // The service scopes by the caller's membership, so an id from another workspace
    // resolves to a 404 rather than a row.
    res.json(await incidents.get(callerOf(req), req.params.id))
  } catch (e) { next(e) }
})

const incidentCreateBody = z.object({
  siteId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  type: TYPE_VALUES,
  severity: SEVERITY_VALUES,
  department: z.string().max(120).optional(),
  departmentId: z.string().optional(),
  location: z.string().min(1).max(300),
  gps: z.string().max(120).optional(),
  immediateActions: z.string().max(5000).optional(),
  weather: z.string().max(120).optional(),
  shift: z.string().max(120).optional(),
  emergencyResponseActivated: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  // Offsets accepted, not only Z: a caller in Malaysia sends +08:00 and that is a correct
  // ISO-8601 timestamp. Stored as UTC either way.
  occurredAt: z.string().datetime({ offset: true }),
  /*
   * The same idempotency key the offline browser queue uses, and for the same reason: a
   * system that retries a failed POST must be able to say "this is that one again". A UUID
   * because it becomes half of a unique index and arrives from a caller.
   */
  clientRef: z.string().uuid().optional(),
})

v1Router.post('/incidents', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    const parsed = incidentCreateBody.safeParse(req.body)
    if (!parsed.success) {
      return bad(res, parsed.error.issues[0]?.message ?? 'Invalid incident payload.')
    }
    const created = await incidents.create(callerOf(req), {
      ...parsed.data, companyId: companyOf(req),
    })
    res.status(201).json(created)
  } catch (e) { next(e) }
})

// ── Corrective actions ───────────────────────────────────────────────────────

const actionListQuery = z.object({
  ...paging,
  status: z.string().max(40).optional(),
  owner: z.string().max(200).optional(),
  source: z.string().max(40).optional(),
  overdue: z.enum(['true', 'false']).optional(),
})

v1Router.get('/actions', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    const parsed = actionListQuery.safeParse(req.query)
    if (!parsed.success) return bad(res, 'Invalid query parameters.')
    const { overdue, ...rest } = parsed.data
    res.json(await incidents.listActions(callerOf(req), companyOf(req), {
      ...rest,
      ...(overdue === undefined ? {} : { overdue: overdue === 'true' }),
    }))
  } catch (e) { next(e) }
})

// ── Assets ───────────────────────────────────────────────────────────────────

const assetListQuery = z.object({
  ...paging,
  q: z.string().max(200).optional(),
  siteId: z.string().optional(),
  category: z.string().optional(),
  status: z.string().max(40).optional(),
  bucket: z.enum(['all', 'overdue', 'due_week', 'high_risk', 'defects']).optional(),
})

v1Router.get('/assets', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    const parsed = assetListQuery.safeParse(req.query)
    if (!parsed.success) return bad(res, 'Invalid query parameters.')
    res.json(await inspections.listAssets(callerOf(req), {
      ...parsed.data,
      category: parsed.data.category as never,
      companyId: companyOf(req),
    }))
  } catch (e) { next(e) }
})

// ── Audits ───────────────────────────────────────────────────────────────────

const auditListQuery = z.object({
  ...paging,
  q: z.string().max(200).optional(),
  siteId: z.string().optional(),
  status: z.string().max(40).optional(),
  type: z.string().max(40).optional(),
})

v1Router.get('/audits', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    const parsed = auditListQuery.safeParse(req.query)
    if (!parsed.success) return bad(res, 'Invalid query parameters.')
    res.json(await audits.listAudits(callerOf(req), {
      ...parsed.data,
      status: parsed.data.status as never,
      type: parsed.data.type as never,
      companyId: companyOf(req),
    }))
  } catch (e) { next(e) }
})

// -- Training ----------------------------------------------------------------

/**
 * The competency matrix: who holds what, and what has lapsed.
 *
 * The one training read a key can serve. `trainingMatrix` admits `ceo` among its
 * organisation-wide roles, so it answers for the whole workspace rather than a slice.
 */
v1Router.get('/training/matrix', async (req, res, next) => {
  try {
    const named = rejectsCompanyId(req)
    if (named) return bad(res, named)
    res.json(await training.trainingMatrix(callerOf(req), companyOf(req)))
  } catch (e) { next(e) }
})

// ── Certificate verification ─────────────────────────────────────────────────

/**
 * Deliberately not scoped to the key's workspace.
 *
 * Verification exists so that whoever holds a printed certificate can confirm it, and the
 * usual holder is a client or an inspector from outside the company that issued it - a
 * contractor's ticket checked at another operator's gate is the whole use case. The
 * service returns only what is printed on the document, which the person asking is already
 * looking at, so there is nothing here to scope.
 */
v1Router.get('/certificates/:number/verify', async (req, res, next) => {
  try {
    res.json(await training.verifyCertificate(req.params.number))
  } catch (e) { next(e) }
})
