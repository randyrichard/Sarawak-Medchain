-- Idempotency key for incident reports filed from a queued (offline) submission.
--
-- Nullable: every incident created before this has none, and the column has to be added
-- without rewriting them. Postgres treats NULLs as distinct in a unique index, so any
-- number of rows may leave it empty and only real keys are constrained.
--
-- Unique per company rather than globally, matching how "number" already works: the key
-- comes from a browser, and one tenant must not be able to occupy a key that another
-- tenant's client might generate.
ALTER TABLE "Incident" ADD COLUMN "clientRef" TEXT;

CREATE UNIQUE INDEX "Incident_companyId_clientRef_key" ON "Incident"("companyId", "clientRef");
