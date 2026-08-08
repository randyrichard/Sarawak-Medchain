-- Keep Incident.severityRank correct no matter which path writes the severity.
--
-- The rank was maintained in IncidentService.create only. Anything else that writes an
-- incident - the demo seed, a bulk import, a future update path, a hand-run SQL fix - left
-- the rank at its default of 0, which sorts a fatality below a near miss on the board. A
-- column that can silently disagree with the column beside it is worse than no column.
--
-- Doing it in the database rather than in the service is deliberate: it is the only place
-- that sees every writer. The application still sets the rank on create, so the value is
-- correct in the row it returns without a round trip; the trigger makes that belt and
-- braces rather than the only guard.
--
-- Additive: one function, one trigger, and a re-backfill of anything already adrift.
-- No column is added or dropped and no row is deleted.
--
-- ASCII only on purpose: this cluster is WIN1252.

CREATE OR REPLACE FUNCTION incident_severity_rank(s "IncidentSeverity")
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  -- Mirrors SEVERITY_RANK in src/lib/incidentCatalog.ts, which is where the ordering is
  -- defined. Legacy values sit at the rank they were understood to mean, so a historic
  -- Critical does not fall off the scale when the newer values were appended.
  SELECT CASE s
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
$$;

CREATE OR REPLACE FUNCTION incident_set_severity_rank()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Derived, never trusted from the caller: a client-supplied rank would be a way to
  -- reorder somebody else's board.
  NEW."severityRank" := incident_severity_rank(NEW."severity");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incident_severity_rank_trg ON "Incident";

CREATE TRIGGER incident_severity_rank_trg
  BEFORE INSERT OR UPDATE OF "severity" ON "Incident"
  FOR EACH ROW
  EXECUTE FUNCTION incident_set_severity_rank();

-- Repair anything already inconsistent, including rows written after the column was added
-- but through a path that did not set it.
UPDATE "Incident"
   SET "severityRank" = incident_severity_rank("severity")
 WHERE "severityRank" IS DISTINCT FROM incident_severity_rank("severity");
