-- Failed Tasks Table for Retry Queue
-- Stores enrichment failures for automatic and manual retry

CREATE TABLE IF NOT EXISTS failed_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('find_website', 'find_email', 'scrape', 'verify')),
  prospect_id TEXT NOT NULL,
  prospect_name TEXT,
  data TEXT, -- JSON with additional context
  error TEXT NOT NULL,
  attempts INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_failed_tasks_type ON failed_tasks(type);
CREATE INDEX IF NOT EXISTS idx_failed_tasks_prospect ON failed_tasks(prospect_id);
CREATE INDEX IF NOT EXISTS idx_failed_tasks_next_retry ON failed_tasks(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_failed_tasks_resolved ON failed_tasks(resolved_at);

-- Find tasks ready for retry
CREATE INDEX IF NOT EXISTS idx_failed_tasks_pending ON failed_tasks(resolved_at, next_retry_at, attempts, max_attempts);
