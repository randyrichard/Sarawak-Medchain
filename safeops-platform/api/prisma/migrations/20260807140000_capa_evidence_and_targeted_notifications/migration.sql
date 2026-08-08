-- CAPA evidence files, and notifications addressed to a person.
--
-- Additive only. Four nullable columns and two indexes; nothing is dropped and no existing
-- row changes meaning. A notification with a null recipient is a workspace-feed
-- notification, which is exactly what every existing row is.
--
-- ASCII only on purpose: this cluster is WIN1252.

-- Who a notification is actually for. Null keeps the existing broadcast behaviour.
ALTER TABLE "Notification" ADD COLUMN "recipientUserId" TEXT;
-- The name at the time: "assigned to you" has to still read correctly after an account is
-- renamed or removed.
ALTER TABLE "Notification" ADD COLUMN "recipientName"   TEXT;
-- Why they are getting it: reporter | investigator | capa_owner | safety_officer | ...
ALTER TABLE "Notification" ADD COLUMN "recipientRole"   TEXT;

CREATE INDEX "Notification_recipientUserId_createdAt_idx"
  ON "Notification"("recipientUserId", "createdAt");

-- Evidence files hang off the corrective action they prove. One attachment table rather
-- than a second model, so there is one upload route, one allow-list and one storage
-- contract - the file is the same kind of thing either way.
ALTER TABLE "IncidentAttachment" ADD COLUMN "actionId" TEXT;

CREATE INDEX "IncidentAttachment_actionId_idx" ON "IncidentAttachment"("actionId");

-- Cascade: deleting the action deletes the proof of an action that no longer exists.
ALTER TABLE "IncidentAttachment"
  ADD CONSTRAINT "IncidentAttachment_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
