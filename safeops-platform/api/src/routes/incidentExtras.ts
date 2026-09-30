import { randomUUID } from 'node:crypto'
import { sha256File } from '../lib/fileIntegrity.js'
import { join, resolve } from 'node:path'
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { IncidentService } from '../lib/incidentService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new IncidentService(prisma)
export const incidentExtrasRouter = Router()
incidentExtrasRouter.use(requireAuth)

// ── File upload ──────────────────────────────────────────────────────────────

/**
 * Where evidence is stored.
 *
 * Configurable so production can point it at a mounted volume. Left at its default it
 * lives inside the working directory, which a container platform discards on redeploy —
 * the attachment rows would survive and the photographs behind them would not, which is
 * a silent loss of the evidence a customer is least able to recreate.
 *
 * Writability is checked at boot rather than at the first upload: a mount that is missing
 * or read-only should stop the process, not surprise someone mid-investigation.
 */
const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
try {
  accessSync(UPLOAD_DIR, constants.W_OK)
} catch {
  // eslint-disable-next-line no-console
  console.error(
    `\nUPLOAD_DIR is not writable: ${UPLOAD_DIR}\n` +
    'Incident evidence cannot be stored. Check the volume mount and its permissions.\n',
  )
  process.exit(1)
}

/**
 * Evidence photos and documents only. The allow-list is deliberately narrow: anything
 * executable or scriptable served back to a browser is a stored-XSS vector, and an
 * allow-list fails safe where a deny-list does not.
 */
const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['application/pdf', '.pdf'],
])

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    // The client filename is never used as a path. A server-generated UUID plus an
    // extension derived from the verified MIME type removes traversal and collisions.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_MIME.get(file.mimetype) ?? '.bin'}`),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, HEIC images and PDF documents are accepted.'))
      return
    }
    cb(null, true)
  },
})

incidentExtrasRouter.post('/:id/attachments', (req, res, next) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      const tooBig = /file too large/i.test(msg)
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'payload_too_large' : 'invalid_upload',
        message: tooBig ? 'Each file must be 10 MB or smaller.' : msg,
      })
    }
    try {
      const files = (req.files as Express.Multer.File[]) ?? []
      if (files.length === 0) {
        return res.status(400).json({ error: 'validation', message: 'No file was received.' })
      }
      const saved = []
      for (const f of files) {
      /*
       * Digest the bytes multer just wrote, before the row that points at them exists.
       *
       * Hashing here rather than while receiving means it reads the file back off disk once
       * more, which is the cost of not having to reimplement multer's storage. It also means
       * the digest covers what actually landed, not what was expected to.
       */
        const checksum = await sha256File(join(UPLOAD_DIR, f.filename))
        saved.push(await svc.addAttachment(callerOf(req), req.params.id, {
          originalName: f.originalname.slice(0, 255),
          storedName: f.filename,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          checksum,
          // Optional: a file can be evidence for one corrective action, or attached to
          // the incident generally. Same route, same allow-list, same storage.
          actionId: typeof req.body?.actionId === 'string' && req.body.actionId
            ? req.body.actionId : undefined,
        }))
      }
      res.status(201).json({ attachments: saved })
    } catch (e) {
      next(e)
    }
  })
})

/** Download. Authorisation is re-checked, so a stored name alone grants nothing. */
incidentExtrasRouter.get('/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const att = await svc.getAttachment(callerOf(req), req.params.attachmentId)
  // Force download rather than inline rendering: a PDF rendered in-origin can script.
  res.setHeader('Content-Type', att.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.originalName)}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(join(UPLOAD_DIR, att.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'not_found', message: 'File is missing from storage.' })
  })
}))

// ── Comments ─────────────────────────────────────────────────────────────────

const commentBody = z.object({
  body: z.string().min(1).max(5000),
  mentions: z.array(z.string().max(120)).max(20).optional(),
})

incidentExtrasRouter.post('/:id/comments', asyncRoute(async (req, res) => {
  const parsed = commentBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'A comment body is required.' })
  }
  const c = await svc.addComment(callerOf(req), req.params.id, parsed.data.body, parsed.data.mentions ?? [])
  res.status(201).json(c)
}))

