-- Invitation email delivery.
--
-- Additive. Existing invitations become "created", which is truthful: they were issued
-- before the system could send anything, and their links were passed on by hand.
--
-- The vocabulary is ReportRun's, deliberately. One set of words for "did the email go"
-- across the product beats two that mean almost the same thing.
--
-- ASCII only on purpose: this cluster is WIN1252.

ALTER TABLE "Invitation" ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'created';
ALTER TABLE "Invitation" ADD COLUMN "messageId"      TEXT;
ALTER TABLE "Invitation" ADD COLUMN "sentAt"         TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN "failureReason"  TEXT;
ALTER TABLE "Invitation" ADD COLUMN "provider"       TEXT;
ALTER TABLE "Invitation" ADD COLUMN "attempts"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invitation" ADD COLUMN "lastAttemptAt"  TIMESTAMP(3);
