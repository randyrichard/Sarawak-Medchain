-- The Authentication Policy page is now enforced (lib/authPolicy.ts).

-- Password expiry counts from here. Existing accounts start at the time of this migration,
-- so an upgrade does not expire everybody's password at once.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The absolute end of a session (sign-in + the policy's session timeout), carried across
-- refreshes. Null for sessions that already exist: the page says the timeout applies from
-- the next sign-in.
ALTER TABLE "RefreshToken" ADD COLUMN "sessionEndsAt" TIMESTAMP(3);

-- The server never accepted a password shorter than 12 characters, so a stored minimum below
-- that was never what applied. Show what is enforced.
ALTER TABLE "SecurityPolicy" ALTER COLUMN "passwordMinLength" SET DEFAULT 12;
UPDATE "SecurityPolicy" SET "passwordMinLength" = 12 WHERE "passwordMinLength" < 12;
