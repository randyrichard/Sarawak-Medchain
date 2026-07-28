import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { AdminError, AdminService, type AdminContext } from '../lib/adminService.js'
import type { Caller } from '../lib/incidentService.js'
import { RBAC_ACTIONS, RBAC_MODULES, WEBHOOK_EVENTS } from '../lib/adminCatalog.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new AdminService(prisma)
export const adminRouter = Router()

adminRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

/**
 * Request context for the audit trail. Taken from the connection and the user agent —
 * never from the body, so an actor cannot write a false origin into their own trail.
 */
function ctxOf(req: { ip?: string; headers: Record<string, unknown> }): AdminContext {
  return {
    ip: req.ip ?? '',
    device: String(req.headers['user-agent'] ?? '').slice(0, 200),
  }
}

const companyQuery = z.object({ companyId: z.string().min(1) })
const ROLE = z.enum(['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee'])

/** Every route needs the tenant; this keeps the parse in one place. */
function company(req: { query: unknown }): string | null {
  const p = companyQuery.safeParse(req.query)
  return p.success ? p.data.companyId : null
}

// ── Users ────────────────────────────────────────────────────────────────────

adminRouter.get('/users', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listUsers(callerOf(req), companyId, {
      q: req.query.q ? String(req.query.q) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      role: req.query.role ? String(req.query.role) : undefined,
    }))
  } catch (e) {
    next(e)
  }
})

const createUserBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().min(3).max(200),
  role: ROLE,
  siteIds: z.array(z.string().max(120)).max(50).optional(),
  department: z.string().max(120).optional(),
  sendInvite: z.boolean().default(true),
})

adminRouter.post('/users', async (req, res, next) => {
  try {
    const parsed = createUserBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid user payload.',
      })
    }
    const { companyId, ...input } = parsed.data
    res.status(201).json(await svc.createUser(callerOf(req), companyId, ctxOf(req), input))
  } catch (e) {
    next(e)
  }
})

const importBody = z.object({
  companyId: z.string().min(1),
  csv: z.string().min(1).max(500_000),
})

adminRouter.post('/users/import', async (req, res, next) => {
  try {
    const parsed = importBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'A CSV payload is required.' })
    }
    res.json(await svc.bulkImportUsers(
      callerOf(req), parsed.data.companyId, ctxOf(req), parsed.data.csv,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.getUser(callerOf(req), companyId, req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/users/:id/devices', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.userDevices(callerOf(req), companyId, req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/users/:id/logins', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.userLoginHistory(callerOf(req), companyId, req.params.id))
  } catch (e) {
    next(e)
  }
})

const statusBody = z.object({
  companyId: z.string().min(1),
  status: z.enum(['active', 'invited', 'deactivated', 'locked']),
})

adminRouter.patch('/users/:id/status', async (req, res, next) => {
  try {
    const parsed = statusBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'A valid status is required.' })
    }
    res.json(await svc.setUserStatus(
      callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id, parsed.data.status,
    ))
  } catch (e) {
    next(e)
  }
})

const companyBody = z.object({ companyId: z.string().min(1) })

adminRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.resetPassword(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.post('/users/:id/force-reset', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.forcePasswordReset(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.post('/users/:id/toggle-mfa', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.toggleMfa(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

// ── RBAC ─────────────────────────────────────────────────────────────────────

adminRouter.get('/roles', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listRoles(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const roleBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(120),
  cloneFrom: z.string().max(120).default('employee'),
})

adminRouter.post('/roles', async (req, res, next) => {
  try {
    const parsed = roleBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'Role name is required.' })
    res.status(201).json(await svc.createRole(
      callerOf(req), parsed.data.companyId, ctxOf(req), parsed.data.name, parsed.data.cloneFrom,
    ))
  } catch (e) {
    next(e)
  }
})

const permBody = z.object({
  companyId: z.string().min(1),
  module: z.enum(RBAC_MODULES),
  action: z.enum(RBAC_ACTIONS),
})

adminRouter.patch('/roles/:roleId/permissions', async (req, res, next) => {
  try {
    const parsed = permBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid permission payload.' })
    }
    res.json(await svc.toggleRolePermission(
      callerOf(req), parsed.data.companyId, ctxOf(req),
      req.params.roleId, parsed.data.module, parsed.data.action,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.delete('/roles/:roleId', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    await svc.deleteRole(callerOf(req), companyId, ctxOf(req), req.params.roleId)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

// ── Audit log, security ──────────────────────────────────────────────────────

adminRouter.get('/audit', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listAudit(callerOf(req), companyId, {
      q: req.query.q ? String(req.query.q) : undefined,
      module: req.query.module ? String(req.query.module) : undefined,
      actor: req.query.actor ? String(req.query.actor) : undefined,
    }))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/security', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.getSecurity(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const securityBody = z.object({
  companyId: z.string().min(1),
  passwordMinLength: z.number().int().min(8).max(128).optional(),
  requireUppercase: z.boolean().optional(),
  requireNumber: z.boolean().optional(),
  requireSymbol: z.boolean().optional(),
  passwordExpiryDays: z.number().int().min(0).max(3650).optional(),
  lockoutThreshold: z.number().int().min(1).max(100).optional(),
  sessionTimeoutHours: z.number().int().min(1).max(720).optional(),
  mfaRequired: z.boolean().optional(),
})

adminRouter.patch('/security', async (req, res, next) => {
  try {
    const parsed = securityBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid security policy.',
      })
    }
    const { companyId, ...patch } = parsed.data
    res.json(await svc.updateSecurity(callerOf(req), companyId, ctxOf(req), patch))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/security/logins', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.loginHistory(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/security/center', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.securityCenter(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

// ── Integrations, keys, webhooks ─────────────────────────────────────────────

adminRouter.get('/connectors', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listConnectors(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const connectorBody = z.object({
  companyId: z.string().min(1),
  connected: z.boolean(),
  config: z.record(z.string().max(120), z.string().max(2000)).optional(),
})

adminRouter.patch('/connectors/:id', async (req, res, next) => {
  try {
    const parsed = connectorBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid integration payload.' })
    }
    res.json(await svc.setConnector(
      callerOf(req), parsed.data.companyId, ctxOf(req),
      req.params.id, parsed.data.connected, parsed.data.config,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/api-keys', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listApiKeys(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const apiKeyBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(120),
  scopes: z.array(z.enum(RBAC_ACTIONS)).max(10).default([]),
})

adminRouter.post('/api-keys', async (req, res, next) => {
  try {
    const parsed = apiKeyBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Give the key a descriptive name.' })
    }
    res.status(201).json(await svc.createApiKey(
      callerOf(req), parsed.data.companyId, ctxOf(req), parsed.data.name, parsed.data.scopes,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.post('/api-keys/:id/revoke', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.revokeApiKey(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/api-usage', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.apiUsage(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/webhooks', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listWebhooks(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const webhookBody = z.object({
  companyId: z.string().min(1),
  url: z.string().min(1).max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS as [string, ...string[]])).min(1).max(20),
})

adminRouter.post('/webhooks', async (req, res, next) => {
  try {
    const parsed = webhookBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid webhook payload.',
      })
    }
    res.status(201).json(await svc.createWebhook(
      callerOf(req), parsed.data.companyId, ctxOf(req), parsed.data.url, parsed.data.events,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.post('/webhooks/:id/toggle', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.toggleWebhook(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

adminRouter.post('/webhooks/:id/test', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.testWebhook(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

// ── Organisation configuration ───────────────────────────────────────────────

adminRouter.get('/org-settings', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.getOrgSettings(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const orgBody = z.object({
  companyId: z.string().min(1),
  displayName: z.string().max(200).optional(),
  legalName: z.string().max(200).optional(),
  industry: z.string().max(120).optional(),
  timezone: z.string().max(60).optional(),
  language: z.string().max(20).optional(),
  brandAccent: z.string().max(40).optional(),
  logoInitials: z.string().max(4).optional(),
})

adminRouter.patch('/org-settings', async (req, res, next) => {
  try {
    const parsed = orgBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid organisation settings.' })
    }
    const { companyId, ...patch } = parsed.data
    res.json(await svc.updateOrgSettings(callerOf(req), companyId, ctxOf(req), patch))
  } catch (e) {
    next(e)
  }
})

const CONFIG_KIND = z.enum(['position', 'shift', 'holiday', 'unit'])

adminRouter.get('/config/:kind', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    const kind = CONFIG_KIND.safeParse(req.params.kind)
    if (!kind.success) return res.status(400).json({ error: 'validation', message: 'Unknown configuration type.' })
    res.json(await svc.listConfigItems(callerOf(req), companyId, kind.data))
  } catch (e) {
    next(e)
  }
})

const configBody = z.object({
  companyId: z.string().min(1),
  data: z.record(z.string().max(60), z.string().max(300)),
})

adminRouter.post('/config/:kind', async (req, res, next) => {
  try {
    const parsed = configBody.safeParse(req.body)
    const kind = CONFIG_KIND.safeParse(req.params.kind)
    if (!parsed.success || !kind.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid configuration item.' })
    }
    res.status(201).json(await svc.addConfigItem(
      callerOf(req), parsed.data.companyId, ctxOf(req), kind.data, parsed.data.data,
    ))
  } catch (e) {
    next(e)
  }
})

adminRouter.delete('/config/:kind/:id', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    const kind = CONFIG_KIND.safeParse(req.params.kind)
    if (!kind.success) return res.status(400).json({ error: 'validation', message: 'Unknown configuration type.' })
    await svc.removeConfigItem(callerOf(req), companyId, ctxOf(req), kind.data, req.params.id)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

// ── Health, backup & recovery ────────────────────────────────────────────────

adminRouter.get('/health', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.systemHealth(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/retention', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.getRetention(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const retentionBody = z.object({
  companyId: z.string().min(1),
  auditLogDays: z.number().int().min(30).max(3650).optional(),
  backupCount: z.number().int().min(1).max(100).optional(),
  closedIncidentYears: z.number().int().min(1).max(50).optional(),
  autoBackupDaily: z.boolean().optional(),
})

adminRouter.patch('/retention', async (req, res, next) => {
  try {
    const parsed = retentionBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid retention policy.' })
    }
    const { companyId, ...patch } = parsed.data
    res.json(await svc.updateRetention(callerOf(req), companyId, ctxOf(req), patch))
  } catch (e) {
    next(e)
  }
})

adminRouter.get('/backups', async (req, res, next) => {
  try {
    const companyId = company(req)
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.listBackups(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

const backupBody = z.object({
  companyId: z.string().min(1),
  note: z.string().max(300).default(''),
})

adminRouter.post('/backups', async (req, res, next) => {
  try {
    const parsed = backupBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.status(201).json(await svc.createBackup(
      callerOf(req), parsed.data.companyId, ctxOf(req), parsed.data.note,
    ))
  } catch (e) {
    next(e)
  }
})

/**
 * Restore. Additive and tenant-scoped, and it takes an automatic snapshot of the current
 * state first — see the service for why both of those are load-bearing.
 */
adminRouter.post('/backups/:id/restore', async (req, res, next) => {
  try {
    const parsed = companyBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.restoreBackup(callerOf(req), parsed.data.companyId, ctxOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

export { AdminError }
