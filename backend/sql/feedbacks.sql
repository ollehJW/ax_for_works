-- Feedback metadata only. Images live in AX_FEEDBACKS_DIR/<feedback_id>/.
CREATE TABLE IF NOT EXISTS platform.feedbacks (
    feedback_id TEXT PRIMARY KEY,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('agent_bug','agent_improvement','new_agent','other')),
    agent_id TEXT,
    agent_name TEXT,
    content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 10000),
    images JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images)='array' AND jsonb_array_length(images)<=5),
    created_by TEXT REFERENCES platform.users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((feedback_type IN ('agent_bug','agent_improvement') AND agent_id IS NOT NULL AND agent_name IS NOT NULL)
        OR (feedback_type IN ('new_agent','other') AND agent_id IS NULL AND agent_name IS NULL))
);
CREATE INDEX IF NOT EXISTS feedbacks_created_at ON platform.feedbacks(created_at DESC,feedback_id DESC);
CREATE INDEX IF NOT EXISTS feedbacks_created_by ON platform.feedbacks(created_by,created_at DESC);
