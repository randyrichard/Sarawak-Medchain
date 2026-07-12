import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, authLimiter, clientIp, validateBody } from '../middleware/common.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/authService.js';

export const authRouter = Router();
authRouter.use(authLimiter);

const registerSchema = z.object({
  role: z.enum(['PATIENT', 'EMPLOYER']),
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  fullName: z.string().min(2).max(120),
  ic: z.string().min(6).max(20).optional(),
  phone: z.string().min(7).max(20).optional(),
});

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.register(req.body);
    res.status(201).json(tokens);
  })
);

authRouter.post(
  '/login',
  validateBody(z.object({ email: z.string().email(), password: z.string() })),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
      country: (req.headers['cf-ipcountry'] as string) ?? null,
    });
    res.json(result);
  })
);

authRouter.post(
  '/login/2fa',
  validateBody(z.object({ twoFactorToken: z.string(), code: z.string().length(6) })),
  asyncHandler(async (req, res) => {
    const tokens = await authService.loginTwoFactor(req.body.twoFactorToken, req.body.code, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
      country: (req.headers['cf-ipcountry'] as string) ?? null,
    });
    res.json(tokens);
  })
);

authRouter.post(
  '/refresh',
  validateBody(z.object({ refreshToken: z.string() })),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json(tokens);
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.id, req.body?.refreshToken);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/2fa/setup',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.setupTwoFactor(req.user!.id));
  })
);

authRouter.post(
  '/2fa/enable',
  requireAuth,
  validateBody(z.object({ code: z.string().length(6) })),
  asyncHandler(async (req, res) => {
    await authService.enableTwoFactor(req.user!.id, req.body.code);
    res.json({ ok: true });
  })
);
