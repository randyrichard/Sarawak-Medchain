-- Scheduled reports: standing instructions, and a record of every execution.
--
-- Additive: two new tables and three new enums. Nothing existing is touched.
--
-- ASCII only on purpose: this cluster is WIN1252.

CREATE TYPE "ReportType"      AS ENUM ('overdue_actions', 'open_investigations');
CREATE TYPE "ReportFrequency" AS ENUM ('daily', 'weekly', 'monthly');

CREATE TABLE "ReportSchedule" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "frequency"  "ReportFrequency" NOT NULL DEFAULT 'weekly',
    -- ISO weekday: 1 = Monday. Only meaningful for the weekly frequency.
    "dayOfWeek"  INTEGER NOT NULL DEFAULT 1,
    -- Local wall-clock time, HH:mm. Text because it is a time of day in somebody's week,
    -- not an instant.
    "timeOfDay"  TEXT NOT NULL DEFAULT '08:00',
    -- IANA zone, stored explicitly. A server in UTC and a site in Kuching disagree by
    -- eight hours about when Monday morning is, and guessing sends the weekly report on
    -- Sunday afternoon.
    "timezone"   TEXT NOT NULL DEFAULT 'Asia/Kuching',
    -- User ids, validated against this company's memberships on write and again on send.
    "recipientUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "siteId"     TEXT,
    "lastRunAt"     TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError"  TEXT,
    "nextRunAt"     TIMESTAMP(3),
    "createdBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSchedule_companyId_enabled_idx" ON "ReportSchedule"("companyId", "enabled");
-- The sweep asks "what is due" on every pass.
CREATE INDEX "ReportSchedule_enabled_nextRunAt_idx" ON "ReportSchedule"("enabled", "nextRunAt");

ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReportRun" (
    "id"         TEXT NOT NULL,
    "scheduleId" TEXT,
    "companyId"  TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "trigger"    TEXT NOT NULL DEFAULT 'scheduled',
    "periodStart" TIMESTAMP(3),
    "periodEnd"   TIMESTAMP(3),
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status"      TEXT NOT NULL DEFAULT 'running',
    "rowCount"       INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    -- Whether a provider actually accepted it. False when no mail provider is configured,
    -- which is recorded honestly rather than reported as sent.
    "delivered"      BOOLEAN NOT NULL DEFAULT false,
    "deliveryNote"   TEXT,
    "storedName"   TEXT,
    "originalName" TEXT,
    "sizeBytes"    INTEGER,
    "error"        TEXT,
    "triggeredBy"  TEXT NOT NULL,
    -- One run per schedule per due slot. The sweep runs every fifteen minutes and can be
    -- started more than once; without this a Monday report goes out four times before
    -- nine o'clock. Null for manual runs, which are deliberate and may be repeated.
    "dueSlot"      TEXT,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- The idempotency guard. Postgres treats NULLs as distinct, so manual runs are unaffected.
CREATE UNIQUE INDEX "ReportRun_scheduleId_dueSlot_key" ON "ReportRun"("scheduleId", "dueSlot");
CREATE INDEX "ReportRun_companyId_startedAt_idx" ON "ReportRun"("companyId", "startedAt");
CREATE INDEX "ReportRun_scheduleId_startedAt_idx" ON "ReportRun"("scheduleId", "startedAt");

ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "ReportSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
