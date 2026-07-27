-- Counter: replace the single-column primary key with a composite (companyId, kind).
--
-- `id` was the primary key, so a sequence name such as 'incident' had to be globally
-- unique. The first tenant to allocate it locked out every other tenant, and incident
-- creation failed for every company but one. Existing rows carry their sequence name
-- in `id`, so it is copied into `kind` before the old column is dropped.

ALTER TABLE "Counter" ADD COLUMN "kind" TEXT;
UPDATE "Counter" SET "kind" = "id" WHERE "kind" IS NULL;
ALTER TABLE "Counter" ALTER COLUMN "kind" SET NOT NULL;

ALTER TABLE "Counter" DROP CONSTRAINT "Counter_pkey";
DROP INDEX IF EXISTS "Counter_companyId_id_key";
ALTER TABLE "Counter" DROP COLUMN "id";
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_pkey" PRIMARY KEY ("companyId", "kind");
