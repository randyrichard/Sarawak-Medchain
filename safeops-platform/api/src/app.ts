import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { authRouter } from './routes/auth.js'
import { incidentsRouter } from './routes/incidents.js'
import { incidentExtrasRouter } from './routes/incidentExtras.js'
import { permitsRouter } from './routes/permits.js'
import { inspectionsRouter } from './routes/inspections.js'
import { auditsRouter } from './routes/audits.js'
import { trainingRouter } from './routes/training.js'
import { adminRouter } from './routes/admin.js'
import { orgRouter } from './routes/org.js'
import { notificationsRouter } from './routes/notifications.js'
import { activityRouter } from './routes/activity.js'
import { accountRouter } from './routes/account.js'
import { searchRouter } from './routes/search.js'
import { employeesRouter } from './routes/employees.js'
import { AuthError } from './lib/authService.js'
import { IncidentError } from './lib/incidentService.js'
import { PermitError } from './lib/permitService.js'
import { InspectionError } from './lib/inspectionService.js'
import { AuditError } from './lib/auditService.js'
import { TrainingError } from './lib/trainingService.js'
import { AdminError } from './lib/adminService.js'
import { OrgError } from './lib/orgService.js'
import { NotificationError } from './lib/notificationService.js'
import { ActivityError } from './lib/activityService.js'
import { AccountError } from './lib/accountService.js'
import { SearchError } from './lib/searchService.js'
import { EmployeeError } from './lib/employeeService.js'

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

  /**
   * Request log.
   *
   * One line per request with the actor, so "it failed this morning" is answerable. The
   * user id comes from the verified token rather than anything the client sent, and no
   * body, query string or header is logged — those carry the customer's safety data and
   * their session.
   */
  app.use((req, res, next) => {
    const started = Date.now()
    // Captured now, not in the finish handler. Express rewrites `req.url` to be relative
    // to the mount point while a router handles the request, so reading it later reported
    // `/admin/health` as `/health` — an operations log that says a health check returned
    // 403 sends whoever reads it somewhere the problem is not.
    const path = req.originalUrl.split('?')[0]
    res.on('finish', () => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        method: req.method,
        path,
        status: res.statusCode,
        ms: Date.now() - started,
        user: req.auth?.sub ?? null,
        ip: req.ip,
      }))
    })
    next()
  })

  /**
   * A ceiling, not a throttle.
   *
   * Every module endpoint requires a session, so this is not an authentication control —
   * it stops one careless or compromised account exhausting the connection pool for every
   * other tenant.
   *
   * The budget is per IP, and a customer behind corporate NAT is one IP. It therefore has
   * to accommodate a whole site, not one person: the dashboard alone issues nine requests
   * and draining a large list issues up to forty, so a busy forty-person office generates
   * far more than a single user's share. Health checks are exempt so an orchestrator can
   * never be rate-limited into declaring the service dead.
   */
  app.use(rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/health'),
    message: { error: 'rate_limited', message: 'Too many requests. Slow down and try again shortly.' },
  }))

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
  app.use('/permits', permitsRouter)
  app.use('/assets', inspectionsRouter)
  app.use('/audits', auditsRouter)
  app.use('/training', trainingRouter)
  app.use('/admin', adminRouter)
  app.use('/org', orgRouter)
  app.use('/notifications', notificationsRouter)
  app.use('/activity', activityRouter)
  app.use('/account', accountRouter)
  app.use('/search', searchRouter)
  app.use('/employees', employeesRouter)

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  // Central error handler: clients get a stable code, details stay in the server log.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (
      err instanceof AuthError ||
      err instanceof IncidentError ||
      err instanceof PermitError ||
      err instanceof InspectionError ||
      err instanceof AuditError ||
      err instanceof TrainingError ||
      err instanceof AdminError ||
      err instanceof OrgError ||
      err instanceof NotificationError ||
      err instanceof ActivityError ||
      err instanceof AccountError ||
      err instanceof SearchError ||
      err instanceof EmployeeError
    ) {
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

    // A database that is down is not a bug in the request. Observed during a real outage:
    // every call returned 500, which tells a proxy the response is final and tells a
    // monitor the application is broken. 503 says "unavailable, try again", which is what
    // is actually true and what lets a load balancer and an operator behave correctly.
    const name = (err as { name?: string })?.name ?? ''
    if (name === 'PrismaClientInitializationError' || name === 'PrismaClientRustPanicError') {
      // eslint-disable-next-line no-console
      console.error('[safeops-api] database unavailable:', err)
      res.setHeader('Retry-After', '5')
      return res.status(503).json({
        error: 'unavailable',
        message: 'The service is temporarily unavailable. Please try again shortly.',
      })
    }

    // eslint-disable-next-line no-console
    console.error('[safeops-api] unhandled error:', err)
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' })
  })

  return app
}
