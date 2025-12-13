-- Send log table for tracking all send attempts (successful and blocked)
-- Used for debugging, audit trail, and safety verification

CREATE TABLE IF NOT EXISTS send_log (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  subject_hash TEXT,
  sent INTEGER NOT NULL DEFAULT 0,  -- 1 = sent, 0 = blocked
  reason TEXT,                       -- Why it was blocked
  safety_score INTEGER,              -- 0-100 score
  failed_checks TEXT,                -- JSON array of failed check names
  blocked_by TEXT,                   -- First critical check that failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (prospect_id) REFERENCES prospects(id)
);

-- Index for querying blocked sends
CREATE INDEX IF NOT EXISTS idx_send_log_sent ON send_log(sent);

-- Index for querying by prospect
CREATE INDEX IF NOT EXISTS idx_send_log_prospect ON send_log(prospect_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_send_log_created ON send_log(created_at);

-- Email exclusions table for dynamic exclusion list
CREATE TABLE IF NOT EXISTS email_exclusions (
  id TEXT PRIMARY KEY,
  email TEXT,                        -- Full email address
  domain TEXT,                       -- Domain only (for domain-wide blocks)
  reason TEXT NOT NULL,              -- Why excluded
  added_by TEXT,                     -- Who added it
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT check_email_or_domain CHECK (email IS NOT NULL OR domain IS NOT NULL)
);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_exclusions_email ON email_exclusions(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exclusions_domain ON email_exclusions(domain) WHERE domain IS NOT NULL;
