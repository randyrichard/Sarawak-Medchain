-- Equipment: calibration certificates, the permit link, and the register fields the
-- asset table could not express.
--
-- Additive only. Enum values are appended (Postgres enums are append-only, so existing
-- assets keep their category and status), new columns are nullable or defaulted, and two
-- new tables are created. Nothing is dropped and no existing row is rewritten.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- Categories the customer named
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'crane';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'chain_block';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'lifting_sling';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'harness';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'gas_detector';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'scba';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'pressure_gauge';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'electrical_tool';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'generator';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'compressor';

-- Statuses. inspection_due and calibration_due are deliberately NOT stored: they are
-- functions of a date and today, and a stored copy needs a job to stay true. Any window
-- where that job had not run would report an overdue gas detector as fit for use.
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'in_use';
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'disposed';

-- Register fields
ALTER TABLE "Asset" ADD COLUMN "critical"            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN "requiresCalibration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN "notes"               TEXT;
ALTER TABLE "Asset" ADD COLUMN "assignedEmployeeId"  TEXT;
ALTER TABLE "Asset" ADD COLUMN "assignedContractorWorkerId" TEXT;

CREATE INDEX "Asset_companyId_critical_idx" ON "Asset"("companyId", "critical");
CREATE INDEX "Asset_assignedEmployeeId_idx" ON "Asset"("assignedEmployeeId");
CREATE INDEX "Asset_assignedContractorWorkerId_idx" ON "Asset"("assignedContractorWorkerId");

-- SetNull: a person leaving must not delete the equipment they were holding.
ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_assignedEmployeeId_fkey"
  FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_assignedContractorWorkerId_fkey"
  FOREIGN KEY ("assignedContractorWorkerId") REFERENCES "ContractorWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Calibration certificates
CREATE TYPE "CalibrationResult" AS ENUM ('pass', 'pass_with_adjustment', 'fail');

CREATE TABLE "Calibration" (
    "id"                TEXT NOT NULL,
    "assetId"           TEXT NOT NULL,
    "calibratedAt"      TIMESTAMP(3) NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "vendor"            TEXT NOT NULL DEFAULT '',
    "expiresAt"         TIMESTAMP(3) NOT NULL,
    "result"            "CalibrationResult" NOT NULL DEFAULT 'pass',
    "remarks"           TEXT,
    "documentName"      TEXT,
    "storedName"        TEXT,
    "recordedBy"        TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Calibration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Calibration_assetId_calibratedAt_idx" ON "Calibration"("assetId", "calibratedAt");
CREATE INDEX "Calibration_expiresAt_idx" ON "Calibration"("expiresAt");

ALTER TABLE "Calibration"
  ADD CONSTRAINT "Calibration_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Equipment booked onto a permit
CREATE TABLE "PermitEquipment" (
    "id"       TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "assetId"  TEXT NOT NULL,
    "purpose"  TEXT NOT NULL DEFAULT '',
    "addedBy"  TEXT NOT NULL,
    "addedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitEquipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermitEquipment_permitId_assetId_key" ON "PermitEquipment"("permitId", "assetId");
CREATE INDEX "PermitEquipment_permitId_idx" ON "PermitEquipment"("permitId");
CREATE INDEX "PermitEquipment_assetId_idx" ON "PermitEquipment"("assetId");

ALTER TABLE "PermitEquipment"
  ADD CONSTRAINT "PermitEquipment_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: equipment named on a permit is part of that permit's record.
ALTER TABLE "PermitEquipment"
  ADD CONSTRAINT "PermitEquipment_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
