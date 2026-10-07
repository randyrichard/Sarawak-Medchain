-- Photo counts from what is actually stored.
--
-- Before photo storage (20261007090000_field_evidence) the inspection and audit runners
-- sent a count of the photos picked and then threw the photos away. The count was saved,
-- and the results screen shows it as "2 photo(s)" - photos that do not exist anywhere.
-- Since then the API sets these counts itself: an inspection's from its stored photos,
-- an audit finding's to 0. This brings the rows written before that into line.
--
-- Data only; no schema change. Safe to run again.

UPDATE "Inspection" i
SET "photoCount" = (SELECT count(*) FROM "FieldEvidence" f WHERE f."inspectionId" = i.id)
WHERE "photoCount" <> (SELECT count(*) FROM "FieldEvidence" f WHERE f."inspectionId" = i.id);

UPDATE "AuditFinding" SET "photoCount" = 0 WHERE "photoCount" <> 0;
