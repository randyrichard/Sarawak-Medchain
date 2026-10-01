-- Real multi-factor sign-in: the authenticator secret (sealed), a pending secret during
-- setup, hashed recovery codes and the last accepted time step (replay protection).
--
-- Every existing account keeps mfaEnabled as it was. An account that was marked "MFA on"
-- by the old administrator toggle never had an authenticator behind it, so it is switched
-- off here: leaving it on would make sign-in ask for a code from a device that was never
-- set up, locking that person out.
ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaPendingSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "mfaLastStep" INTEGER;

UPDATE "User" SET "mfaEnabled" = false WHERE "mfaEnabled" = true;
