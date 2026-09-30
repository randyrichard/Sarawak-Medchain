-- Background job history, shared by every process (see JobRun in schema.prisma).
CREATE TABLE "JobRun" (
    "job" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastOk" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "lastDurationMs" INTEGER,
    "instance" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("job")
);
