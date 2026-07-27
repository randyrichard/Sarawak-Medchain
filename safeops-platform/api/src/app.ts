import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { authRouter } from './routes/auth.js'
import { incidentsRouter } from './routes/incidents.js'
import { incidentExtrasRouter } from './routes/incidentExtras.js'
import { AuthError } from './lib/authService.js'
import { IncidentError } from './lib/incidentService.js'

export function createApp() {
  const app = express()

  // Behind a load balancer, req.ip must reflect the client, not the proxy — otherwise
  // per-IP rate limiting buckets every user together.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  // Bounded body size: an unbounded parser is a trivial memory-exhaustion vector.
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ready' })
    } catch {
      res.status(503).json({ status: 'unavailable', dependency: 'database' })
    }
  })

  app.use('/auth', authRouter)
  // Mounted first: its literal paths would otherwise be captured by /incidents/:id
  app.use('/incidents', incidentExtrasRouter)
  app.use('/incidents', incidentsRouter)

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  // Central error handler: clients get a stable code, details stay in the server log.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AuthError || err instanceof IncidentError) {
      return res.status(err.status).json({ error: err.code, message: err.message })
    }

    // Body-parser failures are client errors; reporting them as 500 hides a bad request
    // behind an apparent server fault and pollutes error budgets.
    const type = (err as { type?: string })?.type
    if (type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' })
    }
    if (type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'malformed_json', message: 'Request body is not valid JSON.' })
    }

    // eslint-disable-next-line no-console
    console.error('[safeops-api] unhandled error:', err)
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' })
  })

  return app
}
