-- CreateTable
CREATE TABLE "PerformanceTarget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceTarget_companyId_metric_key" ON "PerformanceTarget"("companyId", "metric");


-- Integrity in the database, not only in the service: an unknown metric or an impossible
-- value cannot be written by any path (a script, a manual fix, a future endpoint).
-- Adding a metric to TARGET_METRICS means extending this list in a migration.
ALTER TABLE "PerformanceTarget" ADD CONSTRAINT "PerformanceTarget_metric_check" CHECK ("metric" IN (
  'frequencyRate', 'severityRate', 'incidenceRate', 'trir', 'fatalities', 'overdueActions', 'nearMissRatio', 'onTimeClosure'
));
ALTER TABLE "PerformanceTarget" ADD CONSTRAINT "PerformanceTarget_value_check" CHECK (
  "value" >= 0 AND "value" <= 1000000 AND ("metric" <> 'onTimeClosure' OR "value" <= 1)
);

-- Tenant isolation, as on every other tenant table (see 20261002090000_row_level_security).
ALTER TABLE "PerformanceTarget" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PerformanceTarget"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
