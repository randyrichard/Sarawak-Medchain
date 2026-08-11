-- Make the severity rank invariant hold against every write, not just writes that mention
-- severity.
--
-- The trigger was created as BEFORE INSERT OR UPDATE **OF severity**. That column list is
-- the whole problem: an UPDATE that sets only "severityRank" never fires it, so
--
--   UPDATE "Incident" SET "severityRank" = 99 WHERE ...
--
-- was accepted and left a near miss ranked above a fatality. The board orders by rank and
-- the dashboard's critical band is rank-based, so one hand-run UPDATE or a column-wise
-- import could quietly float a trivial incident to the top of both.
--
-- Dropping the column list makes the rank genuinely derived: whatever a writer supplies is
-- overwritten from severity on every insert and every update. The function is IMMUTABLE and
-- is a single CASE, so the cost on unrelated updates is not measurable.

DROP TRIGGER IF EXISTS incident_severity_rank_trg ON "Incident";

CREATE TRIGGER incident_severity_rank_trg
  BEFORE INSERT OR UPDATE ON "Incident"
  FOR EACH ROW EXECUTE FUNCTION incident_set_severity_rank();

-- Repair anything that drifted while the narrower trigger was in place.
UPDATE "Incident"
   SET "severityRank" = incident_severity_rank("severity")
 WHERE "severityRank" IS DISTINCT FROM incident_severity_rank("severity");
