-- Add nullable dedupe key so only one non-forced first scan is allowed per ticket/event
ALTER TABLE "scans"
ADD COLUMN "dedupe_key" TEXT;

-- Unique keys allow many NULLs in PostgreSQL, so forced rescans/offline duplicates stay allowed
CREATE UNIQUE INDEX "scans_dedupe_key_key"
ON "scans"("dedupe_key");
