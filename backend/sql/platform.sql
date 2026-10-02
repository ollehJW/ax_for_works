-- WiaNews account schema, with the same IDs, fields and relationships.
-- PostgreSQL booleans and timestamptz replace SQLite integer/text flags and dates.
-- Run explicitly using backend.import_accounts; startup never resets account data.
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.orgs (
    org_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS platform.teams (
    team_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS platform.roles (
    role_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS platform.users (
    user_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    team_id TEXT NOT NULL REFERENCES platform.teams(team_id),
    role_id TEXT NOT NULL REFERENCES platform.roles(role_id),
    email TEXT NOT NULL DEFAULT '',
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ
);
-- Preserve WiaNews's case-insensitive employee ID uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_ci ON platform.users (lower(employee_id));
CREATE TABLE IF NOT EXISTS platform.sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES platform.users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON platform.sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON platform.sessions(expires_at);
CREATE TABLE IF NOT EXISTS platform.login_attempts (
    attempt_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL CHECK (count >= 0),
    expires_at DOUBLE PRECISION NOT NULL
);

-- Organization membership uses the shared organization directory.
ALTER TABLE platform.users ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES platform.orgs(org_id);
