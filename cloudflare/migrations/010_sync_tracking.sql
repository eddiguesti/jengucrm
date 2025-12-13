-- Migration 010: Sync Tracking
-- Adds columns to track synchronization between D1 and Supabase

-- Add sync tracking to emails table
ALTER TABLE emails ADD COLUMN synced_to_supabase INTEGER DEFAULT 0;

-- Index for finding unsynced emails efficiently
CREATE INDEX IF NOT EXISTS idx_emails_unsynced ON emails(synced_to_supabase) WHERE synced_to_supabase = 0;

-- Add version column to prospects for optimistic locking
ALTER TABLE prospects ADD COLUMN version INTEGER DEFAULT 1;

-- Add sync metadata column to prospects (stores last sync time from Supabase)
ALTER TABLE prospects ADD COLUMN supabase_updated_at TEXT;

-- Create sync_log table to track sync operations
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  sync_type TEXT NOT NULL,          -- 'supabase_to_d1' or 'd1_to_supabase'
  entity_type TEXT NOT NULL,        -- 'prospects', 'emails', 'campaigns', etc.
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT DEFAULT 'running',    -- 'running', 'completed', 'failed'
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON sync_log(sync_type, entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status, created_at DESC);

-- Create data_integrity_issues table to track detected issues
CREATE TABLE IF NOT EXISTS data_integrity_issues (
  id TEXT PRIMARY KEY,
  issue_type TEXT NOT NULL,         -- 'orphaned_email', 'duplicate_prospect', 'invalid_state', 'count_mismatch'
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',  -- 'info', 'warning', 'error', 'critical'
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  detected_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integrity_issues_unresolved ON data_integrity_issues(resolved, severity) WHERE resolved = 0;
CREATE INDEX IF NOT EXISTS idx_integrity_issues_type ON data_integrity_issues(issue_type, entity_type);
