import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, clientIp, validateBody, verifyLimiter } from '../middleware/common.js';
import { requireApiKey } from '../middleware/auth.js';
import { verifyByHash } from '../services/verifyService.js';

export const verifyRouter = Router();

/**
 * PUBLIC verification — the endpoint behind every QR code. No login needed:
 * an employer scanning a paper MC must get an answer instantly.
 */
verifyRouter.get(
  '/:hash',
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const hash = req.params.hash;
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(hash)) {
      res.status(400).json({ error: 'Malformed certificate hash' });
      return;
    }
    const outcome = await verifyByHash(hash, {
      verifierType: 'public',
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json(outcome);
  })
);

/**
 * Bulk verification for employer HR systems (API-key authenticated).
 * Accepts up to 100 hashes per request.
 */
verifyRouter.post(
  '/bulk',
  requireApiKey,
  validateBody(z.object({ hashes: z.array(z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/)).min(1).max(100) })),
  asyncHandler(async (req, res) => {
    const results = [];
    for (const hash of req.body.hashes as string[]) {
      const outcome = await verifyByHash(hash, {
        verifierUserId: req.user!.id,
        verifierType: 'api',
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
      results.push({ hash, result: outcome.result, mc: outcome.mc, integrity: outcome.integrity });
    }
    res.json({ count: results.length, results });
  })
);
