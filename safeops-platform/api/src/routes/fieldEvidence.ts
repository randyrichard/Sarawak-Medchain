import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, accessSync, constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { sha256File } from '../lib/fileIntegrity.js'
import {
  ALLOWED_UPLOAD_TYPES, attachmentDisposition, discardUploads, settleUploadTypes,
} from '../lib/uploadSafety.js'
import { keepScope } from '../lib/tenantContext.js'
import { type EvidenceTarget, FieldEvidenceService, toEvidenceView } from '../lib/fieldEvidenceService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * Field evidence: photos for inspections, audit answers and standalone corrective actions.
 *
 *   POST /evidence/{inspections|audits|actions}/:id   multipart `files` (up to 5), audits may send `itemId`
 *   GET  /evidence/{inspections|audits|actions}/:id   the files kept against that record
 *   GET  /evidence/file/:evidenceId                   download, re-authorised every time
 *
 * Same storage, allow-list, size limit, type sniffing and SHA-256 as incident evidence.
 * Who may add and see what is in lib/fieldEvidenceService.ts.
 */
export const fieldEvidenceRouter = Router()
fieldEvidenceRouter.use(requireAuth)

const svc = new FieldEvidenceService(prisma)

const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
try {
  accessSync(UPLOAD_DIR, constants.W_OK)
} catch {
  // eslint-disable-next-line no-console
  console.error(`\nUPLOAD_DIR is not writable: ${UPLOAD_DIR}\nField evidence cannot be stored. Check the volume mount and its permissions.\n`)
  process.exit(1)
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    // Never the client's name: a server UUID and an extension from the verified type.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_UPLOAD_TYPES.get(file.mimetype) ?? '.bin'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, HEIC images and PDF documents are accepted.'))
      return
    }
    cb(null, true)
  },
})

const KINDS = { inspections: 'inspection', audits: 'audit', actions: 'action' } as const
type Plural = keyof typeof KINDS

function targetOf(kind: string, id: string, itemId?: unknown): EvidenceTarget | null {
  const k = KINDS[kind as Plural]
  if (!k) return null
  if (k === 'audit') return { kind: k, id, itemId: typeof itemId === 'string' ? itemId : undefined }
  return { kind: k, id }
}

fieldEvidenceRouter.get('/file/:evidenceId', asyncRoute(async (req, res) => {
  const row = await svc.get(callerOf(req), req.params.evidenceId)
  res.setHeader('Content-Type', row.mimeType)
  res.setHeader('Content-Disposition', attachmentDisposition(row.originalName, row.mimeType))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(join(UPLOAD_DIR, row.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'not_found', message: 'File is missing from storage.' })
  })
}))

fieldEvidenceRouter.get('/:kind/:id', asyncRoute(async (req, res) => {
  const t = targetOf(req.params.kind, req.params.id)
  if (!t) return res.status(404).json({ error: 'not_found', message: 'Not found.' })
  res.json({ rows: (await svc.list(callerOf(req), t)).map(toEvidenceView) })
}))

fieldEvidenceRouter.post('/:kind/:id', (req, res, next) => {
  if (!KINDS[req.params.kind as Plural]) return res.status(404).json({ error: 'not_found', message: 'Not found.' })
  // keepScope: multer calls back from the upload stream, which has lost the request's
  // tenant scope; without it every query below would see no rows.
  upload.array('files', 5)(req, res, keepScope(async (err?: unknown) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (err) {
      await discardUploads(UPLOAD_DIR, files)
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      const tooBig = /file too large/i.test(msg)
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'payload_too_large' : 'invalid_upload',
        message: tooBig ? 'Each file must be 10 MB or smaller.' : msg,
      })
    }
    try {
      if (files.length === 0) {
        return res.status(400).json({ error: 'validation', message: 'No file was received.' })
      }
      const mismatch = await settleUploadTypes(UPLOAD_DIR, files)
      if (mismatch) {
        await discardUploads(UPLOAD_DIR, files)
        return res.status(400).json({
          error: 'invalid_upload',
          message: `${mismatch.originalname.slice(0, 120)} is not the kind of file its name says it is.`,
        })
      }
      const stored = []
      for (const f of files) {
        stored.push({
          originalName: f.originalname, storedName: f.filename, mimeType: f.mimetype,
          sizeBytes: f.size, checksum: await sha256File(join(UPLOAD_DIR, f.filename)),
        })
      }
      const rows = await svc.add(callerOf(req), targetOf(req.params.kind, req.params.id, req.body?.itemId)!, stored)
      res.status(201).json({ rows: rows.map(toEvidenceView) })
    } catch (e) {
      // Nothing points at these files if the rows were refused, so they go.
      await discardUploads(UPLOAD_DIR, files)
      next(e)
    }
  }))
})
