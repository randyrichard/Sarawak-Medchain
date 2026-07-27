-- Reference numbers are per tenant, not global.
--
-- INC-#### and CA-#### are allocated from a per-company counter, so a global unique
-- constraint made the second tenant collide with the first on its very first record.

DROP INDEX IF EXISTS "Incident_number_key";
CREATE UNIQUE INDEX "Incident_companyId_number_key" ON "Incident"("companyId", "number");

DROP INDEX IF EXISTS "CorrectiveAction_code_key";
CREATE UNIQUE INDEX "CorrectiveAction_companyId_code_key" ON "CorrectiveAction"("companyId", "code");
