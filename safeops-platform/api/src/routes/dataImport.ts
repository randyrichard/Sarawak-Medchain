import express, { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import {
  DataImportService, IMPORT_COLUMNS, IMPORT_KINDS, IMPORT_LABEL, IMPORT_NOUN, templateCsv, type ImportKind,
} from '../lib/dataImport.js'
import { MAX_IMPORT_ROWS } from '../lib/csvParse.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * Importing a company's existing registers from a CSV file. See lib/dataImport.ts.
 *
 * The file arrives as text/csv, not inside JSON: the JSON parser's 100 kB limit is right for
 * a form and too small for a register, and a CSV posted as itself is also what a person can
 * reproduce with curl when an import needs checking. Its own limit, 2 MB, holds 2,000 rows
 * with room to spare.
 */
const svc = new DataImportService(prisma)
export const dataImportRouter = Router()

dataImportRouter.use(requireAuth)

const csvBody = express.text({ type: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'], limit: '2mb' })

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const kindOf = (raw: string): ImportKind | null => (IMPORT_KINDS as readonly string[]).includes(raw) ? raw as ImportKind : null

/** What can be imported, with every column: the screen's guide and the template agree. */
dataImportRouter.get('/catalog', (_req, res) => {
  res.json({
    maxRows: MAX_IMPORT_ROWS,
    kinds: IMPORT_KINDS.map((kind) => ({ kind, label: IMPORT_LABEL[kind], noun: IMPORT_NOUN[kind], columns: IMPORT_COLUMNS[kind] })),
  })
})

/** The template, with a byte-order mark so Excel opens it as UTF-8 rather than mangling a name. */
dataImportRouter.get('/:kind/template.csv', (req, res) => {
  const kind = kindOf(req.params.kind)
  if (!kind) return res.status(404).json({ error: 'not_found', message: 'Unknown import.' })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="safechain-${kind.replace('_', '-')}-template.csv"`)
  res.send(`\uFEFF${templateCsv(kind)}`)
})

const fileOf = (req: express.Request) => (typeof req.body === 'string' ? req.body : null)

dataImportRouter.post('/:kind/preview', csvBody, asyncRoute(async (req, res) => {
  const kind = kindOf(req.params.kind)
  if (!kind) return res.status(404).json({ error: 'not_found', message: 'Unknown import.' })
  const companyId = String(req.query.companyId ?? '')
  const csv = fileOf(req)
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  if (csv === null) return res.status(400).json({ error: 'validation', message: 'Send the file as CSV text.' })
  res.json(await svc.preview(callerOf(req), companyId, kind, csv))
}))

dataImportRouter.post('/:kind', csvBody, asyncRoute(async (req, res) => {
  const kind = kindOf(req.params.kind)
  if (!kind) return res.status(404).json({ error: 'not_found', message: 'Unknown import.' })
  const companyId = String(req.query.companyId ?? '')
  const csv = fileOf(req)
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  if (csv === null) return res.status(400).json({ error: 'validation', message: 'Send the file as CSV text.' })
  res.json(await svc.run(callerOf(req), companyId, kind, csv, ctxOf(req)))
}))
