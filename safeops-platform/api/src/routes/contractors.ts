import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  COMPLIANCE_FILTERS, CONTRACTOR_SORTS, ContractorError, ContractorService, WORKER_SORTS,
} from '../lib/contractorService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new ContractorService(prisma)
export const contractorsRouter = Router()

// Identity always comes from the verified token, never from the request body.
contractorsRouter.use(requireAuth)

function ctxOf(req: { ip?: string; headers: Record<string, unknown> }) {
  return { ip: req.ip, device: String(req.headers['user-agent'] ?? '').slice(0, 300) }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
const MAX_PAGE_SIZE = 100

// ── Contractor companies ─────────────────────────────────────────────────────

const listCompaniesQuery = z.object({
  companyId: z.string().min(1),
  q: z.string().max(200).optional(),
  status: z.enum(['active', 'suspended', 'all']).optional(),
  insurance: z.enum(COMPLIANCE_FILTERS).optional(),
  sort: z.enum(CONTRACTOR_SORTS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
})

contractorsRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = listCompaniesQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  const { companyId, ...opts } = parsed.data
  res.json({ rows: await svc.listCompanies(callerOf(req), companyId, opts) })
}))

/*
 * Literal paths first. Express matches in declaration order, so /contractors/stats and
 * /contractors/workers must be registered before /contractors/:id or they are treated
 * as a contractor whose id is "stats".
 */
contractorsRouter.get('/stats', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.stats(callerOf(req), companyId))
}))

const listWorkersQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(25),
  q: z.string().max(200).optional(),
  siteId: z.string().max(64).optional(),
  contractorCompanyId: z.string().max(64).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  medical: z.enum(COMPLIANCE_FILTERS).optional(),
  induction: z.enum(COMPLIANCE_FILTERS).optional(),
  onSite: z.enum(['true', 'false']).optional(),
  sort: z.enum(WORKER_SORTS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
})

contractorsRouter.get('/workers', asyncRoute(async (req, res) => {
  const parsed = listWorkersQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  const { onSite, ...rest } = parsed.data
  res.json(await svc.listWorkers(callerOf(req), {
    ...rest,
    onSite: onSite === undefined ? undefined : onSite === 'true',
  }))
}))

const workerBody = z.object({
  companyId: z.string().min(1),
  contractorCompanyId: z.string().min(1),
  siteId: z.string().min(1),
  name: z.string().min(1).max(160),
  icPassport: z.string().max(60).optional(),
  position: z.string().max(160).optional(),
  medicalExpiry: isoDate.optional(),
  inductionExpiry: isoDate.optional(),
  emergencyName: z.string().max(160).optional(),
  emergencyPhone: z.string().max(40).optional(),
  emergencyRelation: z.string().max(80).optional(),
})

contractorsRouter.post('/workers', asyncRoute(async (req, res) => {
  const parsed = workerBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid worker payload.',
    })
  }
  const { companyId, ...input } = parsed.data
  res.status(201).json(await svc.createWorker(callerOf(req), companyId, input, ctxOf(req)))
}))

const workerPatch = z.object({
  contractorCompanyId: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  name: z.string().min(1).max(160).optional(),
  icPassport: z.string().max(60).optional(),
  position: z.string().max(160).optional(),
  medicalExpiry: isoDate.nullable().optional(),
  inductionExpiry: isoDate.nullable().optional(),
  emergencyName: z.string().max(160).optional(),
  emergencyPhone: z.string().max(40).optional(),
  emergencyRelation: z.string().max(80).optional(),
})

contractorsRouter.patch('/workers/:workerId', asyncRoute(async (req, res) => {
  const parsed = workerPatch.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid worker payload.',
    })
  }
  res.json(await svc.updateWorker(callerOf(req), req.params.workerId, parsed.data, ctxOf(req)))
}))

contractorsRouter.post('/workers/:workerId/status', asyncRoute(async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'active must be true or false.' })
  }
  res.json(await svc.setWorkerActive(callerOf(req), req.params.workerId, parsed.data.active, ctxOf(req)))
}))

contractorsRouter.post('/workers/:workerId/check-in', asyncRoute(async (req, res) => {
  res.json(await svc.checkIn(callerOf(req), req.params.workerId, ctxOf(req)))
}))

contractorsRouter.post('/workers/:workerId/check-out', asyncRoute(async (req, res) => {
  res.json(await svc.checkOut(callerOf(req), req.params.workerId, ctxOf(req)))
}))

const certificateBody = z.object({
  name: z.string().min(1).max(200),
  issuedBy: z.string().max(160).optional(),
  issueDate: isoDate.optional(),
  expiryDate: isoDate.optional(),
  reference: z.string().max(120).optional(),
})

contractorsRouter.post('/workers/:workerId/certificates', asyncRoute(async (req, res) => {
  const parsed = certificateBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid competency payload.',
    })
  }
  res.status(201).json(await svc.addCertificate(callerOf(req), req.params.workerId, parsed.data, ctxOf(req)))
}))

contractorsRouter.delete('/certificates/:certificateId', asyncRoute(async (req, res) => {
  await svc.removeCertificate(callerOf(req), req.params.certificateId, ctxOf(req))
  res.status(204).end()
}))

contractorsRouter.delete('/workers/:workerId', asyncRoute(async (req, res) => {
  await svc.removeWorker(callerOf(req), req.params.workerId, ctxOf(req))
  res.status(204).end()
}))

/** Registered after the /workers literals so it cannot capture them. */
contractorsRouter.get('/workers/:workerId', asyncRoute(async (req, res) => {
  res.json(await svc.getWorker(callerOf(req), req.params.workerId))
}))

// ── Contractor company mutations ─────────────────────────────────────────────

const companyBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(200),
  registrationNumber: z.string().max(80).optional(),
  contactPerson: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(320).optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  insuranceExpiry: isoDate.optional(),
})

contractorsRouter.post('/', asyncRoute(async (req, res) => {
  const parsed = companyBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid contractor payload.',
    })
  }
  const { companyId, ...input } = parsed.data
  res.status(201).json(await svc.createCompany(callerOf(req), companyId, input, ctxOf(req)))
}))

const companyPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  registrationNumber: z.string().max(80).optional(),
  contactPerson: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(320).nullable().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  insuranceExpiry: isoDate.nullable().optional(),
  status: z.enum(['active', 'suspended']).optional(),
})

contractorsRouter.patch('/:id', asyncRoute(async (req, res) => {
  const parsed = companyPatch.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid contractor payload.',
    })
  }
  res.json(await svc.updateCompany(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

contractorsRouter.delete('/:id', asyncRoute(async (req, res) => {
  await svc.removeCompany(callerOf(req), req.params.id, ctxOf(req))
  res.status(204).end()
}))

/** Registered last: the parameterised path must not capture /stats or /workers. */
contractorsRouter.get('/:id', asyncRoute(async (req, res) => {
  res.json(await svc.getCompany(callerOf(req), req.params.id))
}))

export { ContractorError }
