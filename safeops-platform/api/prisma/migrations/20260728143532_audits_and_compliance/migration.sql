-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('internal', 'external', 'dosh', 'iso45001', 'customer', 'contractor', 'supplier', 'environmental', 'quality', 'custom');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('planned', 'in_progress', 'completed', 'closed');

-- CreateEnum
CREATE TYPE "AuditPriority" AS ENUM ('High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('Critical', 'Major', 'Minor', 'Observation');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('policy', 'sop', 'certificate', 'inspection_report', 'permit', 'training_record', 'audit_report');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('Draft', 'PendingApproval', 'Approved', 'Superseded');

-- CreateTable
CREATE TABLE "AuditTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AuditType" NOT NULL DEFAULT 'custom',
    "sections" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AuditType" NOT NULL,
    "customType" TEXT,
    "department" TEXT NOT NULL DEFAULT '',
    "leadAuditor" TEXT NOT NULL,
    "team" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "templateId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "priority" "AuditPriority" NOT NULL DEFAULT 'Medium',
    "status" "AuditStatus" NOT NULL DEFAULT 'planned',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "score" INTEGER,
    "answers" JSONB,
    "signature" TEXT,
    "gps" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "evidenceNote" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "linkedAssetId" TEXT,
    "linkedIncidentId" TEXT,
    "actionId" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceObligation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "regulation" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "nextDue" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "evidenceDoc" TEXT,
    "notes" TEXT,
    "lastRenewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" "DocStatus" NOT NULL DEFAULT 'PendingApproval',
    "owner" TEXT NOT NULL,
    "sizeKb" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "by" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditTemplate_companyId_idx" ON "AuditTemplate"("companyId");

-- CreateIndex
CREATE INDEX "Audit_companyId_status_idx" ON "Audit"("companyId", "status");

-- CreateIndex
CREATE INDEX "Audit_companyId_siteId_idx" ON "Audit"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "Audit_companyId_type_idx" ON "Audit"("companyId", "type");

-- CreateIndex
CREATE INDEX "Audit_scheduledFor_idx" ON "Audit"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_companyId_code_key" ON "Audit"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_actionId_key" ON "AuditFinding"("actionId");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding"("auditId");

-- CreateIndex
CREATE INDEX "AuditEvent_auditId_at_idx" ON "AuditEvent"("auditId", "at");

-- CreateIndex
CREATE INDEX "ComplianceObligation_companyId_nextDue_idx" ON "ComplianceObligation"("companyId", "nextDue");

-- CreateIndex
CREATE INDEX "ComplianceDocument_companyId_status_idx" ON "ComplianceDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "ComplianceDocument_companyId_kind_idx" ON "ComplianceDocument"("companyId", "kind");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_at_idx" ON "DocumentVersion"("documentId", "at");

-- AddForeignKey
ALTER TABLE "AuditTemplate" ADD CONSTRAINT "AuditTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceObligation" ADD CONSTRAINT "ComplianceObligation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceObligation" ADD CONSTRAINT "ComplianceObligation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
