import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { AuditError, AuditService } from '../lib/auditService.js'
import { AUDIT_TYPES } from '../lib/auditCatalog.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { callerOf } from '../middleware/caller.js'

const svc = new AuditService(prisma)
export const auditsRouter = Router()

// Identity always comes from the verified token, never from the request body.
auditsRouter.use(requireAuth)

const MAX_PAGE_SIZE = 200
const AUDIT_TYPE = z.enum(AUDIT_TYPES)
const SEVERITY = z.enum(['Critical', 'Major', 'Minor', 'Observation'])
const DOC_KIND = z.enum([
  'policy', 'sop', 'certificate', 'inspection_report', 'permit', 'training_record', 'audit_report',
])

const companyQuery = z.object({ companyId: z.string().min(1) })

// ── Literal paths first ──────────────────────────────────────────────────────
// Express matches in declaration order, so every literal collection below has to be
// registered before /:id — otherwise that route captures them and looks up an audit
// called "templates". This is the bug the incident module hit with /actions/list.

auditsRouter.get('/templates', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.listTemplates(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

const templateBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(200),
  items: z.array(z.string().max(500)).min(1).max(200),
})

auditsRouter.post('/templates', async (req, res, next) => {
  try {
    const parsed = templateBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'A template needs a name and at least 3 checklist items.',
      })
    }
    const { companyId, name, items } = parsed.data
    res.status(201).json(await svc.createTemplate(callerOf(req), companyId, name, items))
  } catch (e) {
    next(e)
  }
})

auditsRouter.get('/stats', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.auditStats(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

const findingsQuery = z.object({
  companyId: z.string().min(1),
  severity: SEVERITY.optional(),
})

auditsRouter.get('/findings', async (req, res, next) => {
  try {
    const parsed = findingsQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    res.json(await svc.listFindings(callerOf(req), parsed.data.companyId, parsed.data.severity))
  } catch (e) {
    next(e)
  }
})

auditsRouter.get('/obligations', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.listObligations(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

const renewBody = z.object({
  nextDue: z.string().min(1).max(40),
  note: z.string().max(2000).optional(),
})

auditsRouter.post('/obligations/:id/renew', async (req, res, next) => {
  try {
    const parsed = renewBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'A new due date is required.' })
    }
    res.json(await svc.renewObligation(
      callerOf(req), req.params.id, parsed.data.nextDue, parsed.data.note,
    ))
  } catch (e) {
    next(e)
  }
})

const documentsQuery = z.object({
  companyId: z.string().min(1),
  q: z.string().max(200).optional(),
  kind: DOC_KIND.optional(),
})

auditsRouter.get('/documents', async (req, res, next) => {
  try {
    const parsed = documentsQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    const { companyId, q, kind } = parsed.data
    res.json(await svc.listDocuments(callerOf(req), companyId, q, kind))
  } catch (e) {
    next(e)
  }
})

const documentBody = z.object({
  docId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1),
  siteId: z.string().max(120).nullable().optional(),
  name: z.string().max(300).optional(),
  kind: DOC_KIND.optional(),
  sizeKb: z.coerce.number().int().min(0).max(2_000_000).optional(),
  note: z.string().max(2000).optional(),
})

auditsRouter.post('/documents', async (req, res, next) => {
  try {
    const parsed = documentBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid document payload.',
      })
    }
    const { docId, ...input } = parsed.data
    res.status(201).json(await svc.addDocumentVersion(callerOf(req), docId ?? null, input))
  } catch (e) {
    next(e)
  }
})

auditsRouter.post('/documents/:id/approve', async (req, res, next) => {
  try {
    res.json(await svc.approveDocument(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const listQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(100),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  status: z.enum(['planned', 'in_progress', 'completed', 'closed']).optional(),
  type: AUDIT_TYPE.optional(),
})

auditsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    res.json(await svc.listAudits(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1).max(300),
  type: AUDIT_TYPE,
  customType: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  leadAuditor: z.string().min(1).max(200),
  team: z.array(z.string().max(200)).max(30).optional(),
  templateId: z.string().min(1).max(120),
  scheduledFor: z.string().min(1).max(40),
  durationDays: z.coerce.number().int().positive().max(60).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
})

auditsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid audit payload.',
      })
    }
    res.status(201).json(await svc.createAudit(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

// ── Parameterised paths ──────────────────────────────────────────────────────

auditsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await svc.getAuditDetail(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

auditsRouter.post('/:id/start', async (req, res, next) => {
  try {
    res.json(await svc.startAudit(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const answerSchema = z.object({
  itemId: z.string().min(1).max(120),
  section: z.string().max(300).default(''),
  text: z.string().max(500).default(''),
  result: z.enum(['pass', 'fail', 'na']),
  comment: z.string().max(2000).optional(),
  photoCount: z.coerce.number().int().min(0).max(100).optional(),
})

const failSchema = z.object({
  severity: SEVERITY,
  description: z.string().min(1).max(2000),
  owner: z.string().min(1).max(200),
  photoCount: z.coerce.number().int().min(0).max(100).optional(),
  linkedAssetId: z.string().max(120).optional(),
})

const completeBody = z.object({
  answers: z.array(answerSchema).min(1).max(400),
  fails: z.record(z.string().max(120), failSchema).default({}),
  signature: z.string().min(1).max(200),
  gps: z.string().max(120).optional(),
})

auditsRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const parsed = completeBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid audit result.',
      })
    }
    res.json(await svc.completeAudit(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

auditsRouter.post('/:id/close', async (req, res, next) => {
  try {
    res.json(await svc.closeAudit(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

export { AuditError }
