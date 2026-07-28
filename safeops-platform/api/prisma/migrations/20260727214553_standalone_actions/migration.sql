-- Corrective actions may exist without an investigation.
--
-- The Actions register (SAIL) is the union of incident-derived actions and those raised
-- from audit findings, inspection failures or entered manually. A required incidentId
-- left the latter with nowhere to live, so the register could not be served from the
-- database without losing them.

CREATE TYPE "CapaSource" AS ENUM ('incident', 'audit', 'inspection', 'manual', 'training');

ALTER TABLE "CorrectiveAction" ADD COLUMN "source" "CapaSource" NOT NULL DEFAULT 'incident';

ALTER TABLE "CorrectiveAction" DROP CONSTRAINT "CorrectiveAction_incidentId_fkey";
ALTER TABLE "CorrectiveAction" ALTER COLUMN "incidentId" DROP NOT NULL;
ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CorrectiveAction_companyId_source_idx" ON "CorrectiveAction"("companyId", "source");
