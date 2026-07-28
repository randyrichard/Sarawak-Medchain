-- Root cause analysis and corrective-action notes.
--
-- RCA is stored as two JSON documents on the incident. Causes and Five Whys are authored
-- and read as a whole and never queried field-by-field, so child tables would add joins
-- without buying anything.

ALTER TABLE "Incident" ADD COLUMN "rcaCauses" JSONB;
ALTER TABLE "Incident" ADD COLUMN "rcaFiveWhys" JSONB;
ALTER TABLE "Incident" ADD COLUMN "rcaApprovedBy" TEXT;
ALTER TABLE "Incident" ADD COLUMN "rcaApprovedAt" TIMESTAMP(3);

CREATE TABLE "CapaNote" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorId" TEXT,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapaNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CapaNote_actionId_createdAt_idx" ON "CapaNote"("actionId", "createdAt");

ALTER TABLE "CapaNote" ADD CONSTRAINT "CapaNote_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
