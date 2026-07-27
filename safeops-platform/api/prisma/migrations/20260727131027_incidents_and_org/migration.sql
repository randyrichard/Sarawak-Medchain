-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('near_miss', 'first_aid', 'mtc', 'rwc', 'lti', 'fatality', 'property_damage', 'environmental', 'vehicle', 'fire', 'unsafe_act', 'unsafe_condition');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('Minor', 'Moderate', 'Serious', 'Critical');

-- CreateEnum
CREATE TYPE "IncidentStage" AS ENUM ('reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'enterprise',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "stage" "IncidentStage" NOT NULL DEFAULT 'reported',
    "department" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL,
    "gps" TEXT,
    "immediateActions" TEXT NOT NULL DEFAULT '',
    "reporter" TEXT NOT NULL,
    "reporterId" TEXT,
    "investigator" TEXT,
    "riskRating" TEXT,
    "potentialSeverity" "IncidentSeverity",
    "highRisk" BOOLEAN NOT NULL DEFAULT false,
    "findings" TEXT,
    "closeNote" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Site_companyId_idx" ON "Site"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_number_key" ON "Incident"("number");

-- CreateIndex
CREATE INDEX "Incident_companyId_stage_idx" ON "Incident"("companyId", "stage");

-- CreateIndex
CREATE INDEX "Incident_companyId_siteId_idx" ON "Incident"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "Incident_companyId_type_idx" ON "Incident"("companyId", "type");

-- CreateIndex
CREATE INDEX "Incident_reportedAt_idx" ON "Incident"("reportedAt");

-- CreateIndex
CREATE INDEX "IncidentEvent_incidentId_at_idx" ON "IncidentEvent"("incidentId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_companyId_id_key" ON "Counter"("companyId", "id");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
