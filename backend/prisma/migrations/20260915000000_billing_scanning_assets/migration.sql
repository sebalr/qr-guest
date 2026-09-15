-- This owner-only migration must backfill every tenant despite forced RLS.
BEGIN;
SET LOCAL app.bypass_rls = 'on';
ALTER TABLE tenants ADD COLUMN free_remaining INTEGER NOT NULL DEFAULT 50, ADD COLUMN events_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN paid_credits INTEGER NOT NULL DEFAULT 0;
UPDATE tenants t SET events_created=(SELECT count(*) FROM events e WHERE e.tenant_id=t.id), free_remaining=GREATEST(0,50-(SELECT count(*) FROM tickets k WHERE k.tenant_id=t.id));
UPDATE tenants SET plan='personal' WHERE plan='pro';
UPDATE events SET max_guests=NULL WHERE max_guests IN (10,500);
CREATE TABLE credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), event_id TEXT NOT NULL, kind TEXT NOT NULL, free_delta INTEGER NOT NULL DEFAULT 0, paid_delta INTEGER NOT NULL DEFAULT 0, reference TEXT NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,reference), FOREIGN KEY(event_id,tenant_id) REFERENCES events(id,tenant_id));
CREATE TABLE issuance_requests (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), key TEXT NOT NULL, hash TEXT NOT NULL, result JSONB NOT NULL, UNIQUE(tenant_id,key));
CREATE TABLE payment_orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), event_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), amount DECIMAL(18,2) NOT NULL, rate DECIMAL(18,6) NOT NULL, rate_at TIMESTAMP(3) NOT NULL, country TEXT NOT NULL DEFAULT 'AR', currency TEXT NOT NULL DEFAULT 'ARS', provider TEXT NOT NULL DEFAULT 'mercadopago', status TEXT NOT NULL DEFAULT 'quoted', checkout_url TEXT, preference_id TEXT, payment_id TEXT UNIQUE, credited INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMP(3) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id,tenant_id) REFERENCES events(id,tenant_id));
CREATE INDEX payment_orders_status_created_at_idx ON payment_orders(status,created_at);
CREATE TABLE exchange_rates (id TEXT PRIMARY KEY DEFAULT 'official', rate DECIMAL(18,6) NOT NULL, source_at TIMESTAMP(3) NOT NULL, fetched_at TIMESTAMP(3) NOT NULL);
CREATE TABLE contact_requests (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE event_assets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), event_id TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL, bytes BYTEA NOT NULL, x DOUBLE PRECISION NOT NULL DEFAULT 0, y DOUBLE PRECISION NOT NULL DEFAULT 0, width DOUBLE PRECISION NOT NULL, height DOUBLE PRECISION NOT NULL, UNIQUE(tenant_id,event_id,kind), FOREIGN KEY(event_id,tenant_id) REFERENCES events(id,tenant_id));
CREATE TABLE scan_attempts (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), event_id TEXT NOT NULL, ticket_id TEXT NOT NULL, device_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), scanned_at TIMESTAMP(3) NOT NULL, confirmed BOOLEAN NOT NULL DEFAULT false, outcome TEXT NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(event_id,tenant_id) REFERENCES events(id,tenant_id), FOREIGN KEY(ticket_id,tenant_id) REFERENCES tickets(id,tenant_id));
CREATE INDEX scan_attempts_tenant_id_event_id_created_at_idx ON scan_attempts(tenant_id,event_id,created_at);
DO $$ DECLARE tbl TEXT; BEGIN
FOREACH tbl IN ARRAY ARRAY['credit_ledger','issuance_requests','payment_orders','contact_requests','event_assets','scan_attempts'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (current_setting(''app.bypass_rls'',true)=''on'' OR tenant_id=current_setting(''app.current_tenant_id'',true)) WITH CHECK (current_setting(''app.bypass_rls'',true)=''on'' OR tenant_id=current_setting(''app.current_tenant_id'',true))',tbl);
END LOOP;
END $$;
CREATE FUNCTION immutable_credit_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Credit ledger is append-only'; END $$;
CREATE TRIGGER credit_ledger_immutable BEFORE UPDATE OR DELETE ON credit_ledger FOR EACH ROW EXECUTE FUNCTION immutable_credit_ledger();

UPDATE events e SET version=GREATEST(e.version,COALESCE((SELECT max(t.version) FROM tickets t WHERE t.event_id=e.id),0));

CREATE FUNCTION immutable_scan_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Scan history is append-only'; END $$;
CREATE TRIGGER scan_attempts_immutable BEFORE UPDATE OR DELETE ON scan_attempts FOR EACH ROW EXECUTE FUNCTION immutable_scan_history();
CREATE TRIGGER scans_immutable BEFORE UPDATE OR DELETE ON scans FOR EACH ROW EXECUTE FUNCTION immutable_scan_history();

COMMIT;
