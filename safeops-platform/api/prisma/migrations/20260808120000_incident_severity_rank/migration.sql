-- A sortable severity rank on Incident.
--
-- Postgres orders an enum by declaration order. IncidentSeverity has been appended to over
-- time, so `ORDER BY severity DESC` returned catastrophic, environmental_major, fatality,
-- lost_time_injury, restricted_work, medical_treatment, near_miss, Critical, Serious,
-- Moderate, Minor - putting a near miss above a legacy Critical and burying the serious
-- incidents at the bottom of the register. Sorting by meaning needs a number.
--
-- Additive: one defaulted column, backfilled from the existing severity, plus two indexes
-- that the board's ordering and date filtering rely on. No row is deleted and no column is
-- dropped; severity itself is untouched and remains the source of truth.
--
-- ASCII only on purpose: this cluster is WIN1252.

ALTER TABLE "Incident" ADD COLUMN "severityRank" INTEGER NOT NULL DEFAULT 0;

-- Backfill. The ranks match SEVERITY_RANK in src/lib/incidentCatalog.ts, which is the one
-- place the ordering is defined; legacy values sit at the rank they were taken to mean so
-- a historic Critical does not fall off the scale.
UPDATE "Incident" SET "severityRank" = CASE "severity"
    WHEN 'near_miss'           THEN 0
    WHEN 'Minor'               THEN 1
    WHEN 'medical_treatment'   THEN 2
    WHEN 'Moderate'            THEN 2
    WHEN 'restricted_work'     THEN 3
    WHEN 'Serious'             THEN 4
    WHEN 'lost_time_injury'    THEN 5
    WHEN 'environmental_major' THEN 6
    WHEN 'Critical'            THEN 6
    WHEN 'fatality'            THEN 7
    WHEN 'catastrophic'        THEN 8
    ELSE 0
END;

-- The board's default ordering, and its date-range filter.
CREATE INDEX "Incident_companyId_severityRank_idx" ON "Incident"("companyId", "severityRank");
CREATE INDEX "Incident_companyId_occurredAt_idx" ON "Incident"("companyId", "occurredAt");
