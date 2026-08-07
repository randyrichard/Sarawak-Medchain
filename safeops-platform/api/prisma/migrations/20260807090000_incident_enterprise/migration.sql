-- Enterprise incident management: classification, report context, people and links.
--
-- Additive only. Enum values are appended, never reordered or removed, so every existing
-- incident keeps the classification it was reported under - a first-aid case from last
-- year is still a first-aid case, and rewriting history to fit a new scale would be a lie.
-- All new columns are nullable or defaulted. Two new tables, two new enums.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- Incident types the customer named
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'injury';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'chemical_spill';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'occupational_illness';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'equipment_failure';

-- Outcome-based severity. Minor already exists and is kept; Moderate, Serious and Critical
-- remain valid for the rows that carry them.
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'near_miss';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'medical_treatment';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'restricted_work';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'lost_time_injury';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'fatality';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'environmental_major';
ALTER TYPE "IncidentSeverity" ADD VALUE IF NOT EXISTS 'catastrophic';

-- A report started and not yet submitted.
ALTER TYPE "IncidentStage" ADD VALUE IF NOT EXISTS 'draft';

-- Report context
ALTER TABLE "Incident" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Incident" ADD COLUMN "weather" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Incident" ADD COLUMN "shift"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "Incident" ADD COLUMN "emergencyResponseActivated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Incident" ADD COLUMN "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- Investigation
ALTER TABLE "Incident" ADD COLUMN "leadInvestigator"         TEXT;
ALTER TABLE "Incident" ADD COLUMN "investigationTeam"        TEXT NOT NULL DEFAULT '';
ALTER TABLE "Incident" ADD COLUMN "investigationStartedAt"   TIMESTAMP(3);
ALTER TABLE "Incident" ADD COLUMN "investigationCompletedAt" TIMESTAMP(3);
ALTER TABLE "Incident" ADD COLUMN "directCause"        TEXT;
ALTER TABLE "Incident" ADD COLUMN "underlyingCause"    TEXT;
ALTER TABLE "Incident" ADD COLUMN "rootCause"          TEXT;
ALTER TABLE "Incident" ADD COLUMN "contributingFactors" TEXT;
ALTER TABLE "Incident" ADD COLUMN "recommendations"    TEXT;
ALTER TABLE "Incident" ADD COLUMN "rcaFishbone"        JSONB;

-- SetNull: a department being removed must not delete the incidents reported against it.
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Closing an action on a promise is how corrective actions stop meaning anything.
ALTER TABLE "CorrectiveAction" ADD COLUMN "evidenceRequired" BOOLEAN NOT NULL DEFAULT false;

-- People involved
CREATE TYPE "IncidentPersonRole" AS ENUM ('witness', 'injured', 'involved', 'first_aider');

CREATE TABLE "IncidentPerson" (
    "id"                 TEXT NOT NULL,
    "incidentId"         TEXT NOT NULL,
    "role"               "IncidentPersonRole" NOT NULL,
    "employeeId"         TEXT,
    "contractorWorkerId" TEXT,
    "visitorId"          TEXT,
    -- Always written, even when a register row is linked: the record of who was named
    -- outlives them leaving, and an injured contractor may be in no register at all.
    "name"               TEXT NOT NULL,
    "company"            TEXT NOT NULL DEFAULT '',
    "injuryType"         TEXT,
    "bodyPart"           TEXT,
    "treatment"          TEXT,
    "daysLost"           INTEGER,
    "statement"          TEXT,
    "addedBy"            TEXT NOT NULL,
    "addedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentPerson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncidentPerson_incidentId_idx" ON "IncidentPerson"("incidentId");
CREATE INDEX "IncidentPerson_incidentId_role_idx" ON "IncidentPerson"("incidentId", "role");
CREATE INDEX "IncidentPerson_employeeId_idx" ON "IncidentPerson"("employeeId");

ALTER TABLE "IncidentPerson" ADD CONSTRAINT "IncidentPerson_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentPerson" ADD CONSTRAINT "IncidentPerson_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentPerson" ADD CONSTRAINT "IncidentPerson_contractorWorkerId_fkey"
  FOREIGN KEY ("contractorWorkerId") REFERENCES "ContractorWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentPerson" ADD CONSTRAINT "IncidentPerson_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Related records
CREATE TYPE "IncidentLinkKind" AS ENUM (
    'permit', 'employee', 'contractor', 'contractor_worker', 'visitor', 'asset'
);

CREATE TABLE "IncidentLink" (
    "id"          TEXT NOT NULL,
    "incidentId"  TEXT NOT NULL,
    "kind"        "IncidentLinkKind" NOT NULL,
    -- Not a foreign key: it points at one of several tables, and a link that outlives a
    -- deleted permit is better than a cascade that erases the fact one was involved.
    "targetId"    TEXT NOT NULL,
    -- Denormalised so the link renders without four joins, and still reads correctly after
    -- the target is renamed or removed.
    "targetCode"  TEXT NOT NULL DEFAULT '',
    "targetLabel" TEXT NOT NULL DEFAULT '',
    "note"        TEXT,
    "addedBy"     TEXT NOT NULL,
    "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncidentLink_incidentId_kind_targetId_key"
  ON "IncidentLink"("incidentId", "kind", "targetId");
CREATE INDEX "IncidentLink_incidentId_idx" ON "IncidentLink"("incidentId");
-- The reverse question: what has gone wrong around this permit, this contractor.
CREATE INDEX "IncidentLink_kind_targetId_idx" ON "IncidentLink"("kind", "targetId");

ALTER TABLE "IncidentLink" ADD CONSTRAINT "IncidentLink_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
