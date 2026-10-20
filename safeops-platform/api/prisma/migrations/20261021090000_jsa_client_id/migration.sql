-- A JSA row that was written before the server had ever heard of it.
--
-- A job safety analysis is filled in at a desk and then walked down at the job, which on a
-- plant means no coverage. Amending an existing row offline already worked: every cell edit
-- is addressed by this table's own id, and that id exists because the row does. A hazard
-- found *at* the job had no such id, so adding a row was refused — and a crew that finds an
-- unguarded opening and is told to come back when there is signal writes it on a glove.
--
-- So the device names the row itself, and the server keeps that name beside its own id
-- rather than adopting it as the primary key: ids stay server-generated, and a device
-- cannot reach into the id space of a permit it was never given.
--
-- Null for every row added with a connection, which is most of them.
ALTER TABLE "PermitJsaStep" ADD COLUMN "clientId" TEXT;

-- The constraint that makes a replay exact.
--
-- The same queued row arrives twice whenever a phone drains its outbox from two tabs, or a
-- request is cut off after the row was written but before the device heard so. Until now
-- the server recognised the second copy by matching the hazard text, which is a guess: two
-- genuinely different steps are free to name the same hazard, and a JSA with one hazard
-- listed twice reads as two separate exposures with two separate controls — on the document
-- an approver signed.
--
-- Scoped to the permit rather than global. The name is generated on a device, and two
-- devices are free to produce the same one for two different permits. Postgres allows any
-- number of NULLs in a unique index, so rows added with a connection are unaffected.
CREATE UNIQUE INDEX "PermitJsaStep_permitId_clientId_key" ON "PermitJsaStep"("permitId", "clientId");
