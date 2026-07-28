-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('fire_extinguisher', 'forklift', 'ladder', 'scaffolding', 'machinery', 'electrical_panel', 'emergency_lighting', 'first_aid_kit', 'ppe', 'vehicle', 'pressure_vessel', 'custom');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('in_service', 'under_maintenance', 'out_of_service', 'retired');

-- CreateEnum
CREATE TYPE "InspectionFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('passed', 'failed');

-- AlterTable
ALTER TABLE "CorrectiveAction" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "inspectionId" TEXT;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "qrKey" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "customCategory" TEXT,
    "serialNumber" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TIMESTAMP(3),
    "commissionDate" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "department" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "status" "AssetStatus" NOT NULL DEFAULT 'in_service',
    "frequency" "InspectionFrequency" NOT NULL,
    "lastInspectedAt" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDocument" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pdf',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'scheduled',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "outcome" "InspectionOutcome",
    "answers" JSONB,
    "comments" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "gps" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_companyId_status_idx" ON "Asset"("companyId", "status");

-- CreateIndex
CREATE INDEX "Asset_companyId_siteId_idx" ON "Asset"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "Asset_companyId_category_idx" ON "Asset"("companyId", "category");

-- CreateIndex
CREATE INDEX "Asset_nextDueDate_idx" ON "Asset"("nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_companyId_code_key" ON "Asset"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_companyId_qrKey_key" ON "Asset"("companyId", "qrKey");

-- CreateIndex
CREATE INDEX "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- CreateIndex
CREATE INDEX "Inspection_companyId_status_idx" ON "Inspection"("companyId", "status");

-- CreateIndex
CREATE INDEX "Inspection_assetId_scheduledFor_idx" ON "Inspection"("assetId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Inspection_scheduledFor_idx" ON "Inspection"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_companyId_code_key" ON "Inspection"("companyId", "code");

-- CreateIndex
CREATE INDEX "CorrectiveAction_assetId_idx" ON "CorrectiveAction"("assetId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_inspectionId_idx" ON "CorrectiveAction"("inspectionId");

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
