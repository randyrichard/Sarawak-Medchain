-- Projects, and the site hierarchy underneath them.
--
-- A contractor organises safety by the job, not by the yard: an HSE manager reports on
-- "Construction Project A" and expects its sites underneath it. Sites existed first, so
-- every link added here is nullable and every existing row stays valid without being
-- touched. A workspace that never creates a project is unaffected.
--
-- Nothing is denormalised onto the thirteen tables that already carry siteId. A record's
-- project is its site's project, resolved by join. A copied projectId would be a second
-- answer to the same question, and the two would disagree the first time a site moved.

CREATE TYPE "ProjectStatus" AS ENUM ('planned', 'active', 'completed', 'suspended', 'cancelled');

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "client" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "managerUserId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Per tenant, never global: two customers may both call a project "PRJ-01".
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");
CREATE INDEX "Project_companyId_status_idx" ON "Project"("companyId", "status");

-- Cascade from the company, because a deleted tenant takes its projects with it.
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull from the manager: a person leaving must not delete the project they ran.
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerUserId_fkey"
    FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Site gains the project link, its own dates, and accountable people.
ALTER TABLE "Site" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Site" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "endDate" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "siteManagerUserId" TEXT;
ALTER TABLE "Site" ADD COLUMN "hseLeadUserId" TEXT;

CREATE INDEX "Site_projectId_idx" ON "Site"("projectId");

-- SetNull, deliberately, and the most important line in this file: deleting a project
-- must orphan its sites rather than cascade into them. A site carries incidents, permits,
-- assets and employees, and a cascade here would delete a safety history through a
-- convenience link that was added years after those records were written.
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Site" ADD CONSTRAINT "Site_siteManagerUserId_fkey"
    FOREIGN KEY ("siteManagerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_hseLeadUserId_fkey"
    FOREIGN KEY ("hseLeadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A schedule can be scoped to a project, the same way it can already be scoped to a site.
ALTER TABLE "ReportSchedule" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
