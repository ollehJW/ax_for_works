CREATE SCHEMA IF NOT EXISTS confluence_studio;
CREATE TABLE IF NOT EXISTS confluence_studio.connections (
    user_id text PRIMARY KEY REFERENCES platform.users(user_id) ON DELETE CASCADE,
    token bytea NOT NULL,
    confluence_user_key text NOT NULL,
    display_name text NOT NULL,
    connected_date timestamptz NOT NULL DEFAULT now(),
    last_verified_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN confluence_studio.connections.token IS 'Fernet-encrypted Confluence personal access token';

CREATE TABLE IF NOT EXISTS confluence_studio.registered_spaces (
    user_id text NOT NULL REFERENCES confluence_studio.connections(user_id) ON DELETE CASCADE,
    confluence_user_key text NOT NULL,
    space_key text NOT NULL,
    name text NOT NULL,
    PRIMARY KEY (user_id, confluence_user_key, space_key)
);

CREATE TABLE IF NOT EXISTS confluence_studio.templates (
    user_id text NOT NULL REFERENCES confluence_studio.connections(user_id) ON DELETE CASCADE,
    confluence_user_key text NOT NULL,
    page_id text NOT NULL,
    version integer NOT NULL,
    blueprint jsonb NOT NULL,
    PRIMARY KEY (user_id, confluence_user_key, page_id)
);
