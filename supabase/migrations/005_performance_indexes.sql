-- Performance optimization indexes
-- These composite indexes optimize the most common query patterns

-- Emails table indexes
-- Used by: campaigns API (filtering by campaign_id and direction)
CREATE INDEX IF NOT EXISTS idx_emails_campaign_direction
ON emails(campaign_id, direction)
WHERE campaign_id IS NOT NULL;

-- Used by: stats/detailed API (filtering by direction and email_type)
CREATE INDEX IF NOT EXISTS idx_emails_direction_type
ON emails(direction, email_type);

-- Used by: follow-up API (finding emails by prospect)
CREATE INDEX IF NOT EXISTS idx_emails_prospect_direction
ON emails(prospect_id, direction);

-- Used by: stats/detailed (sent_at date filtering)
CREATE INDEX IF NOT EXISTS idx_emails_sent_at
ON emails(sent_at)
WHERE sent_at IS NOT NULL;

-- Prospects table indexes
-- Used by: auto-email and follow-up APIs (stage + archived filtering)
CREATE INDEX IF NOT EXISTS idx_prospects_stage_archived
ON prospects(stage, archived);

-- Used by: stats/detailed (tier filtering for non-archived)
CREATE INDEX IF NOT EXISTS idx_prospects_tier_archived
ON prospects(tier, archived);

-- Used by: campaigns (finding meeting stage prospects)
CREATE INDEX IF NOT EXISTS idx_prospects_stage
ON prospects(stage);

-- Activities table indexes
-- Used by: stats/detailed (filtering by created_at)
CREATE INDEX IF NOT EXISTS idx_activities_created_at
ON activities(created_at);

-- Used by: prospect detail views (filtering by prospect)
CREATE INDEX IF NOT EXISTS idx_activities_prospect_type
ON activities(prospect_id, type);

-- Scrape runs index
-- Used by: stats/detailed (ordering by completed_at)
CREATE INDEX IF NOT EXISTS idx_scrape_runs_completed
ON scrape_runs(completed_at DESC);
