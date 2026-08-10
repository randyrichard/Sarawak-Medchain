-- Bounded retry for report delivery.
--
-- A delivery can fail for two very different reasons: the provider refused the message
-- (an API key is wrong, an address is invalid) or it could not be reached (a network blip,
-- a 503). The first must never be retried - it will fail identically forever and every
-- attempt is noise. The second usually succeeds on the next pass.
--
-- Additive: three columns and one index. Existing rows get no pending retry, which is
-- correct - they were delivered or abandoned under the previous behaviour and must not
-- suddenly start resending.
--
-- ASCII only on purpose: this cluster is WIN1252.

ALTER TABLE "ReportRun" ADD COLUMN "attempts"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReportRun" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
-- Null means no retry is owed: it succeeded, failed permanently, or ran out of attempts.
ALTER TABLE "ReportRun" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

-- The exact email this run produced. A retry re-sends this rather than rebuilding it, so
-- the body can never describe different numbers than the PDF attached to it.
ALTER TABLE "ReportRun" ADD COLUMN "deliveryPayload" JSONB;

-- The recovery sweep asks "what delivery is owed" on every pass.
CREATE INDEX "ReportRun_deliveryStatus_nextAttemptAt_idx"
  ON "ReportRun"("deliveryStatus", "nextAttemptAt");

-- Anything already resolved has one attempt behind it; recording that keeps the column
-- honest rather than showing every historic delivery as never attempted.
UPDATE "ReportRun" SET "attempts" = 1 WHERE "deliveryStatus" IN ('sent', 'failed');
