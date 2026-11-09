CREATE TABLE IF NOT EXISTS platform.access_events (
 event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 full_name TEXT NOT NULL,
 team_name TEXT NOT NULL DEFAULT '',
 service_id TEXT NOT NULL,
 event_kind TEXT NOT NULL CHECK (event_kind IN ('login','service_entry')),
 session_key TEXT NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(session_key,service_id)
);
CREATE INDEX IF NOT EXISTS access_events_time ON platform.access_events(occurred_at DESC,event_id DESC);
CREATE INDEX IF NOT EXISTS access_events_service_time ON platform.access_events(service_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS platform.access_collection (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform.access_collection(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
