import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, generalLimiter } from './middleware/common.js';
import { authRouter } from './routes/auth.js';
import { verifyRouter } from './routes/verify.js';
import { mcRouter } from './routes/mcs.js';
import { adminRouter } from './routes/admin.js';
import { facilityRouter } from './routes/facilities.js';
import { apiKeyRouter, notificationRouter, searchRouter } from './routes/misc.js';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(generalLimiter);

  // Kubernetes probes
  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      // Ops diagnostic: which anchoring mode this instance booted with.
      // 'no-key' = CHAIN_ENABLED is true but the issuer key is missing.
      chainAnchoring: !config.chain.enabled
        ? 'disabled'
        : config.chain.issuerPrivateKey
          ? 'enabled'
          : 'no-key',
    });
  });
  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/verify', verifyRouter);
  app.use('/api/v1/mcs', mcRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/facility', facilityRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/api-keys', apiKeyRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
