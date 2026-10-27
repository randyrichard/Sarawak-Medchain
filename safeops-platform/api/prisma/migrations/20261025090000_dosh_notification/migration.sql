-- DOSH notification under the NADOPOD Regulations 2004, recorded on the incident.
--
-- A death, a serious bodily injury or a dangerous occurrence is notified to DOSH at once and
-- on JKKP 6 within seven days; an accident that keeps someone off normal work for more than
-- four days on JKKP 6; occupational poisoning or disease on JKKP 7. Every column is nullable
-- and nothing is backfilled: whether an existing incident was notifiable is a person's
-- decision, not something this migration can infer. Incident is already covered by the
-- tenant_isolation policy, so the new columns need no policy of their own.
--
-- dosh_annual is the report the annual JKKP 8 summary is filled in from.

-- CreateEnum
CREATE TYPE "DoshCategory" AS ENUM ('death', 'serious_bodily_injury', 'over_four_days', 'dangerous_occurrence', 'occupational_poisoning', 'occupational_disease', 'not_notifiable');

-- AlterEnum
ALTER TYPE "ReportType" ADD VALUE 'dosh_annual';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "doshCategory" "DoshCategory",
ADD COLUMN     "doshClockFrom" TIMESTAMP(3),
ADD COLUMN     "doshDecidedAt" TIMESTAMP(3),
ADD COLUMN     "doshDecidedBy" TEXT,
ADD COLUMN     "doshDetail" TEXT,
ADD COLUMN     "doshInformedAt" TIMESTAMP(3),
ADD COLUMN     "doshInformedHow" TEXT,
ADD COLUMN     "doshNotRequiredReason" TEXT,
ADD COLUMN     "doshOffice" TEXT,
ADD COLUMN     "doshReference" TEXT,
ADD COLUMN     "doshSubmittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Incident_companyId_doshCategory_idx" ON "Incident"("companyId", "doshCategory");
