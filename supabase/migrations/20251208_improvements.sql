-- ============================================
-- JENGU CRM DATABASE IMPROVEMENTS
-- Run: npx supabase db push or manually in Supabase SQL editor
-- ============================================

-- 1. Settings table for configuration (warmup, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default warmup settings
INSERT INTO settings (key, value) VALUES
  ('warmup_start_date', '"2025-12-06"'),
  ('warmup_config', '{"absolute_max": 80, "stages": [{"maxDay": 999999, "limit": 80}]}')
ON CONFLICT (key) DO NOTHING;

-- 2. API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  period DATE NOT NULL,
  requests INT DEFAULT 0,
  cost_usd DECIMAL(10,4) DEFAULT 0,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(service, period)
);

-- 3. Increment counter RPC function (atomic updates)
CREATE OR REPLACE FUNCTION increment_counter(
  table_name TEXT,
  column_name TEXT,
  row_id UUID
) RETURNS VOID AS $$
BEGIN
  EXECUTE format('UPDATE %I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    table_name, column_name, column_name) USING row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Increment API usage RPC function
CREATE OR REPLACE FUNCTION increment_api_usage(
  p_service TEXT,
  p_period DATE,
  p_requests INT DEFAULT 1,
  p_cost DECIMAL DEFAULT 0,
  p_tokens_in INT DEFAULT 0,
  p_tokens_out INT DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO api_usage (service, period, requests, cost_usd, tokens_in, tokens_out)
  VALUES (p_service, p_period, p_requests, p_cost, p_tokens_in, p_tokens_out)
  ON CONFLICT (service, period) DO UPDATE SET
    requests = api_usage.requests + p_requests,
    cost_usd = api_usage.cost_usd + p_cost,
    tokens_in = api_usage.tokens_in + p_tokens_in,
    tokens_out = api_usage.tokens_out + p_tokens_out,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Get setting RPC function
CREATE OR REPLACE FUNCTION get_setting(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT value INTO result FROM settings WHERE key = p_key;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- 6. Set setting RPC function
CREATE OR REPLACE FUNCTION set_setting(p_key TEXT, p_value JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO settings (key, value, updated_at)
  VALUES (p_key, p_value, NOW())
  ON CONFLICT (key) DO UPDATE SET
    value = p_value,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_prospects_source_stage_email
  ON prospects(source, stage, email) WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_prospects_stage_score
  ON prospects(stage, score DESC) WHERE archived = false AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_direction_type_date
  ON emails(direction, email_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_prospect_direction
  ON emails(prospect_id, direction);

CREATE INDEX IF NOT EXISTS idx_enrichment_queue_status
  ON sales_nav_enrichment_queue(status, created_at ASC) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_activities_prospect
  ON activities(prospect_id, created_at DESC);

-- 8. Cache table (if not exists)
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_expires
  ON cache(expires_at) WHERE expires_at > NOW();

-- 9. Grant permissions
GRANT SELECT, INSERT, UPDATE ON settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cache TO authenticated;
GRANT EXECUTE ON FUNCTION increment_counter TO authenticated;
GRANT EXECUTE ON FUNCTION increment_api_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_setting TO authenticated;
GRANT EXECUTE ON FUNCTION set_setting TO authenticated;
