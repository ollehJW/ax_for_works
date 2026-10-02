-- Additive migration: preserves all existing posts and account data.
CREATE TABLE IF NOT EXISTS platform.board_posts (
    post_id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('notice', 'patch')),
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
    content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 30000),
    created_by TEXT REFERENCES platform.users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_posts_category_created ON platform.board_posts(category,created_at DESC,post_id DESC);
