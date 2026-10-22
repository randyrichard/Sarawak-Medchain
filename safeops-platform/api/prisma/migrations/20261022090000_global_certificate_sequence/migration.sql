-- Certificate numbers are one sequence across every workspace (lib/trainingService.ts): a
-- certificate is verified by its number alone, so CERT-2026-2000 has to mean one
-- certificate. The sequence lives in Counter under a reserved company id, '__global__'.
--
-- The tenant policy on Counter matched no session for that row: no caller's companies
-- include '__global__'. Under the restricted login, which is what every production install
-- runs as, the row could be neither read nor written, so numbering a certificate was refused
-- and signing off a training session failed for every customer. The owner, which policies
-- do not bind, never saw it, and nor did the service-level tests that connect as the owner.
--
-- The exception is exactly that row: the reserved id together with the one kind kept under
-- it. '__global__' is not a company, no caller holds it, and nothing else may be stored there.
-- Every tenant's own counters stay behind the same isolation as before.
DROP POLICY tenant_isolation ON "Counter";
CREATE POLICY tenant_isolation ON "Counter"
  USING (safeops_tenant_visible("companyId") OR ("companyId" = '__global__' AND "kind" = 'certificate'))
  WITH CHECK (safeops_tenant_visible("companyId") OR ("companyId" = '__global__' AND "kind" = 'certificate'));
