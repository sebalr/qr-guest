CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(255),
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    guest_id UUID,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    version INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    event_id UUID NOT NULL REFERENCES events(id),
    device_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    dedupe_key VARCHAR(255) UNIQUE,
    scanned_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_state (
    device_id VARCHAR(255) NOT NULL,
    event_id UUID NOT NULL,
    last_ticket_version INTEGER DEFAULT 0,
    last_scan_cursor TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, event_id)
);

CREATE TABLE IF NOT EXISTS device_event_debug_data (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_event_debug_data_event_created
ON device_event_debug_data(event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_scans_event_id
ON scans(event_id);

CREATE INDEX IF NOT EXISTS idx_tickets_event_id
ON tickets(event_id);
