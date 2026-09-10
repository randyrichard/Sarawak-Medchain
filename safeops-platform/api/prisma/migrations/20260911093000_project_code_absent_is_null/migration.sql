-- A project code that was never set is absent, not empty.
--
-- The previous migration made (companyId, code) unique with code NOT NULL DEFAULT ''.
-- Postgres treats '' as a value like any other, so the second project created without a
-- code collided with the first - and the service's own check deliberately skips blank
-- codes, so the failure arrived as a raw constraint violation rather than a sentence
-- anybody could act on. An integration test caught it before this shipped.
--
-- NULLs do not collide in a unique index, which is exactly the semantics wanted: any
-- number of projects may have no code, and any code somebody actually types is unique
-- within the tenant.

ALTER TABLE "Project" ALTER COLUMN "code" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "code" DROP NOT NULL;
UPDATE "Project" SET "code" = NULL WHERE "code" = '';
