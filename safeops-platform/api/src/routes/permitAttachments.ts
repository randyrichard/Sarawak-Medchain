import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { sha256File } from '../lib/fileIntegrity.js'
import {
  ALLOWED_UPLOAD_TYPES, attachmentDisposition, discardUploads, settleUploadTypes,
} from '../lib/uploadSafety.js'
import { existsSync, mkdirSync, accessSync, constants, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { PermitError } from '../lib/permitService.js'
import type { Caller } from '../domain/caller.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * Permit documents: method statements, JSAs, gas test sheets, isolation certificates
 * and site photos.
 *
 * Same storage contract as incident evidence, deliberately — one way of handling
 * uploaded files in this codebase, not two. The client filename is never a path, the
 * MIME allow-list is narrow because anything scriptable served back in-origin is a
 * stored-XSS vector, and downloads are forced rather than rendered inline.
 */
export const permitAttachmentsRouter = Router()

permitAttachmentsRouter.use(requireAuth)

const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
try {
  accessSync(UPLOAD_DIR, constants.W_OK)
} catch {
  // eslint-disable-next-line no-console
  console.error(
    `\nUPLOAD_DIR is not writable: ${UPLOAD_DIR}\n` +
    'Permit documents cannot be stored. Check the volume mount and its permissions.\n',
  )
  process.exit(1)
}

const ALLOWED_MIME = ALLOWED_UPLOAD_TYPES

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

const KINDS = ['method_statement', 'jsa', 'gas_test_sheet', 'isolation_certificate', 'photo', 'other'] as const

/** Membership check. A stored name alone must never be enough to reach a file. */
async function permitFor(caller: Caller, permitId: string) {
  const permit = await prisma.permit.findUnique({
    where: { id: permitId },
    select: { id: true, companyId: true, code: true, status: true },
  })
  if (!permit) throw new PermitError('not_found', 'Permit not found.', 404)
  if (!caller.roles.some((r) => r.companyId === permit.companyId)) {
    throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
  }
  return permit
}

permitAttachmentsRouter.get('/:id/attachments', asyncRoute(async (req, res) => {
  await permitFor(callerOf(req), req.params.id)
  const rows = await prisma.permitAttachment.findMany({
    where: { permitId: req.params.id },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ rows })
}))

permitAttachmentsRouter.post('/:id/attachments', (req, res, next) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      // Multer rejections are client errors — a 500 here would blame the server for a
      // file the server correctly refused.
      return res.status(400).json({ error: 'validation', message: (err as Error).message })
    }
    const written = (req.files ?? []) as Express.Multer.File[]
    try {
      const caller = callerOf(req)
      const permit = await permitFor(caller, req.params.id)
      if (['closed', 'archived'].includes(permit.status)) {
        throw new PermitError('validation', 'This permit is closed. Documents can no longer be added.')
      }

      const kind = z.enum(KINDS).catch('other').parse(req.body?.kind)
      const files = (req.files ?? []) as Express.Multer.File[]
      if (files.length === 0) throw new PermitError('validation', 'Choose at least one file.')
      const mismatch = await settleUploadTypes(UPLOAD_DIR, files)
      if (mismatch) {
        throw new PermitError('validation', `${mismatch.originalname.slice(0, 120)} is not the kind of file its name says it is.`)
      }

      /*
       * Digest the bytes multer just wrote, before the row that points at them exists.
       *
       * Hashing here rather than while receiving means it reads the file back off disk once
       * more, which is the cost of not having to reimplement multer's storage. It also means
       * the digest covers what actually landed, not what was expected to.
       */
      const digests = new Map(await Promise.all(files.map(async (f) =>
        [f.filename, await sha256File(join(UPLOAD_DIR, f.filename))] as const)))

      const saved = await prisma.$transaction(async (tx) => {
        const rows = await Promise.all(files.map((f) =>
          tx.permitAttachment.create({
            data: {
              permitId: permit.id,
              kind,
              originalName: f.originalname,
              storedName: f.filename,
              mimeType: f.mimetype,
              sizeBytes: f.size,
              checksum: digests.get(f.filename) ?? null,
              uploadedBy: caller.name,
              uploadedById: caller.userId,
            },
          })))
        await tx.permitEvent.create({
          data: {
            permitId: permit.id,
            action: 'Document attached',
            detail: rows.map((r) => r.originalName).join(', '),
            actor: caller.name,
          },
        })
        return rows
      })

      res.status(201).json({ rows: saved })
    } catch (e) {
      // Nothing points at these yet: the rows are written in one transaction, so either
      // they all exist or none do.
      await discardUploads(UPLOAD_DIR, written)
      next(e)
    }
  })
})

/** Download. Authorisation is re-checked, so a stored name alone grants nothing. */
permitAttachmentsRouter.get('/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const att = await prisma.permitAttachment.findUnique({
    where: { id: req.params.attachmentId },
    include: { permit: { select: { companyId: true } } },
  })
  if (!att) throw new PermitError('not_found', 'Attachment not found.', 404)
  if (!callerOf(req).roles.some((r) => r.companyId === att.permit.companyId)) {
    throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
  }

  res.setHeader('Content-Type', att.mimeType)
  // Forced download rather than inline: a PDF rendered in-origin can script.
  res.setHeader('Content-Disposition', attachmentDisposition(att.originalName, att.mimeType))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(join(UPLOAD_DIR, att.storedName), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'not_found', message: 'File is missing from storage.' })
    }
  })
}))

permitAttachmentsRouter.delete('/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const caller = callerOf(req)
  const att = await prisma.permitAttachment.findUnique({
    where: { id: req.params.attachmentId },
    include: { permit: { select: { id: true, companyId: true, status: true } } },
  })
  if (!att) throw new PermitError('not_found', 'Attachment not found.', 404)
  if (!caller.roles.some((r) => r.companyId === att.permit.companyId)) {
    throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
  }
  if (['closed', 'archived'].includes(att.permit.status)) {
    throw new PermitError('validation', 'This permit is closed. Its documents are part of the record.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.permitAttachment.delete({ where: { id: att.id } })
    await tx.permitEvent.create({
      data: {
        permitId: att.permit.id,
        action: 'Document removed',
        detail: att.originalName,
        actor: caller.name,
      },
    })
  })

  // Best effort: the row is the record, the blob is a cache of it. A file left behind
  // is untidy; a row pointing at a deleted file is a broken download.
  unlink(join(UPLOAD_DIR, att.storedName), () => {})

  res.status(204).end()
}))
