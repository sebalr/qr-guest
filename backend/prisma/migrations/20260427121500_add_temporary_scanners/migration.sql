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

CREATE UNIQUE INDEX "temporary_scanners_login_token_key" ON "temporary_scanners"("login_token");
CREATE INDEX "temporary_scanners_tenant_id_event_id_created_at_idx" ON "temporary_scanners"("tenant_id", "event_id", "created_at");
CREATE INDEX "temporary_scanners_tenant_id_user_id_idx" ON "temporary_scanners"("tenant_id", "user_id");
CREATE UNIQUE INDEX "temporary_scanners_event_id_user_id_key" ON "temporary_scanners"("event_id", "user_id");

ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temporary_scanners" ADD CONSTRAINT "temporary_scanners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "temporary_scanners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "temporary_scanners" FORCE ROW LEVEL SECURITY;

CREATE POLICY "temporary_scanners_tenant_rls_policy" ON "temporary_scanners"
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = current_setting('app.current_tenant_id', true)
);
