-- Migration: Activities index for performance
-- Adds composite index for activity lookups by prospect

-- Index for activity queries by prospect (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_activities_prospect_created
  ON activities(prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;

-- Index for activity type filtering
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
