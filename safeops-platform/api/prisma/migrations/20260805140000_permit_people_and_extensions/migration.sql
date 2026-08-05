-- Permit to Work: real people on permits, the approval chain, and extension history.
--
-- Additive only. Enum values are appended (Postgres enums are append-only, so the
-- existing eight types and seven statuses keep their positions and no existing permit
-- changes meaning), columns are added with defaults, and two new tables are created.
-- Nothing is dropped and no existing row is rewritten.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- New permit types
ALTER TYPE "PermitType" ADD VALUE IF NOT EXISTS 'loto';
ALTER TYPE "PermitType" ADD VALUE IF NOT EXISTS 'cold_work';
ALTER TYPE "PermitType" ADD VALUE IF NOT EXISTS 'pressure_testing';
ALTER TYPE "PermitType" ADD VALUE IF NOT EXISTS 'vehicle_entry';

-- The approval chain, plus archived
ALTER TYPE "PermitStatus" ADD VALUE IF NOT EXISTS 'supervisor_review';
ALTER TYPE "PermitStatus" ADD VALUE IF NOT EXISTS 'hse_review';
ALTER TYPE "PermitStatus" ADD VALUE IF NOT EXISTS 'area_authority';
ALTER TYPE "PermitStatus" ADD VALUE IF NOT EXISTS 'archived';

-- Permit: contractor link, briefing, risk assessment, PPE
ALTER TABLE "Permit" ADD COLUMN "contractorCompanyId" TEXT;
ALTER TABLE "Permit" ADD COLUMN "toolboxAt"    TIMESTAMP(3);
ALTER TABLE "Permit" ADD COLUMN "toolboxBy"    TEXT;
ALTER TABLE "Permit" ADD COLUMN "jsaReference" TEXT;
ALTER TABLE "Permit" ADD COLUMN "jsaConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Permit" ADD COLUMN "requiredPpe"  TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Permit_contractorCompanyId_idx" ON "Permit"("contractorCompanyId");

-- SetNull rather than cascade: removing a contractor record must never delete the
-- permits that prove what work they were authorised to do.
ALTER TABLE "Permit"
  ADD CONSTRAINT "Permit_contractorCompanyId_fkey"
  FOREIGN KEY ("contractorCompanyId") REFERENCES "ContractorCompany"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- People named on a permit
CREATE TYPE "PermitAttendeeRole" AS ENUM ('supervisor', 'receiver', 'worker', 'standby', 'gas_tester');

CREATE TABLE "PermitAttendee" (
    "id"                 TEXT NOT NULL,
    "permitId"           TEXT NOT NULL,
    "employeeId"         TEXT,
    "contractorWorkerId" TEXT,
    "role"               "PermitAttendeeRole" NOT NULL DEFAULT 'worker',
    "nameAtAssignment"   TEXT NOT NULL,
    "addedBy"            TEXT NOT NULL,
    "addedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredAt"          TIMESTAMP(3),
    "exitedAt"           TIMESTAMP(3),

    CONSTRAINT "PermitAttendee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PermitAttendee_permitId_idx" ON "PermitAttendee"("permitId");
CREATE INDEX "PermitAttendee_employeeId_idx" ON "PermitAttendee"("employeeId");
CREATE INDEX "PermitAttendee_contractorWorkerId_idx" ON "PermitAttendee"("contractorWorkerId");

ALTER TABLE "PermitAttendee"
  ADD CONSTRAINT "PermitAttendee_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: someone named on a permit cannot be deleted out from under it. The employee
-- and contractor services already refuse deletion once there is history; this enforces
-- the same rule at the database.
ALTER TABLE "PermitAttendee"
  ADD CONSTRAINT "PermitAttendee_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PermitAttendee"
  ADD CONSTRAINT "PermitAttendee_contractorWorkerId_fkey"
  FOREIGN KEY ("contractorWorkerId") REFERENCES "ContractorWorker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extension history
CREATE TABLE "PermitExtension" (
    "id"              TEXT NOT NULL,
    "permitId"        TEXT NOT NULL,
    "previousValidTo" TIMESTAMP(3) NOT NULL,
    "newValidTo"      TIMESTAMP(3) NOT NULL,
    "reason"          TEXT NOT NULL,
    "requestedBy"     TEXT NOT NULL,
    "requestedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy"      TEXT,
    "approvedAt"      TIMESTAMP(3),
    "rejectedReason"  TEXT,

    CONSTRAINT "PermitExtension_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PermitExtension_permitId_idx" ON "PermitExtension"("permitId");

ALTER TABLE "PermitExtension"
  ADD CONSTRAINT "PermitExtension_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
