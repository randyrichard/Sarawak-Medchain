-- CorrectiveAction: give companyId and siteId real foreign keys.
--
-- They were bare string columns. Incident-linked actions cascaded indirectly through
-- Incident, but a standalone action (incidentId NULL) had no cascade path at all, so
-- deleting a tenant left its corrective actions orphaned in the database. Nothing
-- prevented an action referencing a company or site that did not exist either.
--
-- Orphans are removed first, otherwise the constraints cannot be validated.

DELETE FROM "CorrectiveAction"
WHERE "companyId" NOT IN (SELECT "id" FROM "Company")
   OR "siteId" NOT IN (SELECT "id" FROM "Site");

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
