-- Permit to Work: the review chain gates, structured JSA, PPE acknowledgement and
-- permit attachments.
--
-- Additive only: new columns all carry defaults or are nullable, and three new objects
-- are created. No existing table is altered destructively and nothing is dropped.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- Toolbox acknowledgement, per person named on the permit
ALTER TABLE "PermitAttendee" ADD COLUMN "toolboxAckAt" TIMESTAMP(3);

-- PPE acknowledged at activation
ALTER TABLE "Permit" ADD COLUMN "ppeAcknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Permit" ADD COLUMN "ppeAcknowledgedBy" TEXT;

-- Structured job safety analysis
CREATE TABLE "PermitJsaStep" (
    "id"           TEXT NOT NULL,
    "permitId"     TEXT NOT NULL,
    "sequence"     INTEGER NOT NULL DEFAULT 0,
    "step"         TEXT NOT NULL DEFAULT '',
    "hazard"       TEXT NOT NULL,
    "risk"         TEXT NOT NULL DEFAULT '',
    "control"      TEXT NOT NULL,
    "responsible"  TEXT NOT NULL DEFAULT '',
    "residualRisk" TEXT NOT NULL DEFAULT '',
    "createdBy"    TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermitJsaStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PermitJsaStep_permitId_idx" ON "PermitJsaStep"("permitId");

ALTER TABLE "PermitJsaStep"
  ADD CONSTRAINT "PermitJsaStep_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permit attachments, same storage contract as incident evidence
CREATE TYPE "PermitAttachmentKind" AS ENUM (
  'method_statement', 'jsa', 'gas_test_sheet', 'isolation_certificate', 'photo', 'other'
);

CREATE TABLE "PermitAttachment" (
    "id"           TEXT NOT NULL,
    "permitId"     TEXT NOT NULL,
    "kind"         "PermitAttachmentKind" NOT NULL DEFAULT 'other',
    "originalName" TEXT NOT NULL,
    "storedName"   TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "sizeBytes"    INTEGER NOT NULL,
    "uploadedBy"   TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermitAttachment_storedName_key" ON "PermitAttachment"("storedName");
CREATE INDEX "PermitAttachment_permitId_idx" ON "PermitAttachment"("permitId");

ALTER TABLE "PermitAttachment"
  ADD CONSTRAINT "PermitAttachment_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
