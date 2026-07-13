import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { sha256Hex } from '../lib/crypto.js';

export interface AuthUser {
  id: string;
  role: Role;
  facilityId: string | null;
  state: string | null;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  facilityId: string | null;
  state: string | null;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.accessTokenTtl,
    issuer: 'emc-platform',
  });
}

/** Bearer-token (or cookie) authentication. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.cookies?.emc_access as string | undefined);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'emc-platform',
      algorithms: ['HS256'], // pin: prevents algorithm-confusion attacks
    }) as AccessTokenPayload & { purpose?: string };
    // Purpose-bound tokens (e.g. pending-2FA) must never act as access tokens
    if (payload.purpose) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = {
      id: payload.sub,
      role: payload.role,
      facilityId: payload.facilityId,
      state: payload.state,
      email: payload.email,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Role-based access control. Usage: requireRole('SUPER_ADMIN', 'STATE_ADMIN') */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Employer API-key authentication for HR-system bulk verification. */
export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // This is an async middleware used directly in the route chain, so its
  // own rejections (e.g. a database error) must be forwarded to next(),
  // not left as an unhandled promise rejection that hangs the request.
  try {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || key.length < 20) {
      res.status(401).json({ error: 'API key required (X-Api-Key header)' });
      return;
    }
    const record = await prisma.apiKey.findUnique({
      where: { keyHash: sha256Hex(key) },
      include: { owner: { select: { id: true, role: true, status: true } } },
    });
    if (!record || record.revokedAt || record.owner.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    await prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    req.user = {
      id: record.owner.id,
      role: record.owner.role,
      facilityId: null,
      state: null,
      email: '',
    };
    next();
  } catch (err) {
    next(err);
  }
}
