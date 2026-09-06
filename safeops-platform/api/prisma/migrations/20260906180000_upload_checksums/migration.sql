-- SHA-256 of uploaded evidence, so a stored file can be shown to be the one that was
-- uploaded — after a restore, after a disk fault, or if the uploads volume is edited.
--
-- Nullable on all three, and deliberately so. Every file already in the store predates this
-- column and cannot have a digest computed retroactively that means anything: hashing them
-- now would record whatever the bytes are today, which proves nothing about what was
-- uploaded and would dress up an unverifiable file as a verified one. NULL reads as
-- "unverifiable", which is the truth, and the verify command reports it that way.
--
-- No index. Nothing looks a file up by digest; it is only ever compared against the row
-- already loaded.
ALTER TABLE "IncidentAttachment" ADD COLUMN "checksum" TEXT;
ALTER TABLE "PermitAttachment"   ADD COLUMN "checksum" TEXT;
ALTER TABLE "AssetDocument"      ADD COLUMN "checksum" TEXT;
