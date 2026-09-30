import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { SearchError, SearchService } from '../lib/searchService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { callerOf } from '../middleware/caller.js'

const svc = new SearchService(prisma)
export const searchRouter = Router()

searchRouter.use(requireAuth)

const query = z.object({
  companyId: z.string().min(1),
  // Bounded: a search box is a text input on the internet, and a 10 kB LIKE pattern is a
  // free table scan for anyone who wants one.
  q: z.string().max(120),
})

searchRouter.get('/', async (req, res, next) => {
  try {
    const parsed = query.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid search request.' })
    }
    const hits = await svc.search(callerOf(req), parsed.data.companyId, parsed.data.q)
    res.json({ hits, query: parsed.data.q.trim() })
  } catch (e) {
    next(e)
  }
})

export { SearchError }
