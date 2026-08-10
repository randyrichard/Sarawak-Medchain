-- Delivery outcome on a report run, separate from whether the report generated.
--
-- A report can generate perfectly and still fail to send. The two need different
-- responses - one is a bug, the other is a relay problem - and collapsing them into the
-- existing `status` column would lose the stored PDF whenever only the email failed.
--
-- Additive: one enum, five nullable-or-defaulted columns. Existing rows become
-- 'generated', which is exactly what they were: a PDF was produced and nothing was
-- emailed, because no provider was configured when they ran.
--
-- ASCII only on purpose: this cluster is WIN1252.

CREATE TYPE "ReportDeliveryStatus" AS ENUM ('generated', 'email_pending', 'sent', 'failed');

ALTER TABLE "ReportRun"
  ADD COLUMN "deliveryStatus" "ReportDeliveryStatus" NOT NULL DEFAULT 'generated';

-- The provider's own id for the message. The only thing that lets "did it actually go?"
-- be answered against the provider's dashboard.
ALTER TABLE "ReportRun" ADD COLUMN "messageId"     TEXT;
ALTER TABLE "ReportRun" ADD COLUMN "sentAt"        TIMESTAMP(3);
-- Why it failed, in words. Never a credential, never a raw provider payload.
ALTER TABLE "ReportRun" ADD COLUMN "failureReason" TEXT;
-- resend | smtp | none
ALTER TABLE "ReportRun" ADD COLUMN "provider"      TEXT;

-- Bring the existing rows in line with the flag they already carry.
UPDATE "ReportRun" SET "deliveryStatus" = 'sent' WHERE "delivered" = true;
