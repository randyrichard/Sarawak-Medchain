import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import type { Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { decryptField, encryptField, randomToken, searchDigest, sha256Hex } from '../lib/crypto.js';
import { signAccessToken } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../middleware/common.js';
import { checkLoginAnomaly } from './fraudService.js';
import { config } from '../config.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: Role; fullName: string; email: string; facilityId: string | null };
}

async function issueTokens(user: User, ip?: string, userAgent?: string): Promise<TokenPair> {
  const refreshToken = randomToken(48);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 3600 * 1000),
      ip,
      userAgent,
    },
  });
  return {
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      facilityId: user.facilityId,
      state: user.state,
      email: user.email,
    }),
    refreshToken,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      facilityId: user.facilityId,
    },
  };
}

/** Self-service registration — patients and employers only. All other roles
 *  are provisioned through admin workflows. */
export async function register(input: {
  role: 'PATIENT' | 'EMPLOYER';
  email: string;
  password: string;
  fullName: string;
  ic?: string;
  phone?: string;
}): Promise<TokenPair> {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  if (input.role === 'PATIENT' && !input.ic) {
    throw new HttpError(400, 'IC / passport number is required for patient accounts');
  }
  const icHash = input.ic ? searchDigest(input.ic) : undefined;
  if (icHash) {
    const icTaken = await prisma.user.findUnique({ where: { icHash } });
    if (icTaken) throw new HttpError(409, 'An account already exists for this IC number');
  }

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role,
      fullName: input.fullName,
      phone: input.phone,
      icEncrypted: input.ic ? encryptField(input.ic) : undefined,
      icHash,
    },
  });

  // Back-link MCs issued to this IC before the account existed
  if (icHash) {
    await prisma.medicalCertificate.updateMany({
      where: { patientIcHash: icHash, patientUserId: null },
      data: { patientUserId: user.id },
    });
  }

  await audit({ actorId: user.id, actorRole: user.role, action: 'CREATE_USER', entityType: 'User', entityId: user.id });
  return issueTokens(user);
}

export interface LoginResult {
  requiresTwoFactor: boolean;
  tokens?: TokenPair;
  twoFactorToken?: string; // short-lived, exchanged with the TOTP code
}

const pendingTwoFactor = new Map<string, { userId: string; expiresAt: number }>();

export async function login(
  email: string,
  password: string,
  context: { ip?: string; userAgent?: string; country?: string | null }
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  const fail = async (reason: string) => {
    await audit({
      actorId: user?.id,
      action: 'LOGIN_FAILED',
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { email, reason },
    });
    throw new HttpError(401, 'Invalid email or password');
  };

  if (!user) return fail('unknown email') as never;
  if (user.status !== 'ACTIVE') throw new HttpError(403, `Account is ${user.status.toLowerCase()}`);
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(423, 'Account temporarily locked after repeated failed logins');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failedLoginCount = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil:
          failedLoginCount >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : null,
      },
    });
    return fail('bad password') as never;
  }

  await checkLoginAnomaly({
    userId: user.id,
    ip: context.ip ?? '',
    country: context.country ?? null,
    previousCountry: user.lastLoginCountry,
    previousLoginAt: user.lastLoginAt,
  });

  if (user.totpEnabled) {
    const token = randomToken(24);
    pendingTwoFactor.set(token, { userId: user.id, expiresAt: Date.now() + 5 * 60 * 1000 });
    return { requiresTwoFactor: true, twoFactorToken: token };
  }

  await completeLogin(user.id, context);
  return { requiresTwoFactor: false, tokens: await issueTokens(user, context.ip, context.userAgent) };
}

async function completeLogin(
  userId: string,
  context: { ip?: string; userAgent?: string; country?: string | null }
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: context.ip,
      lastLoginCountry: context.country ?? undefined,
    },
  });
  await audit({ actorId: userId, action: 'LOGIN', ip: context.ip, userAgent: context.userAgent });
}

export async function loginTwoFactor(
  twoFactorToken: string,
  code: string,
  context: { ip?: string; userAgent?: string; country?: string | null }
): Promise<TokenPair> {
  const pending = pendingTwoFactor.get(twoFactorToken);
  if (!pending || pending.expiresAt < Date.now()) {
    throw new HttpError(401, 'Two-factor session expired — log in again');
  }
  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user?.totpSecretEncrypted) throw new HttpError(401, 'Two-factor not configured');

  const valid = authenticator.verify({ token: code, secret: decryptField(user.totpSecretEncrypted) });
  if (!valid) throw new HttpError(401, 'Invalid authentication code');

  pendingTwoFactor.delete(twoFactorToken);
  await completeLogin(user.id, context);
  return issueTokens(user, context.ip, context.userAgent);
}

export async function setupTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = authenticator.generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEncrypted: encryptField(secret), totpEnabled: false },
  });
  return {
    secret,
    otpauthUrl: authenticator.keyuri(user.email, 'MedChain e-MC', secret),
  };
}

export async function enableTwoFactor(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecretEncrypted) throw new HttpError(400, 'Run 2FA setup first');
  const valid = authenticator.verify({ token: code, secret: decryptField(user.totpSecretEncrypted) });
  if (!valid) throw new HttpError(400, 'Invalid authentication code');
  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await audit({ actorId: userId, action: 'TWO_FA_ENABLED', entityType: 'User', entityId: userId });
}

/** Refresh-token rotation: the presented token is revoked and replaced. */
export async function refresh(
  refreshToken: string,
  context: { ip?: string; userAgent?: string }
): Promise<TokenPair> {
  const tokenHash = sha256Hex(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new HttpError(401, 'Invalid refresh token');
  }
  if (stored.user.status !== 'ACTIVE') throw new HttpError(403, 'Account is not active');

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  return issueTokens(stored.user, context.ip, context.userAgent);
}

export async function logout(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(refreshToken), userId },
      data: { revokedAt: new Date() },
    });
  }
  await audit({ actorId: userId, action: 'LOGOUT' });
}
