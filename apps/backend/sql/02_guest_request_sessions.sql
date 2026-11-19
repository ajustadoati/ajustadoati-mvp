-- Apply before deploying the backend version that uses GuestRequestStore.
-- Additive: existing tables and the running backend are not modified.
CREATE TABLE IF NOT EXISTS guest_request_sessions (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    category_id INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    demo BOOLEAN NOT NULL DEFAULT false,
    demo_provider_email VARCHAR(255),
    payload JSONB NOT NULL
);

-- Supabase exposes public tables through PostgREST; guest GPS and contact data
-- must not be readable through the anon/authenticated API.
ALTER TABLE guest_request_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_guest_request_sessions_status_created
    ON guest_request_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_request_sessions_category_created
    ON guest_request_sessions (category_id, created_at DESC);
