-- Make API keys and webhooks work.
--
-- Both features shipped as interfaces over nothing. A key was issued, hashed and displayed
-- but no middleware ever looked one up, so `sk_live_...` authenticated no request anywhere.
-- A webhook was created and its "Send test" button reported success without a request ever
-- leaving the process. This migration is the storage half of making both real.
--
-- Safe on data: at the time it was written there were zero rows in both tables in
-- production, which is unsurprising for two features that did nothing.

-- == ApiKey.callsToday -> ApiUsageDay ------------------------------------------
--
-- The column was set to 0 at issuance and never incremented by anything, so the console's
-- "calls today" was always zero, and nothing anywhere reset it at midnight. A day-keyed
-- rollup answers the same question, plus the seven-day series the usage panel wants, and
-- has no reset to forget.
ALTER TABLE "ApiKey" DROP COLUMN "callsToday";

CREATE TABLE "ApiUsageDay" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    -- UTC midnight, matching every other date-only value in this schema.
    "day" TIMESTAMP(3) NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiUsageDay_pkey" PRIMARY KEY ("id")
);

-- The upsert target for every counted request, so it has to be unique.
CREATE UNIQUE INDEX "ApiUsageDay_apiKeyId_day_key" ON "ApiUsageDay"("apiKeyId", "day");
CREATE INDEX "ApiUsageDay_companyId_day_idx" ON "ApiUsageDay"("companyId", "day");

ALTER TABLE "ApiUsageDay" ADD CONSTRAINT "ApiUsageDay_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- == Webhook.secretHash -> secretEnc -------------------------------------------
--
-- The signing secret was stored as a SHA-256 digest, copying ApiKey.tokenHash. That is
-- right for a key, which is only ever *verified* against what a caller presents, and wrong
-- for a webhook secret, which this service must *use* to compute an HMAC over every
-- payload it sends. A digest cannot sign anything, so no signature was computable -- one of
-- the reasons nothing was ever delivered.
--
-- The replacement is sealed with AES-256-GCM (see secretBox.ts), so it can be read back.
--
-- The old digests are dropped rather than migrated because the plaintext behind them is
-- unrecoverable by construction. Any row that somehow exists is left with an empty seal
-- and deactivated: an endpoint that has never received a signed delivery has nothing to
-- verify, so there is no working integration to break, and silently minting a new secret
-- the administrator was never shown would be worse than asking them to create the webhook
-- again.
ALTER TABLE "Webhook" DROP COLUMN "secretHash";
ALTER TABLE "Webhook" ADD COLUMN "secretEnc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Webhook" ALTER COLUMN "secretEnc" DROP DEFAULT;
UPDATE "Webhook" SET "active" = false WHERE "secretEnc" = '';

-- == The delivery queue -------------------------------------------------------
--
-- Events are enqueued by whatever produced them and sent by a sweep. Posting inline would
-- make reporting an incident wait on a customer's HTTP endpoint, and fail when it is down;
-- an incident report must not depend on somebody else's uptime.
--
-- The payload is frozen at enqueue time so a retry sends what the event said, not what the
-- record has become since.
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    -- pending | delivered | failed. `failed` is terminal: attempts are exhausted.
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- The sweep's only question: what is pending and due.
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_companyId_createdAt_idx" ON "WebhookDelivery"("companyId", "createdAt");

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
