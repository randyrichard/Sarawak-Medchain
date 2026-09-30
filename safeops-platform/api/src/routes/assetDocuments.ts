import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { sha256File } from '../lib/fileIntegrity.js'
import { existsSync, mkdirSync, accessSync, constants, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { EquipmentError } from '../lib/equipmentService.js'
import type { Caller } from '../domain/caller.js'
import { requireAuth } from '../http/requireAuth.js'
import type { Role } from '@prisma/client'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * Equipment photos, manuals and scanned certificates.
 *
 * Same storage contract as permit documents and incident evidence, deliberately - one way
 * of handling uploaded files in this codebase, not three. The client filename is never a
 * path, the MIME allow-list is narrow because anything scriptable served back in-origin is
 * a stored-XSS vector, and downloads are forced rather than rendered inline.
 */
export const assetDocumentsRouter = Router()

assetDocumentsRouter.use(requireAuth)

const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
try {
  accessSync(UPLOAD_DIR, constants.W_OK)
} catch {
  // eslint-disable-next-line no-console
  console.error(
    `\nUPLOAD_DIR is not writable: ${UPLOAD_DIR}\n` +
    'Equipment photos and documents cannot be stored. Check the volume mount and its permissions.\n',
  )
  process.exit(1)
}

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['application/pdf', '.pdf'],
])

const MAX_FILE_BYTES = 10 * 1024 * 1024

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
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

const KINDS = ['photo', 'manual', 'certificate', 'other'] as const

/** Who may attach or remove a file. Matches the equipment write roles. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/** Membership check. A stored name alone must never be enough to reach a file. */
async function assetFor(caller: Caller, assetId: string, write = false) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, companyId: true, code: true, name: true },
  })
  if (!asset) throw new EquipmentError('not_found', 'Equipment not found.', 404)
  const m = caller.roles.find((r) => r.companyId === asset.companyId)
  if (!m) throw new EquipmentError('forbidden', 'You do not have access to this workspace.', 403)
  if (write && !WRITE_ROLES.includes(m.role)) {
    throw new EquipmentError('forbidden', 'Your role does not permit changing equipment files.', 403)
  }
  return { asset, role: m.role }
}

/** A photo is only downloadable when a file was actually stored behind the row. */
const toView = (d: {
  id: string; name: string; kind: string; originalName: string | null
  storedName: string | null; mimeType: string | null; sizeBytes: number | null
  uploadedBy: string | null; createdAt: Date
}) => ({
  id: d.id,
  name: d.originalName ?? d.name,
  kind: d.kind,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  uploadedBy: d.uploadedBy,
  createdAt: d.createdAt.toISOString(),
  /** False for rows that predate real storage: shown, but with nothing to fetch. */
  hasFile: !!d.storedName,
  isImage: !!d.mimeType?.startsWith('image/'),
})

assetDocumentsRouter.get('/:assetId/documents', asyncRoute(async (req, res) => {
  await assetFor(callerOf(req), req.params.assetId)
  const rows = await prisma.assetDocument.findMany({
    where: { assetId: req.params.assetId },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ rows: rows.map(toView) })
}))

