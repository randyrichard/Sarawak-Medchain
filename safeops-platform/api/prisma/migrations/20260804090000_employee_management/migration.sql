-- Employee management: identity, contact, medical fitness, next of kin and PPE.
--
-- Additive only. Nothing is dropped and no existing column changes type. The one
-- constraint that could fail on live data -- the unique employee number -- is added
-- only after every existing row has been given one, in the same transaction.
--
-- ASCII only on purpose: this cluster is WIN1252, which cannot represent the box
-- drawing characters used elsewhere in the codebase's comments.

-- Employee: new columns
ALTER TABLE "Employee" ADD COLUMN "employeeNo"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "phone"         TEXT;
ALTER TABLE "Employee" ADD COLUMN "hireDate"      TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "medicalExpiry" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "bloodGroup"    TEXT;
ALTER TABLE "Employee" ADD COLUMN "medicalNotes"  TEXT;

-- Backfill employee numbers, per company in creation order, so the sequence a customer
-- sees matches the order people were added rather than a random id ordering.
WITH numbered AS (
  SELECT
    id,
    'EMP-' || (1000 + ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", id))::text AS assigned
  FROM "Employee"
)
UPDATE "Employee" e
SET "employeeNo" = n.assigned
FROM numbered n
WHERE e.id = n.id;

-- Point the per-tenant counter past what was just handed out, so the next employee
-- created continues the sequence instead of colliding with a backfilled number.
INSERT INTO "Counter" ("companyId", "kind", "next")
SELECT "companyId", 'employee', 1000 + COUNT(*)
FROM "Employee"
GROUP BY "companyId"
ON CONFLICT ("companyId", "kind") DO NOTHING;

CREATE UNIQUE INDEX "Employee_companyId_employeeNo_key" ON "Employee"("companyId", "employeeNo");
CREATE INDEX "Employee_companyId_medicalExpiry_idx" ON "Employee"("companyId", "medicalExpiry");

-- Emergency contacts
CREATE TABLE "EmergencyContact" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT '',
    "phone"        TEXT NOT NULL,
    "altPhone"     TEXT,
    "isPrimary"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmergencyContact_employeeId_idx" ON "EmergencyContact"("employeeId");

ALTER TABLE "EmergencyContact"
  ADD CONSTRAINT "EmergencyContact_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PPE issues
CREATE TABLE "PpeIssue" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "item"         TEXT NOT NULL,
    "size"         TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT,
    "issuedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy"     TEXT NOT NULL,
    "replaceDue"   TIMESTAMP(3),
    "returnedAt"   TIMESTAMP(3),
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PpeIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PpeIssue_employeeId_idx" ON "PpeIssue"("employeeId");
CREATE INDEX "PpeIssue_companyId_replaceDue_idx" ON "PpeIssue"("companyId", "replaceDue");

ALTER TABLE "PpeIssue"
  ADD CONSTRAINT "PpeIssue_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PpeIssue"
  ADD CONSTRAINT "PpeIssue_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
