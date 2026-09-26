import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { PrismaRateLimitStore } from './lib/rateLimitStore.js'
import { authRouter } from './routes/auth.js'
import { incidentsRouter } from './routes/incidents.js'
import { incidentExtrasRouter } from './routes/incidentExtras.js'
import { permitsRouter } from './routes/permits.js'
import { permitAttachmentsRouter } from './routes/permitAttachments.js'
import { inspectionsRouter } from './routes/inspections.js'
import { equipmentRouter } from './routes/equipment.js'
import { assetDocumentsRouter } from './routes/assetDocuments.js'
import { visitorsRouter } from './routes/visitors.js'
import { reportsRouter } from './routes/reports.js'
import { incidentInvestigationRouter } from './routes/incidentInvestigation.js'
import { auditsRouter } from './routes/audits.js'
import { trainingRouter } from './routes/training.js'
import { adminRouter } from './routes/admin.js'
import { orgRouter } from './routes/org.js'
import { notificationsRouter } from './routes/notifications.js'
import { activityRouter } from './routes/activity.js'
import { accountRouter } from './routes/account.js'
import { searchRouter } from './routes/search.js'
import { employeesRouter } from './routes/employees.js'
import { contractorsRouter } from './routes/contractors.js'
import { dashboardRouter } from './routes/dashboard.js'
import { orgAdminRouter, inviteRouter } from './routes/orgAdmin.js'
import { platformRouter } from './routes/platform.js'
import { ProvisioningError } from './lib/provisioningService.js'
import { OrgAdminError } from './lib/orgAdminService.js'
import { v1Router } from './routes/v1.js'
import { hashApiKey } from './lib/apiKeyAuth.js'
import { DashboardError } from './lib/dashboardService.js'
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
import { ContractorError } from './lib/contractorService.js'
import { ToolboxError } from './lib/toolboxService.js'
import { toolboxRouter } from './routes/toolbox.js'
import { EquipmentError } from './lib/equipmentService.js'
import { VisitorError } from './lib/visitorService.js'
import { ReportError } from './lib/reportService.js'
import { InvestigationError } from './lib/incidentInvestigation.js'

/**
 * Removes single-use credentials from a path before it is logged.
 *
 * Invitation and reset links carry their token as a path segment, and the request log is
 * the one artefact that routinely leaves the database's blast radius - retained on disk,
 * shipped to an aggregator, pasted into a support ticket. Logged raw, anybody who can read
 * it could redeem an invitation before its recipient and take over the account it was
 * meant for, including the first administrator of a brand-new customer.
 *
 * The route shape is kept, because "somebody opened an invitation link and got a 400" is
 * exactly what an operations log is for. Only the secret goes.
 */
export function redactPath(path: string): string {
  return path
    .replace(/^\/invitations\/[^/]+/, '/invitations/:token')
    .replace(/^\/auth\/reset-password\/[^/]+/, '/auth/reset-password/:token')
}

