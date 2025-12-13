-- =====================================================
-- MISSING FEATURES MIGRATION
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 0. CLEANUP EXISTING DUPLICATES FIRST
-- =====================================================

-- Delete duplicates, keeping the one with highest score (or most recent)
-- This must run BEFORE creating the unique constraint
DELETE FROM prospects
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, '')))
                   ORDER BY score DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC
               ) as rn
        FROM prospects
    ) ranked
    WHERE rn > 1
);

-- =====================================================
-- 1. DATABASE UNIQUE CONSTRAINTS (Section 0)
-- =====================================================

-- Unique constraint on prospects (normalized name + city)
-- Using a functional index for case-insensitive matching
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_dedupe
  ON prospects (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, ''))));

-- Unique constraint on emails to prevent duplicate sends
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_no_duplicate_outreach
  ON emails (prospect_id, LOWER(to_email), email_type)
  WHERE direction = 'outbound' AND email_type = 'outreach';

-- =====================================================
-- 2. MYSTERY SHOPPER QUEUE TABLE (Section 3)
-- =====================================================

CREATE TABLE IF NOT EXISTS mystery_shopper_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,

    -- Queue status
    status TEXT DEFAULT 'pending', -- 'pending', 'assigned', 'sent', 'replied', 'completed', 'failed'
    priority INTEGER DEFAULT 5, -- 1-10, lower = higher priority

    -- Assignment
    assigned_to TEXT, -- Could be email or user ID
    assigned_at TIMESTAMPTZ,

    -- Tracking
    email_sent_at TIMESTAMPTZ,
    reply_received_at TIMESTAMPTZ,
    response_time_minutes INTEGER, -- Calculated on reply

    -- Results
    gm_name_found TEXT,
    gm_email_found TEXT,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Unique constraint - one queue entry per prospect
CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_queue_prospect
  ON mystery_shopper_queue (prospect_id) WHERE status NOT IN ('completed', 'failed');

-- Index for queue processing
CREATE INDEX IF NOT EXISTS idx_mystery_queue_status ON mystery_shopper_queue (status, priority);
CREATE INDEX IF NOT EXISTS idx_mystery_queue_created ON mystery_shopper_queue (created_at DESC);

-- Enable RLS
ALTER TABLE mystery_shopper_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on mystery_shopper_queue" ON mystery_shopper_queue FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER mystery_shopper_queue_updated_at
    BEFORE UPDATE ON mystery_shopper_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 3. SCRAPER HEALTH TRACKING (Section 1)
-- =====================================================

-- Scraper health summary table
CREATE TABLE IF NOT EXISTS scraper_health (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    scraper_id TEXT NOT NULL UNIQUE, -- e.g., 'hosco', 'hcareers'

    -- Health metrics
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    consecutive_failures INTEGER DEFAULT 0,

    -- Status
    is_healthy BOOLEAN DEFAULT true,
    flagged_at TIMESTAMPTZ,

    -- Last run info
    last_run_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_error TEXT,

    -- Performance
    avg_properties_per_run DECIMAL(10,2),
    avg_duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE scraper_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on scraper_health" ON scraper_health FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER scraper_health_updated_at
    BEFORE UPDATE ON scraper_health
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 4. ADD COLUMNS FOR SCORING METADATA (Section 4)
-- =====================================================

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_version INTEGER DEFAULT 1;

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to get next mystery shopper prospect
CREATE OR REPLACE FUNCTION get_next_mystery_shopper_prospect()
RETURNS UUID AS $$
DECLARE
    next_id UUID;
BEGIN
    SELECT prospect_id INTO next_id
    FROM mystery_shopper_queue
    WHERE status = 'pending'
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    RETURN next_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update scraper health
CREATE OR REPLACE FUNCTION update_scraper_health(
    p_scraper_id TEXT,
    p_success BOOLEAN,
    p_properties_found INTEGER DEFAULT 0,
    p_duration_ms INTEGER DEFAULT 0,
    p_error TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO scraper_health (scraper_id, total_runs, successful_runs, failed_runs, consecutive_failures, is_healthy, last_run_at, last_success_at, last_failure_at, last_error, avg_properties_per_run, avg_duration_ms)
    VALUES (p_scraper_id, 1,
            CASE WHEN p_success THEN 1 ELSE 0 END,
            CASE WHEN p_success THEN 0 ELSE 1 END,
            CASE WHEN p_success THEN 0 ELSE 1 END,
            p_success,
            NOW(),
            CASE WHEN p_success THEN NOW() ELSE NULL END,
            CASE WHEN NOT p_success THEN NOW() ELSE NULL END,
            p_error,
            p_properties_found,
            p_duration_ms)
    ON CONFLICT (scraper_id) DO UPDATE SET
        total_runs = scraper_health.total_runs + 1,
        successful_runs = scraper_health.successful_runs + CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_runs = scraper_health.failed_runs + CASE WHEN p_success THEN 0 ELSE 1 END,
        consecutive_failures = CASE WHEN p_success THEN 0 ELSE scraper_health.consecutive_failures + 1 END,
        is_healthy = CASE WHEN p_success THEN true
                          WHEN scraper_health.consecutive_failures >= 2 THEN false
                          ELSE scraper_health.is_healthy END,
        flagged_at = CASE WHEN NOT p_success AND scraper_health.consecutive_failures >= 2 THEN NOW() ELSE scraper_health.flagged_at END,
        last_run_at = NOW(),
        last_success_at = CASE WHEN p_success THEN NOW() ELSE scraper_health.last_success_at END,
        last_failure_at = CASE WHEN NOT p_success THEN NOW() ELSE scraper_health.last_failure_at END,
        last_error = CASE WHEN NOT p_success THEN p_error ELSE scraper_health.last_error END,
        avg_properties_per_run = (scraper_health.avg_properties_per_run * scraper_health.total_runs + p_properties_found) / (scraper_health.total_runs + 1),
        avg_duration_ms = (scraper_health.avg_duration_ms * scraper_health.total_runs + p_duration_ms) / (scraper_health.total_runs + 1),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. VIEWS FOR MONITORING
-- =====================================================

-- View: Unhealthy scrapers
CREATE OR REPLACE VIEW unhealthy_scrapers AS
SELECT
    scraper_id,
    consecutive_failures,
    last_failure_at,
    last_error,
    flagged_at
FROM scraper_health
WHERE is_healthy = false
ORDER BY consecutive_failures DESC;

-- View: Prospects needing mystery shopper
CREATE OR REPLACE VIEW prospects_needing_mystery_shopper AS
SELECT
    p.id,
    p.name,
    p.city,
    p.email,
    p.website,
    p.score,
    p.tier,
    p.created_at
FROM prospects p
LEFT JOIN mystery_shopper_queue msq ON p.id = msq.prospect_id AND msq.status NOT IN ('completed', 'failed')
WHERE p.archived = false
  AND 'needs-contact-discovery' = ANY(p.tags)
  AND msq.id IS NULL
ORDER BY p.score DESC;
