CREATE TABLE IF NOT EXISTS access_codes (
    code TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'generated',
    watched_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    percentage INTEGER NOT NULL DEFAULT 0,
    email_status TEXT NOT NULL DEFAULT 'not_sent',
    email_sent_at TEXT,
    email_message_id TEXT,
    email_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_codes_status
    ON access_codes(status);

CREATE INDEX IF NOT EXISTS idx_access_codes_email_status
    ON access_codes(email_status);

CREATE INDEX IF NOT EXISTS idx_access_codes_created_at
    ON access_codes(created_at);
