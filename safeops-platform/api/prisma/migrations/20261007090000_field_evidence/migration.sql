-- Field evidence: photos and documents for inspections, audit answers and corrective
-- actions that have no incident. Until now those were counted in the browser and thrown
-- away (see FieldEvidence in schema.prisma).

-- CreateTable
CREATE TABLE "FieldEvidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "auditId" TEXT,
    "auditItemId" TEXT,
    "actionId" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldEvidence_storedName_key" ON "FieldEvidence"("storedName");

-- CreateIndex
CREATE INDEX "FieldEvidence_inspectionId_idx" ON "FieldEvidence"("inspectionId");

-- CreateIndex
CREATE INDEX "FieldEvidence_auditId_auditItemId_idx" ON "FieldEvidence"("auditId", "auditItemId");

-- CreateIndex
CREATE INDEX "FieldEvidence_actionId_idx" ON "FieldEvidence"("actionId");

-- CreateIndex
CREATE INDEX "FieldEvidence_companyId_createdAt_idx" ON "FieldEvidence"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Integrity in the database, not only in the service, so no path (a script, a manual fix,
-- a future endpoint) can write a row the product would misread.

-- Exactly one parent. A photo that belongs to nothing is unfindable; one that belongs to
-- two records is evidence for both and for neither.
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_one_parent_check"
  CHECK (num_nonnulls("inspectionId", "auditId", "actionId") = 1);

-- An audit item only makes sense on an audit.
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_audit_item_check"
  CHECK ("auditItemId" IS NULL OR "auditId" IS NOT NULL);

-- The upload allow-list and size limit (lib/uploadSafety.ts, 10 MB), and a SHA-256 digest.
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_mime_check"
  CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'));
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_size_check"
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);
ALTER TABLE "FieldEvidence" ADD CONSTRAINT "FieldEvidence_checksum_check"
  CHECK ("checksum" ~ '^[0-9a-f]{64}$');

-- Tenant isolation, as on every other tenant table (see 20261002090000_row_level_security).
ALTER TABLE "FieldEvidence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FieldEvidence"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
