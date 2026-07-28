-- CreateEnum
CREATE TYPE "PermitType" AS ENUM ('hot_work', 'confined_space', 'working_at_height', 'electrical_isolation', 'excavation', 'lifting_operation', 'line_breaking', 'radiography');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('draft', 'submitted', 'approved', 'active', 'suspended', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "PermitSignatureRole" AS ENUM ('applicant', 'approver', 'closer');

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" "PermitType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL,
    "applicant" TEXT NOT NULL,
    "contractor" TEXT,
    "workerCount" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'draft',
    "approver" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "suspendedReason" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "handbackConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "linkedIncidentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitControl" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PermitControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsolationPoint" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "isolatedBy" TEXT,
    "isolatedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "IsolationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GasTest" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testedBy" TEXT NOT NULL,
    "oxygenPct" DOUBLE PRECISION NOT NULL,
    "lelPct" DOUBLE PRECISION NOT NULL,
    "h2sPpm" DOUBLE PRECISION NOT NULL,
    "coPpm" DOUBLE PRECISION NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "GasTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitSignature" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "role" "PermitSignatureRole" NOT NULL,
    "name" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statement" TEXT NOT NULL,

    CONSTRAINT "PermitSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitEvent" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Permit_companyId_status_idx" ON "Permit"("companyId", "status");

-- CreateIndex
CREATE INDEX "Permit_companyId_siteId_idx" ON "Permit"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "Permit_companyId_type_idx" ON "Permit"("companyId", "type");

-- CreateIndex
CREATE INDEX "Permit_validTo_idx" ON "Permit"("validTo");

-- CreateIndex
CREATE UNIQUE INDEX "Permit_companyId_code_key" ON "Permit"("companyId", "code");

-- CreateIndex
CREATE INDEX "PermitControl_permitId_position_idx" ON "PermitControl"("permitId", "position");

-- CreateIndex
CREATE INDEX "IsolationPoint_permitId_idx" ON "IsolationPoint"("permitId");

-- CreateIndex
CREATE INDEX "GasTest_permitId_testedAt_idx" ON "GasTest"("permitId", "testedAt");

-- CreateIndex
CREATE INDEX "PermitSignature_permitId_signedAt_idx" ON "PermitSignature"("permitId", "signedAt");

-- CreateIndex
CREATE INDEX "PermitEvent_permitId_at_idx" ON "PermitEvent"("permitId", "at");

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitControl" ADD CONSTRAINT "PermitControl_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsolationPoint" ADD CONSTRAINT "IsolationPoint_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GasTest" ADD CONSTRAINT "GasTest_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitSignature" ADD CONSTRAINT "PermitSignature_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitEvent" ADD CONSTRAINT "PermitEvent_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
