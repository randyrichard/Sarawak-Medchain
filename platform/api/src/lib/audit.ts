import type { AuditAction, Role } from '@prisma/client';
import { prisma } from './prisma.js';
import { sha256Hex } from './crypto.js';

export interface AuditEntryInput {
  actorId?: string | null;
  actorRole?: Role | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

const GENESIS_HASH = sha256Hex('emc-audit-genesis');

/**
 * Deterministic JSON with sorted keys. Postgres jsonb does not preserve
 * object key order, so the hash must be computed over a canonical form
 * that survives the round-trip.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Append an entry to the hash-chained audit log. Each entry commits to the
 * previous entry's hash, making the trail tamper-evident: recomputing the
 * chain reveals any retroactive edit or deletion.
 *
 * Audit writes never throw into the request path — a failed audit write is
 * logged loudly but does not roll back the business operation.
 */
export async function audit(entry: AuditEntryInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize appends: without this, two concurrent writers read the
      // same "last" entry and fork the hash chain. The advisory lock is
      // transaction-scoped and released automatically on commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(874201)`;
      const last = await tx.auditLog.findFirst({
        orderBy: { seq: 'desc' },
        select: { entryHash: true },
      });
      const prevHash = last?.entryHash ?? GENESIS_HASH;
      const createdAt = new Date();
      const entryHash = sha256Hex(
        [
          prevHash,
          entry.actorId ?? '',
          entry.action,
          entry.entityType ?? '',
          entry.entityId ?? '',
          stableStringify(entry.meta ?? {}),
          createdAt.toISOString(),
        ].join('|')
      );
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ip: entry.ip,
          userAgent: entry.userAgent,
          meta: (entry.meta ?? {}) as object,
          prevHash,
          entryHash,
          createdAt,
        },
      });
    });
  } catch (err) {
    console.error('[audit] failed to append audit entry', entry.action, err);
  }
}

/** Recompute the chain and report the first broken link, if any. */
export async function verifyAuditChain(): Promise<{ intact: boolean; brokenAtSeq?: string }> {
  const entries = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
  let prevHash = GENESIS_HASH;
  for (const e of entries) {
    if (e.prevHash !== prevHash) {
      return { intact: false, brokenAtSeq: e.seq.toString() };
    }
    const recomputed = sha256Hex(
      [
        e.prevHash,
        e.actorId ?? '',
        e.action,
        e.entityType ?? '',
        e.entityId ?? '',
        stableStringify(e.meta ?? {}),
        e.createdAt.toISOString(),
      ].join('|')
    );
    if (recomputed !== e.entryHash) {
      return { intact: false, brokenAtSeq: e.seq.toString() };
    }
    prevHash = e.entryHash;
  }
  return { intact: true };
}
