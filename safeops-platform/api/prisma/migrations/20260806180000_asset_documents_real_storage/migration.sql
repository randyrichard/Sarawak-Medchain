-- Asset documents: real file storage.
--
-- AssetDocument held a name and a kind and nothing else - a placeholder from before the
-- module stored files. These columns bring it onto the same contract as PermitAttachment
-- and incident evidence: the client filename is kept for display only, the server picks a
-- UUID for the filesystem, and the MIME type and size are recorded as accepted.
--
-- All nullable: rows already in the table have no file behind them. They render as a name
-- with no download rather than as a broken link.
--
-- ASCII only on purpose: this cluster is WIN1252.

ALTER TABLE "AssetDocument" ADD COLUMN "originalName" TEXT;
ALTER TABLE "AssetDocument" ADD COLUMN "storedName"   TEXT;
ALTER TABLE "AssetDocument" ADD COLUMN "mimeType"     TEXT;
ALTER TABLE "AssetDocument" ADD COLUMN "sizeBytes"    INTEGER;
ALTER TABLE "AssetDocument" ADD COLUMN "uploadedBy"   TEXT;
ALTER TABLE "AssetDocument" ADD COLUMN "uploadedById" TEXT;

-- The register lists photos separately from manuals and certificates.
CREATE INDEX "AssetDocument_assetId_kind_idx" ON "AssetDocument"("assetId", "kind");