export function createApp() {
  const app = express()

  /*
   * WHICH peers may speak for a client, rather than how many.
   *
   * `req.ip` is not cosmetic: it is the key the rate limiter buckets on, and it is written
   * into the audit trail and the login history a customer is buying.
   *
   * This was a hop count, and a hop count is not capable of securing it — it says how many
   * X-Forwarded-For entries to believe and never who was entitled to add them, so any
   * non-zero value makes Express treat whoever opened the socket as a proxy. Measured
   * against this API before the change: three requests differing only in an
   * X-Forwarded-For header produced three separate rate-limit buckets. Rotating the header
   * is therefore an unlimited supply of fresh rate-limit budgets, and the same header
   * chooses what the audit trail records as the actor's address.
   *
   * An address list fixes it at the root. Express checks the peer against this list before
   * believing anything it forwarded; from anyone else the header is ignored and req.ip is
   * the socket address, which cannot be forged over an established TCP connection.
   */
  app.set('trust proxy', env.trustProxy)

  /*
   * Discard X-Forwarded-For from anything that cannot prove it is the proxy.
   *
   * The address list above is necessary and, behind Docker, not sufficient - and that was
   * measured rather than reasoned about. Every connection arriving through a published port
   * is source-NATed to the bridge gateway (172.19.0.1 on this network), which is a private
   * address and so matches `uniquelocal`. The list therefore cannot separate Caddy on the
   * compose network from anything else able to reach the port: after switching from a hop
   * count to the list, three requests differing only in a forged X-Forwarded-For still
   * produced three separate rate-limit buckets.
   *
   * No address list can fix that, because Docker overwrote the address that would have
   * distinguished them. A shared secret can. Caddy sets this header (see deploy/Caddyfile);
   * a client cannot guess it, so its forged header is deleted here - before the rate
   * limiter, the request logger, or anything else reads req.ip.
   *
   * Deleting rather than rejecting is deliberate. A request with a stray X-Forwarded-For is
   * not necessarily hostile - corporate proxies add one - and refusing it would break
   * legitimate traffic to protect a field we can simply ignore. Stripped, the request is
   * served normally and attributed to the address it actually came from.
   *
   * Skipped entirely when no token is configured, which leaves TRUST_PROXY governing on its
   * own. env.ts refuses that in production.
   */
  if (env.PROXY_TOKEN) {
    app.use((req, _res, next) => {
      if (req.get('x-safeops-proxy') !== env.PROXY_TOKEN) {
        delete req.headers['x-forwarded-for']
      }
      // Never pass it upstream, whether it matched or not: it is a credential, and the
      // request handlers below have no business seeing it.
      delete req.headers['x-safeops-proxy']
      next()
    })
  }
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
    const path = redactPath(req.originalUrl.split('?')[0])
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
    store: new PrismaRateLimitStore(prisma, 'global'),
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

  // Mounted at the root and ahead of every parent it borrows a prefix from. It serves
  // /assets/:id/calibrations, /permits/:id/equipment and /incidents/:id/equipment, and
  // each of those parents is keyed on a path parameter that would otherwise capture the
  // segment. Same ordering rule as the incident extras below.
  /*
   * The integration API, on its own budget.
   *
   * Keyed on the presented key rather than the caller's address, because an integration is
   * a program: it runs from one host and can go from idle to a tight loop between two
   * ticks, which is a different shape of risk from the office-behind-one-NAT case the
   * global ceiling above is sized for. Both apply; this is the tighter of the two.
   *
   * The bucket is the SHA-256 of what was presented, so a key never appears in a limiter
   * row, and an unrecognised key is throttled the same as a real one - which is what stops
   * the endpoint being used to search for valid keys. Requests with no bearer token at all
   * fall back to the address, so they cannot all share one bucket.
   */
  app.use('/v1', rateLimit({
    store: new PrismaRateLimitStore(prisma, 'apikey'),
    windowMs: 60_000,
    limit: env.API_KEY_RATE_LIMIT_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const header = req.headers.authorization
      const presented = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
      return presented ? `k:${hashApiKey(presented)}` : `ip:${req.ip}`
    },
    message: { error: 'rate_limited', message: 'Too many requests for this API key.' },
  }), v1Router)

  app.use('/', equipmentRouter)
  app.use('/auth', authRouter)
  // Mounted first: its literal paths would otherwise be captured by /incidents/:id
  app.use('/incidents', incidentInvestigationRouter)
  app.use('/incidents', incidentExtrasRouter)
  app.use('/incidents', incidentsRouter)
  app.use('/permits', permitAttachmentsRouter)
  app.use('/permits', permitsRouter)
  // Before the asset router: its /:idOrQr would otherwise match /assets/documents.
  app.use('/assets', assetDocumentsRouter)
  app.use('/assets', inspectionsRouter)
  app.use('/visitors', visitorsRouter)
  app.use('/toolbox', toolboxRouter)
  app.use('/reports', reportsRouter)
  app.use('/audits', auditsRouter)
  app.use('/training', trainingRouter)
  // Before the console router: its literal paths must not be captured by anything there,
  // and mounting order is the only thing that guarantees it.
  app.use('/admin', orgAdminRouter)
  app.use('/admin', adminRouter)
  // Unauthenticated on purpose - an invitee has no session. The token is the authority.
  app.use('/invitations', inviteRouter)
  // Above every customer rather than inside one, so it never shares an authorization
  // model with the tenant-scoped console.
  app.use('/platform', platformRouter)
  app.use('/org', orgRouter)
  app.use('/notifications', notificationsRouter)
  app.use('/activity', activityRouter)
  app.use('/account', accountRouter)
  app.use('/search', searchRouter)
  app.use('/employees', employeesRouter)
  app.use('/contractors', contractorsRouter)
  app.use('/dashboard', dashboardRouter)

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
      err instanceof EmployeeError ||
      err instanceof ContractorError ||
      err instanceof ToolboxError ||
      err instanceof EquipmentError ||
      err instanceof VisitorError ||
      err instanceof ReportError ||
      err instanceof InvestigationError ||
      err instanceof DashboardError ||
      err instanceof OrgAdminError ||
      err instanceof ProvisioningError
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

    /*
     * A schema rejection is the caller's problem, not ours.
     *
     * Most handlers use `safeParse` and answer 400 themselves, but around twenty use the
     * throwing `parse`, and nothing here caught what it threw - so a missing query
     * parameter produced "Something went wrong", a 500 in the access log and an
     * "unhandled error" line in the application log. Observed on
     * `GET /dashboard/overview` with no companyId. 500 tells a monitor the service is
     * broken and tells the caller nothing; the truth is that the request was malformed.
     *
     * The field paths are returned because they are the caller's own input. No value is
     * echoed back - a validation message that repeats what was sent will eventually repeat
     * a password.
     */
    if ((err as { name?: string })?.name === 'ZodError') {
      const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues ?? []
      return res.status(400).json({
        error: 'validation',
        message: issues.length
          ? `Invalid request: ${issues.map((i) => i.path.join('.') || '(body)').join(', ')}`
          : 'Invalid request.',
      })
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
