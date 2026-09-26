-- CreateTable
CREATE TABLE "ToolboxMeeting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "ledBy" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "hazards" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "recordedBy" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolboxMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxAttendanceGroup" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "ToolboxAttendanceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolboxMeeting_companyId_heldAt_idx" ON "ToolboxMeeting"("companyId", "heldAt");

-- CreateIndex
CREATE INDEX "ToolboxMeeting_siteId_heldAt_idx" ON "ToolboxMeeting"("siteId", "heldAt");

-- CreateIndex
CREATE UNIQUE INDEX "ToolboxMeeting_companyId_number_key" ON "ToolboxMeeting"("companyId", "number");

-- CreateIndex
CREATE INDEX "ToolboxAttendanceGroup_meetingId_idx" ON "ToolboxAttendanceGroup"("meetingId");

-- AddForeignKey
ALTER TABLE "ToolboxMeeting" ADD CONSTRAINT "ToolboxMeeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxMeeting" ADD CONSTRAINT "ToolboxMeeting_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxAttendanceGroup" ADD CONSTRAINT "ToolboxAttendanceGroup_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "ToolboxMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

