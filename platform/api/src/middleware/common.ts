import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ZodSchema } from 'zod';
import { config } from '../config.js';

/** Wrap async handlers so rejections reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

/** Validate req.body against a zod schema; replaces body with parsed value. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '';
}

export const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxGeneral,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

export const verifyLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.maxVerify,
  standardHeaders: true,
  legacyHeaders: false,
});

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
