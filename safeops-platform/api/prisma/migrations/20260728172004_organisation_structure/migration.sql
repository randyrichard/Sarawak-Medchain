-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "industry" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "logoInitials" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "headcount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "short" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuching';

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lead" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Department_siteId_idx" ON "Department"("siteId");

-- CreateIndex
CREATE INDEX "Team_departmentId_idx" ON "Team"("departmentId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
