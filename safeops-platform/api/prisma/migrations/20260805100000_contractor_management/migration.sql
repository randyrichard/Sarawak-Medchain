-- Contractor management: contracting firms, their workers, and competency evidence.
--
-- Purely additive: three new tables and one new enum. No existing table is altered and
-- nothing is dropped, so this is safe to apply to a live tenant.
--
-- ASCII only on purpose: this cluster is WIN1252 and cannot represent the box drawing
-- characters used elsewhere in the codebase's comments.

CREATE TYPE "ContractorStatus" AS ENUM ('active', 'suspended');

-- Contracting firms
CREATE TABLE "ContractorCompany" (
    "id"                 TEXT NOT NULL,
    "companyId"          TEXT NOT NULL,
    "code"               TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "contactPerson"      TEXT NOT NULL DEFAULT '',
    "phone"              TEXT NOT NULL DEFAULT '',
    "email"              TEXT,
    "address"            TEXT NOT NULL DEFAULT '',
    "insuranceExpiry"    TIMESTAMP(3),
    "status"             "ContractorStatus" NOT NULL DEFAULT 'active',
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorCompany_companyId_code_key" ON "ContractorCompany"("companyId", "code");
CREATE INDEX "ContractorCompany_companyId_idx" ON "ContractorCompany"("companyId");
CREATE INDEX "ContractorCompany_companyId_insuranceExpiry_idx" ON "ContractorCompany"("companyId", "insuranceExpiry");

ALTER TABLE "ContractorCompany"
  ADD CONSTRAINT "ContractorCompany_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contractor workers
CREATE TABLE "ContractorWorker" (
    "id"                  TEXT NOT NULL,
    "companyId"           TEXT NOT NULL,
    "contractorCompanyId" TEXT NOT NULL,
    "siteId"              TEXT NOT NULL,
    "workerNo"            TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "icPassport"          TEXT NOT NULL DEFAULT '',
    "position"            TEXT NOT NULL DEFAULT '',
    "medicalExpiry"       TIMESTAMP(3),
    "inductionExpiry"     TIMESTAMP(3),
    "emergencyName"       TEXT NOT NULL DEFAULT '',
    "emergencyPhone"      TEXT NOT NULL DEFAULT '',
    "emergencyRelation"   TEXT NOT NULL DEFAULT '',
    "onSite"              BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt"         TIMESTAMP(3),
    "active"              BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorWorker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractorWorker_companyId_workerNo_key" ON "ContractorWorker"("companyId", "workerNo");
CREATE INDEX "ContractorWorker_companyId_idx" ON "ContractorWorker"("companyId");
CREATE INDEX "ContractorWorker_contractorCompanyId_idx" ON "ContractorWorker"("contractorCompanyId");
CREATE INDEX "ContractorWorker_companyId_medicalExpiry_idx" ON "ContractorWorker"("companyId", "medicalExpiry");
CREATE INDEX "ContractorWorker_companyId_inductionExpiry_idx" ON "ContractorWorker"("companyId", "inductionExpiry");
CREATE INDEX "ContractorWorker_companyId_onSite_idx" ON "ContractorWorker"("companyId", "onSite");

ALTER TABLE "ContractorWorker"
  ADD CONSTRAINT "ContractorWorker_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractorWorker"
  ADD CONSTRAINT "ContractorWorker_contractorCompanyId_fkey"
  FOREIGN KEY ("contractorCompanyId") REFERENCES "ContractorCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict rather than cascade: deleting a site must not silently delete the record of
-- who was working on it.
ALTER TABLE "ContractorWorker"
  ADD CONSTRAINT "ContractorWorker_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Competency evidence supplied by the contractor
CREATE TABLE "ContractorCertificate" (
    "id"         TEXT NOT NULL,
    "workerId"   TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "issuedBy"   TEXT NOT NULL DEFAULT '',
    "issueDate"  TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "reference"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorCertificate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractorCertificate_workerId_idx" ON "ContractorCertificate"("workerId");

ALTER TABLE "ContractorCertificate"
  ADD CONSTRAINT "ContractorCertificate_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "ContractorWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
