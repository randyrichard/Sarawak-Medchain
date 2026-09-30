-- Corrective actions were owned by name alone: `ownerId` existed but nothing ever set it.
-- Link each existing action to its owner's account where that is unambiguous - exactly
-- one member of the action's own workspace has that name, ignoring case and surrounding
-- spaces. Anything else (no match, or two people sharing the name) stays unlinked and is
-- still owned by name, exactly as before, so no action is taken away from anybody.
UPDATE "CorrectiveAction" AS ca
SET "ownerId" = m."userId"
FROM (
  SELECT ca2."id" AS "actionId", MIN(u."id") AS "userId"
  FROM "CorrectiveAction" ca2
  JOIN "Membership" mem ON mem."companyId" = ca2."companyId"
  JOIN "User" u ON u."id" = mem."userId"
             AND lower(btrim(u."name")) = lower(btrim(ca2."owner"))
  WHERE ca2."ownerId" IS NULL
  GROUP BY ca2."id"
  HAVING COUNT(DISTINCT u."id") = 1
) AS m
WHERE ca."id" = m."actionId";

-- "My actions" is now (ownerId = me) OR (ownerId IS NULL AND owner = my name).
CREATE INDEX "CorrectiveAction_companyId_ownerId_idx" ON "CorrectiveAction"("companyId", "ownerId");