// ── Corrective actions ───────────────────────────────────────────────────────

const actionBody = z.object({
  title: z.string().min(1).max(300),
  detail: z.string().max(5000).optional(),
  owner: z.string().min(1).max(200),
  dueDate: z.string().min(1),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  /** So the assignment notification reaches an account, not just a name. */
  ownerId: z.string().optional(),
  /** Decided at raise time; enforced server-side when the action is closed. */
  evidenceRequired: z.boolean().optional(),
})

incidentExtrasRouter.post('/:id/actions', asyncRoute(async (req, res) => {
  const parsed = actionBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid action payload.',
    })
  }
  res.status(201).json(await svc.addAction(callerOf(req), req.params.id, parsed.data))
}))

const actionPatch = z.object({
  status: z.enum(['open', 'in_progress', 'completed', 'verified', 'cancelled']).optional(),
  evidenceNote: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
  expectedVersion: z.number().int().optional(),
})

incidentExtrasRouter.patch('/actions/:actionId', asyncRoute(async (req, res) => {
  const parsed = actionPatch.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid action update.' })
  }
  res.json(await svc.updateAction(callerOf(req), req.params.actionId, parsed.data))
}))


// ── Root cause analysis ──────────────────────────────────────────────────────

const rcaBody = z.object({
  causes: z.array(z.object({
    id: z.string().max(120),
    category: z.string().max(120),
    description: z.string().min(1).max(2000),
  })).max(50),
  fiveWhys: z.object({
    problem: z.string().max(2000),
    whys: z.array(z.string().max(2000)).max(10),
    rootStatement: z.string().max(2000),
  }),
})

incidentExtrasRouter.put('/:id/rca', asyncRoute(async (req, res) => {
  const parsed = rcaBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid root cause payload.' })
  }
  res.json(await svc.saveRca(callerOf(req), req.params.id, parsed.data))
}))

incidentExtrasRouter.post('/:id/rca/approve', asyncRoute(async (req, res) => {
  res.json(await svc.approveRca(callerOf(req), req.params.id))
}))

// ── Archive ──────────────────────────────────────────────────────────────────

incidentExtrasRouter.post('/:id/archive', asyncRoute(async (req, res) => {
  res.json(await svc.archive(callerOf(req), req.params.id))
}))

// ── Action notes & analytics ─────────────────────────────────────────────────

incidentExtrasRouter.get('/actions/analytics', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.actionAnalytics(callerOf(req), companyId))
}))


incidentExtrasRouter.post('/actions/:actionId/notes', asyncRoute(async (req, res) => {
  const parsed = commentBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'A note body is required.' })
  }
  const n = await svc.addActionNote(callerOf(req), req.params.actionId, parsed.data.body, parsed.data.mentions ?? [])
  res.status(201).json(n)
}))

const standaloneBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1).max(300),
  detail: z.string().max(5000).optional(),
  owner: z.string().min(1).max(200),
  dueDate: z.string().min(1),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  source: z.enum(['audit', 'inspection', 'manual', 'training']).optional(),
})

/** Action raised outside an investigation. Mounted before /:id to stay reachable. */
incidentExtrasRouter.post('/actions', asyncRoute(async (req, res) => {
  const parsed = standaloneBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid action payload.',
    })
  }
  res.status(201).json(await svc.createStandaloneAction(callerOf(req), parsed.data))
}))

const actionsQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  status: z.string().optional(),
  owner: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  source: z.string().optional(),
})

incidentExtrasRouter.get('/actions/list', asyncRoute(async (req, res) => {
  const parsed = actionsQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  const { companyId, ...opts } = parsed.data
  res.json(await svc.listActions(callerOf(req), companyId, opts))
}))

/**
 * Registered last on purpose. Express matches routes in declaration order, so this
 * parameterised path must come after the literal /actions/list and /actions/analytics
 * or it captures them and treats "list" as an action id.
 */
incidentExtrasRouter.get('/actions/:actionId', asyncRoute(async (req, res) => {
  res.json(await svc.getAction(callerOf(req), req.params.actionId))
}))
