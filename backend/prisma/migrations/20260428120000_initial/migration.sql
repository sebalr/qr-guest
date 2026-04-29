-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "max_guests" INTEGER,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "guest_id" TEXT,
    "ticket_type_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_scanners" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporary_scanners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "scanned_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_event_debug_data" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_event_debug_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "tenant_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "last_ticket_version" INTEGER NOT NULL DEFAULT 0,
    "last_scan_cursor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("tenant_id", "device_id", "event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_tokens_token_hash_key" ON "user_auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_auth_tokens_user_id_type_consumed_at_idx" ON "user_auth_tokens"("user_id", "type", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_user_id_tenant_id_key" ON "user_tenants"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_id_tenant_id_key" ON "events"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "events_tenant_id_created_at_idx" ON "events"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guests_id_tenant_id_key" ON "guests"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "guests_tenant_id_name_idx" ON "guests"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_types_id_tenant_id_key" ON "ticket_types"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "ticket_types_event_id_tenant_id_idx" ON "ticket_types"("event_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_tenant_id_key" ON "tickets"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_event_id_created_at_idx" ON "tickets"("tenant_id", "event_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "temporary_scanners_login_token_key" ON "temporary_scanners"("login_token");

-- CreateIndex
CREATE INDEX "temporary_scanners_tenant_id_event_id_created_at_idx" ON "temporary_scanners"("tenant_id", "event_id", "created_at");

-- CreateIndex
CREATE INDEX "temporary_scanners_tenant_id_user_id_idx" ON "temporary_scanners"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "temporary_scanners_event_id_user_id_key" ON "temporary_scanners"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scans_id_tenant_id_key" ON "scans"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "scans_tenant_id_dedupe_key_key" ON "scans"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "scans_tenant_id_event_id_created_at_idx" ON "scans"("tenant_id", "event_id", "created_at");

-- CreateIndex
CREATE INDEX "device_event_debug_data_tenant_id_event_id_created_at_idx" ON "device_event_debug_data"("tenant_id", "event_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_auth_tokens" ADD CONSTRAINT "user_auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guest_id_tenant_id_fkey" FOREIGN KEY ("guest_id", "tenant_id") REFERENCES "guests"("id", "tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_tenant_id_fkey" FOREIGN KEY ("ticket_type_id", "tenant_id") REFERENCES "ticket_types"("id", "tenant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_ticket_id_tenant_id_fkey" FOREIGN KEY ("ticket_id", "tenant_id") REFERENCES "tickets"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_event_debug_data" ADD CONSTRAINT "device_event_debug_data_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_event_debug_data" ADD CONSTRAINT "device_event_debug_data_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "temporary_scanners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_event_debug_data" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tickets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "temporary_scanners" FORCE ROW LEVEL SECURITY;
ALTER TABLE "scans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sync_state" FORCE ROW LEVEL SECURITY;
ALTER TABLE "device_event_debug_data" FORCE ROW LEVEL SECURITY;

CREATE POLICY "events_tenant_rls_policy" ON "events"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "tickets_tenant_rls_policy" ON "tickets"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "temporary_scanners_tenant_rls_policy" ON "temporary_scanners"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "scans_tenant_rls_policy" ON "scans"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "guests_tenant_rls_policy" ON "guests"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "sync_state_tenant_rls_policy" ON "sync_state"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);

CREATE POLICY "device_event_debug_data_tenant_rls_policy" ON "device_event_debug_data"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);
