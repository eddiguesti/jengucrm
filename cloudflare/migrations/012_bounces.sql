-- Bounces table for tracking all bounce events
-- This is critical for deliverability - never send to bounced addresses

CREATE TABLE IF NOT EXISTS bounces (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hard', 'soft', 'block', 'complaint', 'unknown')),
  reason TEXT,
  original_message_id TEXT,
  notification_id TEXT,
  smtp_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_bounces_email ON bounces(email);

-- Index for type-based queries
CREATE INDEX IF NOT EXISTS idx_bounces_type ON bounces(type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_bounces_created ON bounces(created_at);

-- Index for message ID lookup
CREATE INDEX IF NOT EXISTS idx_bounces_message_id ON bounces(original_message_id);

-- Add bounce tracking columns to prospects if they don't exist
-- These may already exist, so we use a safe approach

-- Add bounce tracking columns to prospects table
-- Note: These may fail if columns already exist - that's OK
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN

-- Try to add bounce_type column
ALTER TABLE prospects ADD COLUMN bounce_type TEXT;

-- Try to add bounce_reason column
ALTER TABLE prospects ADD COLUMN bounce_reason TEXT;

-- Try to add bounced_at column
ALTER TABLE prospects ADD COLUMN bounced_at TEXT;

-- Complaints table for tracking spam complaints separately
-- This is for detailed complaint tracking beyond the bounces table
CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  source TEXT NOT NULL, -- 'feedback_loop', 'manual', 'reply', 'webhook'
  original_message_id TEXT,
  details TEXT, -- JSON with additional context
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_complaints_email ON complaints(email);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);
