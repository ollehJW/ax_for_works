ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','reviewing','resolved','on_hold'));
ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS reply TEXT NOT NULL DEFAULT '' CHECK (length(reply)<=10000);
ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '' CHECK (length(admin_note)<=10000);
ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES platform.users(user_id) ON DELETE SET NULL;
ALTER TABLE platform.feedbacks ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS feedbacks_status_created ON platform.feedbacks(status,created_at DESC);
