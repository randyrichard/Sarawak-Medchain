import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  EMPLOYEE_SORTS, EmployeeError, EmployeeService, MEDICAL_FILTERS,
} from '../lib/employeeService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new EmployeeService(prisma)
export const employeesRouter = Router()

// Identity always comes from the verified token, never from the request body.
employeesRouter.use(requireAuth)

function ctxOf(req: { ip?: string; headers: Record<string, unknown> }) {
  return { ip: req.ip, device: String(req.headers['user-agent'] ?? '').slice(0, 300) }
}

const MAX_PAGE_SIZE = 100

const listQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  // Bounded: an unbounded page size lets one request pull the whole workforce.
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(25),
  q: z.string().max(200).optional(),
  siteId: z.string().max(64).optional(),
  department: z.string().max(120).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  medical: z.enum(MEDICAL_FILTERS).optional(),
  sort: z.enum(EMPLOYEE_SORTS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
})

employeesRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  res.json(await svc.list(callerOf(req), parsed.data))
}))

/*
 * Literal paths are registered before the parameterised one below, or Express matches
 * /employees/stats as an employee whose id is "stats".
 */
employeesRouter.get('/stats', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.stats(callerOf(req), companyId))
}))

employeesRouter.get('/departments', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json({ departments: await svc.departments(callerOf(req), companyId) })
}))

employeesRouter.get('/positions', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json({ positions: await svc.positions(callerOf(req), companyId) })
}))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  name: z.string().min(1).max(160),
  position: z.string().max(160).optional(),
  department: z.string().max(120).optional(),
  email: z.string().email().max(320).optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  hireDate: isoDate.optional(),
  bloodGroup: z.string().max(8).optional(),
  medicalExpiry: isoDate.optional(),
  medicalNotes: z.string().max(2000).optional(),
})

employeesRouter.post('/', asyncRoute(async (req, res) => {
  const parsed = createBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid employee payload.',
    })
  }
  const { companyId, ...input } = parsed.data
  res.status(201).json(await svc.create(callerOf(req), companyId, input, ctxOf(req)))
}))

const patchBody = z.object({
  siteId: z.string().min(1).optional(),
  name: z.string().min(1).max(160).optional(),
  position: z.string().max(160).optional(),
  department: z.string().max(120).optional(),
  email: z.string().email().max(320).nullable().optional().or(z.literal('')),
  phone: z.string().max(40).nullable().optional(),
  hireDate: isoDate.nullable().optional(),
  bloodGroup: z.string().max(8).nullable().optional(),
  medicalExpiry: isoDate.nullable().optional(),
  medicalNotes: z.string().max(2000).nullable().optional(),
})

employeesRouter.patch('/:id', asyncRoute(async (req, res) => {
  const parsed = patchBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid employee payload.',
    })
  }
  res.json(await svc.update(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

employeesRouter.post('/:id/status', asyncRoute(async (req, res) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'active must be true or false.' })
  }
  res.json(await svc.setActive(callerOf(req), req.params.id, parsed.data.active, ctxOf(req)))
}))

employeesRouter.delete('/:id', asyncRoute(async (req, res) => {
  await svc.remove(callerOf(req), req.params.id, ctxOf(req))
  res.status(204).end()
}))

// ── Emergency contacts ───────────────────────────────────────────────────────

const contactBody = z.object({
  name: z.string().min(1).max(160),
  relationship: z.string().max(80).optional(),
  phone: z.string().min(1).max(40),
  altPhone: z.string().max(40).optional(),
  isPrimary: z.boolean().optional(),
})

employeesRouter.post('/:id/contacts', asyncRoute(async (req, res) => {
  const parsed = contactBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid contact payload.',
    })
  }
  res.status(201).json(await svc.addContact(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

employeesRouter.delete('/contacts/:contactId', asyncRoute(async (req, res) => {
  await svc.removeContact(callerOf(req), req.params.contactId, ctxOf(req))
  res.status(204).end()
}))

// ── PPE ──────────────────────────────────────────────────────────────────────

const ppeBody = z.object({
  item: z.string().min(1).max(160),
  size: z.string().max(40).optional(),
  serialNumber: z.string().max(80).optional(),
  replaceDue: isoDate.optional(),
  notes: z.string().max(1000).optional(),
})

employeesRouter.post('/:id/ppe', asyncRoute(async (req, res) => {
  const parsed = ppeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid PPE payload.',
    })
  }
  res.status(201).json(await svc.issuePpe(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

employeesRouter.post('/ppe/:issueId/return', asyncRoute(async (req, res) => {
  res.json(await svc.returnPpe(callerOf(req), req.params.issueId, ctxOf(req)))
}))

/**
 * Registered last on purpose. Express matches in declaration order, so this parameterised
 * path must come after /stats, /departments and the /contacts and /ppe literals.
 */
employeesRouter.get('/:id', asyncRoute(async (req, res) => {
  res.json(await svc.get(callerOf(req), req.params.id))
}))

export { EmployeeError }
