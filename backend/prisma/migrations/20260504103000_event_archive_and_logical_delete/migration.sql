-- AlterTable
ALTER TABLE "events"
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "events_tenant_id_is_deleted_archived_at_created_at_idx"
ON "events"("tenant_id", "is_deleted", "archived_at", "created_at");
