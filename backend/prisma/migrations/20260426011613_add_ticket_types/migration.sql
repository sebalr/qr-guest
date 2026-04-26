-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "ticket_type_id" TEXT;

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_types_event_id_tenant_id_idx" ON "ticket_types"("event_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_types_id_tenant_id_key" ON "ticket_types"("id", "tenant_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_tenant_id_fkey" FOREIGN KEY ("ticket_type_id", "tenant_id") REFERENCES "ticket_types"("id", "tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
