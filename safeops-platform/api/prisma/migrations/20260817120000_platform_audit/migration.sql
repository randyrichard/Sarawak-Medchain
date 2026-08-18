-- Platform-level audit for privilege changes that belong to no customer.
--
-- A separate table rather than a nullable companyId on "AdminAuditEntry": that column is a
-- required foreign key to "Company", and every tenant-scoped screen filters on it. Making
-- it optional so platform events could share the table would put rows with no tenant into
-- the same place those queries read from.
--
-- Purely additive. Nothing existing is altered or dropped.
--
-- ASCII only on purpose: the development cluster is WIN1252.

CREATE TABLE "PlatformAuditEntry" (
    "id"           TEXT NOT NULL,
    "action"       TEXT NOT NULL,
    "outcome"      TEXT NOT NULL,
    "actor"        TEXT NOT NULL,
    "actorHost"    TEXT NOT NULL DEFAULT '',
    "source"       TEXT NOT NULL DEFAULT 'cli',
    "targetEmail"  TEXT NOT NULL,
    "targetUserId" TEXT,
    "detail"       TEXT,
    "at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEntry_pkey" PRIMARY KEY ("id")
);

-- Read newest-first when investigating, and by subject when asked "who touched this account".
CREATE INDEX "PlatformAuditEntry_at_idx" ON "PlatformAuditEntry"("at");
CREATE INDEX "PlatformAuditEntry_targetEmail_idx" ON "PlatformAuditEntry"("targetEmail");
