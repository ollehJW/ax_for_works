-- Catalog copy is synchronized from agents.json; enabled is owned by this table after first insert.
CREATE TABLE IF NOT EXISTS platform.agents (
    agent_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT REFERENCES platform.users(user_id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
