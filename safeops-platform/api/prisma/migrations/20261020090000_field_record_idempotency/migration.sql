-- Idempotency for work recorded in the field with no signal.
--
-- A permit is worked where the job is, which on a plant means no coverage. The browser
-- queues what the crew did and sends it when signal returns (web/src/lib/fieldOutbox), and
-- that send is not reliably once: two tabs drain the same queue, a request interrupted
-- mid-flight leaves the device unsure whether it landed, and a retry after a 502 looks
-- exactly like a new reading.
--
-- Incidents handle this with a clientRef column on Incident, which works because an incident
-- is a row that either exists or does not. Permit records are mostly transitions and appends
-- on a permit that already exists, where a duplicate is not harmless: a second gas test is a
-- reading nobody took, and a second entry record puts the same man into a confined space
-- twice in the log whose whole job is to say who is in there.
--
-- So the key is claimed in its own table, in the same transaction as the work it covers. A
-- replay finds the claim and is answered with the permit as it stands.

-- CreateTable
CREATE TABLE "FieldRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "subjectId" TEXT,
    "userId" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldRecord_pkey" PRIMARY KEY ("id")
);

-- The constraint that does the work. Scoped to the company rather than global: the key is
-- generated on a device and two tenants' devices are free to collide.
-- CreateIndex
CREATE UNIQUE INDEX "FieldRecord_companyId_clientRef_key" ON "FieldRecord"("companyId", "clientRef");

-- CreateIndex
CREATE INDEX "FieldRecord_companyId_createdAt_idx" ON "FieldRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FieldRecord_subjectId_idx" ON "FieldRecord"("subjectId");

-- AddForeignKey
ALTER TABLE "FieldRecord" ADD CONSTRAINT "FieldRecord_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A device clock is not evidence. The service validates recordedAt against the permit and
-- against the clock skew it will tolerate; this is the floor under every other path - a
-- script, a manual fix, a future endpoint - so a record cannot claim to have been made in
-- the future or before the product existed.
ALTER TABLE "FieldRecord" ADD CONSTRAINT "FieldRecord_recordedAt_check" CHECK (
  "recordedAt" IS NULL
  OR ("recordedAt" > TIMESTAMPTZ '2026-01-01 00:00:00+00' AND "recordedAt" <= "createdAt" + INTERVAL '10 minutes')
);

-- Tenant isolation, as on every other tenant table (see 20261002090000_row_level_security).
ALTER TABLE "FieldRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FieldRecord"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
