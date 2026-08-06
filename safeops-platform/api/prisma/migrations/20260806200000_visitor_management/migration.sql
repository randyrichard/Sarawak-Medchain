-- Visitor management: the register, its history, files and the blacklist.
--
-- Additive only. Four new tables and two new enums; nothing existing is dropped or
-- rewritten. Every foreign key onto an existing table is either Cascade from its own
-- parent or SetNull, so no existing row changes meaning.
--
-- ASCII only on purpose: this cluster is WIN1252.

CREATE TYPE "VisitorStatus" AS ENUM (
    'draft', 'pre_registered', 'waiting', 'checked_in', 'on_site',
    'checked_out', 'expired', 'denied', 'blacklisted', 'cancelled'
);

CREATE TYPE "VisitorEventKind" AS ENUM (
    'created', 'approved', 'rejected', 'checked_in', 'checked_out',
    'badge_issued', 'badge_returned', 'vehicle_added', 'vehicle_removed',
    'blacklisted', 'note_added', 'acknowledgement', 'status_change'
);

CREATE TABLE "Visitor" (
    "id"                TEXT NOT NULL,
    "code"              TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "siteId"            TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    -- One column for IC and passport: which one it is varies by nationality, and the
    -- blacklist has to match on either.
    "idNumber"          TEXT NOT NULL,
    "nationality"       TEXT NOT NULL DEFAULT '',
    "visitorCompany"    TEXT NOT NULL DEFAULT '',
    "phone"             TEXT NOT NULL DEFAULT '',
    "email"             TEXT NOT NULL DEFAULT '',
    "vehicleNumber"     TEXT NOT NULL DEFAULT '',
    "hostEmployeeId"    TEXT,
    -- Kept as text as well as a foreign key: a host who leaves must not erase who signed
    -- the visitor in.
    "hostNameAtBooking" TEXT NOT NULL DEFAULT '',
    "departmentId"      TEXT,
    "purpose"           TEXT NOT NULL DEFAULT '',
    "expectedArrival"   TIMESTAMP(3) NOT NULL,
    "expectedDeparture" TIMESTAMP(3) NOT NULL,
    "checkedInAt"       TIMESTAMP(3),
    "checkedOutAt"      TIMESTAMP(3),
    "status"            "VisitorStatus" NOT NULL DEFAULT 'draft',
    "badgeNumber"       TEXT,
    "badgeIssuedAt"     TIMESTAMP(3),
    "badgeReturnedAt"   TIMESTAMP(3),
    "passKey"           TEXT NOT NULL,
    "notes"             TEXT,
    "emergencyContactName"  TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    -- Timestamps rather than booleans: "when did they acknowledge the emergency
    -- procedure" is the question asked after an evacuation.
    "inductionAt"          TIMESTAMP(3),
    "ndaAt"                TIMESTAMP(3),
    "safetyBriefingAt"     TIMESTAMP(3),
    "emergencyProcedureAt" TIMESTAMP(3),
    "siteRulesAt"          TIMESTAMP(3),
    "approvedBy"        TEXT,
    "approvedAt"        TIMESTAMP(3),
    "rejectedBy"        TEXT,
    "rejectedAt"        TIMESTAMP(3),
    "decisionNote"      TEXT,
    "deniedReason"      TEXT,
    "createdBy"         TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "version"           INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Visitor_passKey_key" ON "Visitor"("passKey");
CREATE UNIQUE INDEX "Visitor_companyId_code_key" ON "Visitor"("companyId", "code");
CREATE INDEX "Visitor_companyId_status_idx" ON "Visitor"("companyId", "status");
CREATE INDEX "Visitor_companyId_siteId_status_idx" ON "Visitor"("companyId", "siteId", "status");
CREATE INDEX "Visitor_companyId_expectedArrival_idx" ON "Visitor"("companyId", "expectedArrival");
CREATE INDEX "Visitor_hostEmployeeId_idx" ON "Visitor"("hostEmployeeId");
CREATE INDEX "Visitor_idNumber_idx" ON "Visitor"("idNumber");

ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SetNull: a host leaving the company must not delete the record of who they signed in.
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_hostEmployeeId_fkey"
  FOREIGN KEY ("hostEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VisitorEvent" (
    "id"        TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "kind"      "VisitorEventKind" NOT NULL,
    "summary"   TEXT NOT NULL,
    "detail"    TEXT,
    "actor"     TEXT NOT NULL,
    "actorRole" TEXT NOT NULL DEFAULT '',
    "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitorEvent_visitorId_at_idx" ON "VisitorEvent"("visitorId", "at");

ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VisitorDocument" (
    "id"           TEXT NOT NULL,
    "visitorId"    TEXT NOT NULL,
    "kind"         TEXT NOT NULL DEFAULT 'photo',
    "originalName" TEXT NOT NULL,
    "storedName"   TEXT NOT NULL,
    "mimeType"     TEXT NOT NULL,
    "sizeBytes"    INTEGER NOT NULL,
    "uploadedBy"   TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitorDocument_visitorId_idx" ON "VisitorDocument"("visitorId");
CREATE INDEX "VisitorDocument_visitorId_kind_idx" ON "VisitorDocument"("visitorId", "kind");

ALTER TABLE "VisitorDocument" ADD CONSTRAINT "VisitorDocument_visitorId_fkey"
  FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One nullable column per match type rather than a type/value pair, so a row cannot claim
-- to be a phone match while holding an IC number.
CREATE TABLE "VisitorBlacklist" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "idNumber"       TEXT,
    "phone"          TEXT,
    "visitorCompany" TEXT,
    "vehicleNumber"  TEXT,
    "reason"         TEXT NOT NULL,
    -- Null means permanent. A date lets it lapse on its own, which is what stops a
    -- blacklist becoming a list nobody dares prune.
    "expiresAt"      TIMESTAMP(3),
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "addedBy"        TEXT NOT NULL,
    "addedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedBy"       TEXT,
    "liftedAt"       TIMESTAMP(3),

    CONSTRAINT "VisitorBlacklist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitorBlacklist_companyId_active_idx" ON "VisitorBlacklist"("companyId", "active");
CREATE INDEX "VisitorBlacklist_idNumber_idx" ON "VisitorBlacklist"("idNumber");
CREATE INDEX "VisitorBlacklist_phone_idx" ON "VisitorBlacklist"("phone");
CREATE INDEX "VisitorBlacklist_vehicleNumber_idx" ON "VisitorBlacklist"("vehicleNumber");

ALTER TABLE "VisitorBlacklist" ADD CONSTRAINT "VisitorBlacklist_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
