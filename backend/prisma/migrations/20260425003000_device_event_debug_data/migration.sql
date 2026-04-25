CREATE TABLE "device_event_debug_data" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_event_debug_data_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_event_debug_data_event_id_created_at_idx" ON "device_event_debug_data"("event_id", "created_at");
CREATE INDEX "device_event_debug_data_tenant_id_idx" ON "device_event_debug_data"("tenant_id");

ALTER TABLE "device_event_debug_data"
    ADD CONSTRAINT "device_event_debug_data_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_event_debug_data"
    ADD CONSTRAINT "device_event_debug_data_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_event_debug_data"
    ADD CONSTRAINT "device_event_debug_data_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
