-- The HIRARC register (DOSH Guidelines for HIRARC 2008): one row per hazard of a work
-- activity, with its risk before and after the recommended controls, and corrective actions
-- raised from it. Additive; no existing row changes - every existing action keeps a null
-- riskAssessmentId.
-- AlterEnum
ALTER TYPE "CapaSource" ADD VALUE 'risk_assessment';

-- AlterTable
ALTER TABLE "CorrectiveAction" ADD COLUMN     "riskAssessmentId" TEXT;

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "hazard" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "existingControls" TEXT NOT NULL DEFAULT '',
    "likelihood" INTEGER NOT NULL,
    "severity" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "additionalControls" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "controlsDue" TIMESTAMP(3),
    "residualLikelihood" INTEGER,
    "residualSeverity" INTEGER,
    "residualScore" INTEGER,
    "assessedBy" TEXT NOT NULL,
    "assessedOn" TIMESTAMP(3) NOT NULL,
    "reviewDue" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "archivedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskAssessment_companyId_siteId_idx" ON "RiskAssessment"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "RiskAssessment_companyId_riskScore_idx" ON "RiskAssessment"("companyId", "riskScore");

-- CreateIndex
CREATE INDEX "RiskAssessment_companyId_reviewDue_idx" ON "RiskAssessment"("companyId", "reviewDue");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_companyId_code_key" ON "RiskAssessment"("companyId", "code");

-- CreateIndex
CREATE INDEX "CorrectiveAction_riskAssessmentId_idx" ON "CorrectiveAction"("riskAssessmentId");

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The scale and the arithmetic, held by the database as well as the service: a score that
-- is not likelihood times severity, or a rating off the 1-5 scale, would put a row in the
-- wrong band of the matrix and the wrong place in the register, silently.
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_rating_check" CHECK (
  "likelihood" BETWEEN 1 AND 5 AND "severity" BETWEEN 1 AND 5
  AND "riskScore" = "likelihood" * "severity"
);
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_residual_check" CHECK (
  ("residualLikelihood" IS NULL AND "residualSeverity" IS NULL AND "residualScore" IS NULL)
  OR ("residualLikelihood" BETWEEN 1 AND 5 AND "residualSeverity" BETWEEN 1 AND 5
      AND "residualScore" = "residualLikelihood" * "residualSeverity")
);

-- Tenant isolation, as for every other company-owned table (20261002090000_row_level_security).
ALTER TABLE "RiskAssessment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RiskAssessment"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
