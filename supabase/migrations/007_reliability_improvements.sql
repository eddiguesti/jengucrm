-- Migration: Reliability improvements
-- Adds: cache, audit_log, idempotency_keys tables
-- Adds: duplicate prevention for prospects

-- ============================================
-- CACHE TABLE
-- For persistent caching across deployments
-- ============================================

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);

-- Enable RLS
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow cache operations" ON cache;
CREATE POLICY "Allow cache operations"
  ON cache FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- AUDIT LOG TABLE
-- Track who changed what, when
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB,
  metadata JSONB,
  request_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log(request_id) WHERE request_id IS NOT NULL;

-- Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow audit log operations" ON audit_log;
CREATE POLICY "Allow audit log operations"
  ON audit_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- IDEMPOTENCY KEYS TABLE
-- Prevent duplicate operations
-- ============================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Enable RLS
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow idempotency operations" ON idempotency_keys;
CREATE POLICY "Allow idempotency operations"
  ON idempotency_keys FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- DUPLICATE PREVENTION FOR PROSPECTS
-- ============================================

-- First, deduplicate existing prospects by email (keep highest score)
-- Only for personal emails, not generic ones like info@, reservations@
WITH duplicates AS (
  SELECT id, email,
    ROW_NUMBER() OVER (
      PARTITION BY email
      ORDER BY score DESC NULLS LAST, created_at DESC
    ) as rn
  FROM prospects
  WHERE email IS NOT NULL
    AND email != ''
    AND email NOT LIKE 'info@%'
    AND email NOT LIKE 'reservations@%'
    AND email NOT LIKE 'contact@%'
    AND email NOT LIKE 'hello@%'
    AND email NOT LIKE 'frontdesk@%'
    AND email NOT LIKE 'reception@%'
    AND email NOT LIKE 'booking@%'
    AND email NOT LIKE 'enquiries@%'
)
DELETE FROM prospects WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Deduplicate by website (keep highest score)
WITH duplicates AS (
  SELECT id, website,
    ROW_NUMBER() OVER (
      PARTITION BY website
      ORDER BY score DESC NULLS LAST, created_at DESC
    ) as rn
  FROM prospects
  WHERE website IS NOT NULL AND website != ''
)
DELETE FROM prospects WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Drop old indexes if they exist (in case definition changed)
DROP INDEX IF EXISTS idx_prospects_unique_email;
DROP INDEX IF EXISTS idx_prospects_unique_website;

-- Add partial unique index on email (exclude generic emails)
CREATE UNIQUE INDEX idx_prospects_unique_email
  ON prospects(email)
  WHERE email IS NOT NULL
    AND email != ''
    AND email NOT LIKE 'info@%'
    AND email NOT LIKE 'reservations@%'
    AND email NOT LIKE 'contact@%'
    AND email NOT LIKE 'hello@%'
    AND email NOT LIKE 'frontdesk@%'
    AND email NOT LIKE 'reception@%'
    AND email NOT LIKE 'booking@%'
    AND email NOT LIKE 'enquiries@%';

-- Add partial unique index on website domain (only where website is not null/empty)
-- This prevents duplicate entries for the same hotel
CREATE UNIQUE INDEX idx_prospects_unique_website
  ON prospects(website)
  WHERE website IS NOT NULL AND website != '';

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

-- Clean expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Clean expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Clean old audit logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Master cleanup function (call from cron)
CREATE OR REPLACE FUNCTION run_daily_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cache_deleted integer;
  idempotency_deleted integer;
  audit_deleted integer;
  rate_limit_deleted integer;
BEGIN
  -- Clean cache
  cache_deleted := cleanup_expired_cache();

  -- Clean idempotency keys
  idempotency_deleted := cleanup_expired_idempotency();

  -- Clean old audit logs
  audit_deleted := cleanup_old_audit_logs();

  -- Clean old rate limits
  DELETE FROM rate_limits WHERE updated_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS rate_limit_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'cache_deleted', cache_deleted,
    'idempotency_deleted', idempotency_deleted,
    'audit_deleted', audit_deleted,
    'rate_limit_deleted', rate_limit_deleted,
    'ran_at', NOW()
  );
END;
$$;

-- ============================================
-- ADDITIONAL INDEXES FOR COMMON QUERIES
-- ============================================

-- Index for finding prospects without emails (for enrichment)
CREATE INDEX IF NOT EXISTS idx_prospects_no_email
  ON prospects(id)
  WHERE email IS NULL OR email = '';

-- Index for mystery shopper queue (prospects with generic emails, not yet sent)
CREATE INDEX IF NOT EXISTS idx_prospects_mystery_queue
  ON prospects(id)
  WHERE email LIKE 'info@%'
     OR email LIKE 'reservations@%'
     OR email LIKE 'contact@%'
     OR email LIKE 'hello@%';

-- Index for checking tags (JSONB contains)
CREATE INDEX IF NOT EXISTS idx_prospects_tags ON prospects USING GIN(tags);

-- Index for email message_id lookups (for reply threading)
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id) WHERE message_id IS NOT NULL;

-- Index for email thread lookups (outbound emails to match replies)
CREATE INDEX IF NOT EXISTS idx_emails_outbound_to ON emails(to_email, direction) WHERE direction = 'outbound';
