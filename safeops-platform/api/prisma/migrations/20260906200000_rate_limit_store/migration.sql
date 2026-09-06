-- Durable rate-limit counters.
--
-- The counters lived in the API process's memory, which meant they were not really limits.
-- Restarting the container reset every bucket to zero — demonstrated by doing exactly that
-- to clear a login throttle — and any second API instance would keep its own counts, so the
-- configured ceiling silently multiplied by the number of processes.
--
-- No foreign keys and no tenant column on purpose: a bucket key is an IP address, this is
-- operational state rather than customer data, and it must not appear in a tenant export.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    -- Timestamptz, not timestamp. This column is written by raw SQL and compared both in
    -- Postgres (NOW()) and in JavaScript, and a column without an offset makes those two
    -- disagree: a JS Date sent through $queryRaw is serialised as local time, stored
    -- naively, and read back as UTC. On a UTC+8 host that is an eight-hour error, and a
    -- rate limiter that thinks a finished window is still open stops limiting.
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- Only the sweep that deletes finished windows reads by expiry.
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
