-- Hours worked per site per month: the denominator of the injury frequency and severity
-- rates (DOSH JKKP 8). Additive; no existing row changes.
-- CreateTable
CREATE TABLE "SiteManHours" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "hours" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteManHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteManHours_companyId_month_idx" ON "SiteManHours"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SiteManHours_siteId_month_key" ON "SiteManHours"("siteId", "month");

-- AddForeignKey
ALTER TABLE "SiteManHours" ADD CONSTRAINT "SiteManHours_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant isolation, as for every other company-owned table (20261002090000_row_level_security).
ALTER TABLE "SiteManHours" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SiteManHours"
  USING (safeops_tenant_visible("companyId")) WITH CHECK (safeops_tenant_visible("companyId"));
