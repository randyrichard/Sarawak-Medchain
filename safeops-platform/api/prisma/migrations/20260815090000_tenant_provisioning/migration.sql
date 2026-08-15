-- Tenant provisioning and the commercial fields it needs.
--
-- Entirely additive, and every default preserves what is already true: existing companies
-- become active/trial, and every existing user is not a platform administrator.
--
-- Company.plan already existed and is reused rather than duplicated by a "tier" column.
-- Prices are not stored here at all - they live in planCatalog.ts, so changing what
-- Standard costs is one edit rather than an UPDATE across every customer row.
--
-- ASCII only on purpose: this cluster is WIN1252.

ALTER TABLE "Company" ADD COLUMN "status"             TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Company" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "Company" ADD COLUMN "billingReference"   TEXT;
ALTER TABLE "Company" ADD COLUMN "provisionedAt"      TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "provisionedBy"      TEXT;

-- Companies that already existed were sold and set up by hand, so they are live customers
-- rather than trials. Saying otherwise would put every current customer in the wrong
-- commercial state the moment anything reads this column.
UPDATE "Company" SET "subscriptionStatus" = 'active';

-- SafeOps staff. A column rather than a Role value, because Role describes somebody's
-- place inside one company and a platform administrator has no place inside any of them.
-- It is also what stops a customer administrator granting it: the organisation console
-- writes Membership.role and never touches this.
ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- The provisioning console lists customers newest first.
CREATE INDEX "Company_provisionedAt_idx" ON "Company"("provisionedAt");
