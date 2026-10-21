import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { sha256File } from '../lib/fileIntegrity.js'
import {
  ALLOWED_UPLOAD_TYPES, attachmentDisposition, discardUploads, settleUploadTypes,
} from '../lib/uploadSafety.js'
import { keepScope } from '../lib/tenantContext.js'
import { existsSync, mkdirSync, accessSync, constants, unlink } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import {
  alreadyAccepted, claim, isReplay, recordedAtOf,
} from '../lib/fieldRecord.js'
import { PermitError, requireFieldRole } from '../lib/permitService.js'
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
/**
 * Internal marker: this upload was already accepted under the same key.
 *
 * Not a DomainError, because it is not a refusal — it never reaches the client as an error.
 * It exists only to unwind out of the handler to the one place that cleans up the bytes
 * multer wrote, so the "already done" reply and the real failures share that cleanup rather
 * than each remembering to do it.
 */
class AlreadyUploaded extends Error {
  constructor(public permitId: string) {
    super('already uploaded')
  }
}

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
    // createdAt is the floor under a time a device reported for a photograph: evidence
    // cannot predate the permit it is evidence for (see lib/fieldRecord.ts).
    select: { id: true, companyId: true, code: true, status: true, createdAt: true },
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
  // keepScope: multer calls back from the upload stream, which has lost the request's
  // tenant scope; without it every query below would see no rows.
  upload.array('files', 5)(req, res, keepScope(async (err?: unknown) => {
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

      /*
       * The same photographs, sent twice.
       *
       * This is the upload a phone makes after walking back into coverage, and it is the
       * most expensive thing in the queue to repeat: a 4 MB photograph of a flange re-sent
       * on every drain, and the attachment list growing a duplicate each time, which an
       * auditor reads as two separate pieces of evidence.
       *
       * The key arrives as a form field rather than a JSON property because the body is
       * multipart. It is bounded like any other input: a client is not allowed to make the
       * server index an arbitrary string.
       */
      const meta = z.object({
        clientRef: z.string().min(8).max(100).optional(),
        recordedAt: z.string().datetime().optional(),
      }).catch({}).parse({
        clientRef: req.body?.clientRef || undefined,
        recordedAt: req.body?.recordedAt || undefined,
      })

      if (await alreadyAccepted(prisma, permit.companyId, meta.clientRef)) {
        // The bytes on disk from this attempt are not the ones the rows point at, so they
        // are cleaned up by the handler below as they would be for any other early exit.
        throw new AlreadyUploaded(permit.id)
      }

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

      /*
       * When the field took the photograph, as opposed to when it reached us.
       *
       * It goes on the timeline entry, which is where the permit is read as a sequence: a
       * photo of a gas detector logged four hours after the reading it shows is evidence of
       * nothing. The attachment row's own createdAt stays the server's clock, because that
       * column means "when this file was stored" and the list is ordered by it — there is
       * no capture-time column to put this in, and quietly redefining that one would
       * misreport storage time to anybody auditing the upload itself.
       */
      const at = recordedAtOf(meta, new Date(), { earliest: permit.createdAt })

      const saved = await prisma.$transaction(async (tx) => {
        await claim(tx, meta, {
          companyId: permit.companyId, operation: 'permit.attachment', subjectId: permit.id,
          userId: caller.userId, recordedAt: at,
        })
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
            at,
          },
        })
        return rows
      })

      res.status(201).json({ rows: saved })
    } catch (e) {
      // Nothing points at these yet: the rows are written in one transaction, so either
      // they all exist or none do.
      await discardUploads(UPLOAD_DIR, written)

      /*
       * These two are the same answer: this upload has already been accepted. One is found
       * before the work, the other is a second copy that raced it into the transaction.
       * Both reply with what the permit holds now, and a 200 rather than an error — the
       * queue has to be able to tell "already done" from "refused", or it marks a
       * photograph that is safely stored as something needing a person.
       */
      if (e instanceof AlreadyUploaded || isReplay(e)) {
        return res.json({ rows: await prisma.permitAttachment.findMany({
          where: { permitId: req.params.id }, orderBy: { createdAt: 'desc' },
        }) })
      }
      next(e)
    }
  }))
})

/** Download. Authorisation is re-checked, so a stored name alone grants nothing. */
permitAttachmentsRouter.get('/attachments/:attachmentId', asyncRoute(async (req, res) => {
  /*
   * The parent is fetched separately, not with `include`.
   *
   * PermitAttachment carries no companyId, so row-level security does not filter it - but
   * Permit does, and the relation is declared required. Including it for a row
   * belonging to another tenant therefore made Prisma throw inside the query itself
   * ("Field permit is required to return data, got `null` instead"), and the request
   * came back 500 instead of a refusal. No bytes ever leaked, but an unhandled error on
   * an authorisation path is the wrong failure: it pages somebody, it buries real faults,
   * and a 500 is a worse answer than a 404 to give an attacker probing ids.
   *
   * Two queries instead. The second is itself subject to row-level security, so another
   * tenant's permit simply is not there, and the answer is a clean 404 - which also
   * declines to confirm the file exists. The membership check below then still runs for
   * the case the database cannot see: it is the backstop if RLS is ever lost.
   */
  const att = await prisma.permitAttachment.findUnique({
    where: { id: req.params.attachmentId },
  })
  if (!att) throw new PermitError('not_found', 'Attachment not found.', 404)

  const parent = await prisma.permit.findFirst({
    where: { id: att.permitId },
    select: { companyId: true },
  })
  if (!parent) throw new PermitError('not_found', 'Attachment not found.', 404)

  if (!callerOf(req).roles.some((r) => r.companyId === parent.companyId)) {
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
  const membership = caller.roles.find((r) => r.companyId === att.permit.companyId)
  if (!membership) {
    throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
  }
  /*
   * Removing a permit's method statement, JSA, gas test sheet or isolation certificate is
   * taking away the evidence the job was authorised on, so it needs the same roles as the
   * other safety steps. It was open to every member - an employee or the read-only
   * executive could delete documents from a live permit.
   */
  requireFieldRole(membership.role, 'remove documents from a permit')
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