assetDocumentsRouter.post('/:assetId/documents', (req, res, next) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      // Multer rejections are client errors - a 500 here would blame the server for a
      // file the server correctly refused.
      return res.status(400).json({ error: 'validation', message: (err as Error).message })
    }
    try {
      const caller = callerOf(req)
      const { asset, role } = await assetFor(caller, req.params.assetId, true)

      const kind = z.enum(KINDS).catch('other').parse(req.body?.kind)
      const files = (req.files ?? []) as Express.Multer.File[]
      if (files.length === 0) throw new EquipmentError('validation', 'Choose at least one file.')
      if (kind === 'photo' && files.some((f) => !f.mimetype.startsWith('image/'))) {
        throw new EquipmentError('validation', 'A photo has to be an image.')
      }

      /*
       * Digest the bytes multer just wrote, before the rows that point at them exist.
       *
       * Outside the transaction on purpose: hashing a 10 MB file is slow enough that doing
       * it with a transaction open would hold a database connection for the duration, for
       * no benefit - the digest depends on the file, not on anything in the transaction.
       */
      const digests = new Map(await Promise.all(files.map(async (f) =>
        [f.filename, await sha256File(join(UPLOAD_DIR, f.filename))] as const)))

      const saved = await prisma.$transaction(async (tx) => {
        const rows = await Promise.all(files.map((f) =>
          tx.assetDocument.create({
            data: {
              assetId: asset.id,
              kind,
              name: f.originalname,
              originalName: f.originalname,
              storedName: f.filename,
              mimeType: f.mimetype,
              sizeBytes: f.size,
              checksum: digests.get(f.filename) ?? null,
              uploadedBy: caller.name,
              uploadedById: caller.userId,
            },
          })))
        await tx.assetEvent.create({
          data: {
            assetId: asset.id,
            kind: 'created',
            summary: kind === 'photo'
              ? `Photo added: ${rows.map((r) => r.name).join(', ')}`
              : `Document attached: ${rows.map((r) => r.name).join(', ')}`,
            actor: caller.name, actorRole: role,
            refType: 'document', refId: rows[0].id,
          },
        })
        return rows
      })

      res.status(201).json({ rows: saved.map(toView) })
    } catch (e) {
      next(e)
    }
  })
})

/** Download. Authorisation is re-checked, so a stored name alone grants nothing. */
assetDocumentsRouter.get('/documents/:documentId', asyncRoute(async (req, res) => {
  const doc = await prisma.assetDocument.findUnique({
    where: { id: req.params.documentId },
    include: { asset: { select: { companyId: true } } },
  })
  if (!doc) throw new EquipmentError('not_found', 'Document not found.', 404)
  if (!callerOf(req).roles.some((r) => r.companyId === doc.asset.companyId)) {
    throw new EquipmentError('forbidden', 'You do not have access to this workspace.', 403)
  }
  if (!doc.storedName) {
    throw new EquipmentError('not_found', 'This record has no file behind it.', 404)
  }

  res.setHeader('Content-Type', doc.mimeType ?? 'application/octet-stream')
  // Forced download rather than inline: a PDF rendered in-origin can script. The client
  // fetches it as a blob and builds its own object URL for previews.
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName ?? doc.name)}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(join(UPLOAD_DIR, doc.storedName), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'not_found', message: 'File is missing from storage.' })
    }
  })
}))

assetDocumentsRouter.delete('/documents/:documentId', asyncRoute(async (req, res) => {
  const caller = callerOf(req)
  const doc = await prisma.assetDocument.findUnique({
    where: { id: req.params.documentId },
    include: { asset: { select: { id: true, companyId: true } } },
  })
  if (!doc) throw new EquipmentError('not_found', 'Document not found.', 404)
  const m = caller.roles.find((r) => r.companyId === doc.asset.companyId)
  if (!m) throw new EquipmentError('forbidden', 'You do not have access to this workspace.', 403)
  if (!WRITE_ROLES.includes(m.role)) {
    throw new EquipmentError('forbidden', 'Your role does not permit changing equipment files.', 403)
  }

  await prisma.$transaction(async (tx) => {
    await tx.assetDocument.delete({ where: { id: doc.id } })
    await tx.assetEvent.create({
      data: {
        assetId: doc.asset.id,
        kind: 'created',
        summary: `${doc.kind === 'photo' ? 'Photo' : 'Document'} removed: ${doc.originalName ?? doc.name}`,
        actor: caller.name, actorRole: m.role,
      },
    })
  })

  // Best effort: the row is the record, the blob is a cache of it. A file left behind is
  // untidy; a row pointing at a deleted file is a broken download.
  if (doc.storedName) unlink(join(UPLOAD_DIR, doc.storedName), () => {})

  res.status(204).end()
}))
