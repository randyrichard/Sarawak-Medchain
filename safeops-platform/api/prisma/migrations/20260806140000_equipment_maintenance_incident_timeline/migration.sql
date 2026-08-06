-- Equipment: maintenance work orders, the incident link, and the asset timeline.
--
-- Additive only. Three new tables and four new enums; nothing is dropped and no existing
-- row is rewritten.
--
-- ASCII only on purpose: this cluster is WIN1252.

CREATE TYPE "MaintenanceKind"     AS ENUM ('preventive', 'corrective', 'emergency');
CREATE TYPE "MaintenancePriority" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "MaintenanceStatus"   AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "AssetEventKind"      AS ENUM (
    'created', 'assigned', 'inspection', 'calibration', 'maintenance',
    'incident', 'status_change', 'permit'
);

-- Work orders
CREATE TABLE "WorkOrder" (
    "id"              TEXT NOT NULL,
    "code"            TEXT NOT NULL,
    "assetId"         TEXT NOT NULL,
    "kind"            "MaintenanceKind" NOT NULL,
    "priority"        "MaintenancePriority" NOT NULL DEFAULT 'medium',
    "description"     TEXT NOT NULL,
    "assignedTo"      TEXT NOT NULL DEFAULT '',
    "dueAt"           TIMESTAMP(3),
    "startedAt"       TIMESTAMP(3),
    "finishedAt"      TIMESTAMP(3),
    -- Minutes, not a start/finish subtraction: a job paused overnight does not mean the
    -- plant was down overnight.
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    -- Sen (1/100 ringgit) as an integer. Floating point money eventually produces a total
    -- that does not match the sum of its rows.
    "costSen"         INTEGER NOT NULL DEFAULT 0,
    "partsUsed"       TEXT NOT NULL DEFAULT '',
    "status"          "MaintenanceStatus" NOT NULL DEFAULT 'open',
    "raisedBy"        TEXT NOT NULL,
    "raisedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy"        TEXT,
    "closingNote"     TEXT,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrder_assetId_code_key" ON "WorkOrder"("assetId", "code");
CREATE INDEX "WorkOrder_assetId_status_idx" ON "WorkOrder"("assetId", "status");
CREATE INDEX "WorkOrder_status_dueAt_idx" ON "WorkOrder"("status", "dueAt");

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Equipment named on an incident
CREATE TABLE "IncidentEquipment" (
    "id"          TEXT NOT NULL,
    "incidentId"  TEXT NOT NULL,
    "assetId"     TEXT NOT NULL,
    "involvement" TEXT NOT NULL DEFAULT '',
    "addedBy"     TEXT NOT NULL,
    "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentEquipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncidentEquipment_incidentId_assetId_key" ON "IncidentEquipment"("incidentId", "assetId");
CREATE INDEX "IncidentEquipment_assetId_idx" ON "IncidentEquipment"("assetId");

ALTER TABLE "IncidentEquipment"
  ADD CONSTRAINT "IncidentEquipment_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: equipment named on an incident is part of that investigation's record.
ALTER TABLE "IncidentEquipment"
  ADD CONSTRAINT "IncidentEquipment_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The asset timeline
CREATE TABLE "AssetEvent" (
    "id"        TEXT NOT NULL,
    "assetId"   TEXT NOT NULL,
    "kind"      "AssetEventKind" NOT NULL,
    "summary"   TEXT NOT NULL,
    "detail"    TEXT,
    "actor"     TEXT NOT NULL,
    "actorRole" TEXT NOT NULL DEFAULT '',
    "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refType"   TEXT,
    "refId"     TEXT,

    CONSTRAINT "AssetEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetEvent_assetId_at_idx" ON "AssetEvent"("assetId", "at");

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
