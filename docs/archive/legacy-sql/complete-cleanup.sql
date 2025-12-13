-- =====================================================
-- COMPLETE SUPABASE CLEANUP & IMPROVEMENTS
-- Run this in Supabase SQL Editor
-- This is a comprehensive migration that:
-- 1. Cleans up all duplicate data
-- 2. Adds missing columns
-- 3. Creates unique constraints to prevent future duplicates
-- 4. Adds new tables for features
-- 5. Creates helper functions and views
-- =====================================================

-- =====================================================
-- PART 1: CLEANUP DUPLICATE PROSPECTS
-- =====================================================

-- Delete duplicate prospects, keeping the one with highest score
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
-- PART 2: ADD MISSING COLUMNS TO PROSPECTS
-- =====================================================

-- Archive support
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Lead source attribution
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS lead_source TEXT; -- 'job_posting', 'google_maps', 'manual', 'referral', 'import'

-- Scoring metadata
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS score_version INTEGER DEFAULT 1;

-- Email campaign tracking
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS campaign_strategy TEXT, -- 'authority_scarcity', 'curiosity_value'
  ADD COLUMN IF NOT EXISTS emails_sent_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;

-- =====================================================
-- PART 3: ADD MISSING COLUMNS TO EMAILS TABLE
-- =====================================================

-- Direction and type for proper tracking
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound', -- 'outbound', 'inbound'
  ADD COLUMN IF NOT EXISTS email_type TEXT DEFAULT 'outreach', -- 'outreach', 'follow_up_1', 'follow_up_2', 'reply', 'auto_reply'
  ADD COLUMN IF NOT EXISTS to_email TEXT,
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS campaign_strategy TEXT, -- 'authority_scarcity', 'curiosity_value'
  ADD COLUMN IF NOT EXISTS message_id TEXT, -- For threading
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT, -- For threading
  ADD COLUMN IF NOT EXISTS thread_id TEXT; -- Group related emails

-- =====================================================
-- PART 4: UNIQUE CONSTRAINTS (PREVENT DUPLICATES)
-- =====================================================

-- 4.1 Prospects: One entry per hotel+city
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_dedupe
  ON prospects (LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, ''))));

-- 4.2 Emails: Prevent duplicate outreach to same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_no_duplicate_outreach
  ON emails (prospect_id, LOWER(to_email), email_type)
  WHERE direction = 'outbound' AND email_type = 'outreach';

-- 4.3 Emails: Prevent duplicate follow-ups
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_no_duplicate_followup
  ON emails (prospect_id, email_type)
  WHERE direction = 'outbound' AND email_type LIKE 'follow_up%';

-- =====================================================
-- PART 5: PERFORMANCE INDEXES
-- =====================================================

-- Prospects indexes
CREATE INDEX IF NOT EXISTS idx_prospects_archived ON prospects (archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_prospects_tags ON prospects USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_last_contacted ON prospects (last_contacted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospects_next_followup ON prospects (next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_campaign ON prospects (campaign_strategy) WHERE campaign_strategy IS NOT NULL;

-- Emails indexes
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails (direction);
CREATE INDEX IF NOT EXISTS idx_emails_type ON emails (email_type);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails (scheduled_for) WHERE status = 'scheduled';

-- Activities indexes
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities (type);

-- =====================================================
-- PART 6: NEW TABLES
-- =====================================================

-- 6.1 Mystery Shopper Queue
CREATE TABLE IF NOT EXISTS mystery_shopper_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,

    -- Queue status
    status TEXT DEFAULT 'pending', -- 'pending', 'assigned', 'sent', 'replied', 'completed', 'failed'
    priority INTEGER DEFAULT 5, -- 1-10, lower = higher priority

    -- Assignment
    assigned_to TEXT,
    assigned_at TIMESTAMPTZ,

    -- Tracking
    email_sent_at TIMESTAMPTZ,
    reply_received_at TIMESTAMPTZ,
    response_time_minutes INTEGER,

    -- Results
    gm_name_found TEXT,
    gm_email_found TEXT,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Unique: one active queue entry per prospect
CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_queue_prospect
  ON mystery_shopper_queue (prospect_id) WHERE status NOT IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_mystery_queue_status ON mystery_shopper_queue (status, priority);
CREATE INDEX IF NOT EXISTS idx_mystery_queue_created ON mystery_shopper_queue (created_at DESC);

ALTER TABLE mystery_shopper_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on mystery_shopper_queue" ON mystery_shopper_queue;
CREATE POLICY "Allow all on mystery_shopper_queue" ON mystery_shopper_queue FOR ALL USING (true);

CREATE OR REPLACE TRIGGER mystery_shopper_queue_updated_at
    BEFORE UPDATE ON mystery_shopper_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 6.2 Scraper Health Tracking
CREATE TABLE IF NOT EXISTS scraper_health (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    scraper_id TEXT NOT NULL UNIQUE,

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

ALTER TABLE scraper_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on scraper_health" ON scraper_health;
CREATE POLICY "Allow all on scraper_health" ON scraper_health FOR ALL USING (true);

CREATE OR REPLACE TRIGGER scraper_health_updated_at
    BEFORE UPDATE ON scraper_health
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 6.3 Email Send Log (for deliverability tracking)
CREATE TABLE IF NOT EXISTS email_send_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,

    -- Send details
    from_inbox TEXT NOT NULL,
    to_email TEXT NOT NULL,

    -- Status
    status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'bounced', 'failed'
    bounce_type TEXT, -- 'hard', 'soft', 'complaint'
    bounce_reason TEXT,

    -- SMTP response
    smtp_code TEXT,
    smtp_message TEXT,
    message_id TEXT,

    -- Timing
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_log_email ON email_send_log (email_id);
CREATE INDEX IF NOT EXISTS idx_send_log_to ON email_send_log (LOWER(to_email));
CREATE INDEX IF NOT EXISTS idx_send_log_status ON email_send_log (status);
CREATE INDEX IF NOT EXISTS idx_send_log_bounce ON email_send_log (bounce_type) WHERE bounce_type IS NOT NULL;

ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on email_send_log" ON email_send_log;
CREATE POLICY "Allow all on email_send_log" ON email_send_log FOR ALL USING (true);

-- 6.4 Domain Reputation Tracking
CREATE TABLE IF NOT EXISTS domain_reputation (
    domain TEXT PRIMARY KEY,

    -- Send stats
    total_sent INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_complaints INTEGER DEFAULT 0,

    -- Bounce rate
    bounce_rate DECIMAL(5,2) DEFAULT 0,

    -- Status
    is_blacklisted BOOLEAN DEFAULT false,
    blacklisted_at TIMESTAMPTZ,
    blacklist_reason TEXT,

    -- Timestamps
    first_sent_at TIMESTAMPTZ DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE domain_reputation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on domain_reputation" ON domain_reputation;
CREATE POLICY "Allow all on domain_reputation" ON domain_reputation FOR ALL USING (true);

-- =====================================================
-- PART 7: HELPER FUNCTIONS
-- =====================================================

-- 7.1 Update scraper health (called after each scrape run)
CREATE OR REPLACE FUNCTION update_scraper_health(
    p_scraper_id TEXT,
    p_success BOOLEAN,
    p_properties_found INTEGER DEFAULT 0,
    p_duration_ms INTEGER DEFAULT 0,
    p_error TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO scraper_health (
        scraper_id, total_runs, successful_runs, failed_runs,
        consecutive_failures, is_healthy, last_run_at,
        last_success_at, last_failure_at, last_error,
        avg_properties_per_run, avg_duration_ms
    )
    VALUES (
        p_scraper_id, 1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        p_success,
        NOW(),
        CASE WHEN p_success THEN NOW() ELSE NULL END,
        CASE WHEN NOT p_success THEN NOW() ELSE NULL END,
        p_error,
        p_properties_found,
        p_duration_ms
    )
    ON CONFLICT (scraper_id) DO UPDATE SET
        total_runs = scraper_health.total_runs + 1,
        successful_runs = scraper_health.successful_runs + CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_runs = scraper_health.failed_runs + CASE WHEN p_success THEN 0 ELSE 1 END,
        consecutive_failures = CASE WHEN p_success THEN 0 ELSE scraper_health.consecutive_failures + 1 END,
        is_healthy = CASE
            WHEN p_success THEN true
            WHEN scraper_health.consecutive_failures >= 2 THEN false
            ELSE scraper_health.is_healthy
        END,
        flagged_at = CASE
            WHEN NOT p_success AND scraper_health.consecutive_failures >= 2 THEN NOW()
            ELSE scraper_health.flagged_at
        END,
        last_run_at = NOW(),
        last_success_at = CASE WHEN p_success THEN NOW() ELSE scraper_health.last_success_at END,
        last_failure_at = CASE WHEN NOT p_success THEN NOW() ELSE scraper_health.last_failure_at END,
        last_error = CASE WHEN NOT p_success THEN p_error ELSE scraper_health.last_error END,
        avg_properties_per_run = (scraper_health.avg_properties_per_run * scraper_health.total_runs + p_properties_found) / (scraper_health.total_runs + 1),
        avg_duration_ms = (scraper_health.avg_duration_ms * scraper_health.total_runs + p_duration_ms) / (scraper_health.total_runs + 1),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 7.2 Check if email has hard bounced (use before sending)
CREATE OR REPLACE FUNCTION has_hard_bounce(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM email_send_log
        WHERE LOWER(to_email) = LOWER(check_email)
        AND bounce_type = 'hard'
    );
END;
$$ LANGUAGE plpgsql;

-- 7.3 Check if domain is blacklisted
CREATE OR REPLACE FUNCTION is_domain_blacklisted(check_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    email_domain TEXT;
BEGIN
    email_domain := LOWER(SPLIT_PART(check_email, '@', 2));
    RETURN EXISTS (
        SELECT 1 FROM domain_reputation
        WHERE domain = email_domain
        AND is_blacklisted = true
    );
END;
$$ LANGUAGE plpgsql;

-- 7.4 Update domain reputation after send
CREATE OR REPLACE FUNCTION update_domain_reputation(
    p_email TEXT,
    p_bounced BOOLEAN DEFAULT false,
    p_complaint BOOLEAN DEFAULT false
)
RETURNS void AS $$
DECLARE
    email_domain TEXT;
BEGIN
    email_domain := LOWER(SPLIT_PART(p_email, '@', 2));

    INSERT INTO domain_reputation (domain, total_sent, total_bounced, total_complaints, last_sent_at)
    VALUES (email_domain, 1,
            CASE WHEN p_bounced THEN 1 ELSE 0 END,
            CASE WHEN p_complaint THEN 1 ELSE 0 END,
            NOW())
    ON CONFLICT (domain) DO UPDATE SET
        total_sent = domain_reputation.total_sent + 1,
        total_bounced = domain_reputation.total_bounced + CASE WHEN p_bounced THEN 1 ELSE 0 END,
        total_complaints = domain_reputation.total_complaints + CASE WHEN p_complaint THEN 1 ELSE 0 END,
        bounce_rate = (domain_reputation.total_bounced + CASE WHEN p_bounced THEN 1 ELSE 0 END)::DECIMAL /
                      (domain_reputation.total_sent + 1)::DECIMAL * 100,
        -- Auto-blacklist if bounce rate > 30% with at least 5 sends
        is_blacklisted = CASE
            WHEN domain_reputation.total_sent >= 4 AND
                 ((domain_reputation.total_bounced + CASE WHEN p_bounced THEN 1 ELSE 0 END)::DECIMAL /
                  (domain_reputation.total_sent + 1)::DECIMAL * 100) > 30
            THEN true
            ELSE domain_reputation.is_blacklisted
        END,
        blacklisted_at = CASE
            WHEN NOT domain_reputation.is_blacklisted AND
                 domain_reputation.total_sent >= 4 AND
                 ((domain_reputation.total_bounced + CASE WHEN p_bounced THEN 1 ELSE 0 END)::DECIMAL /
                  (domain_reputation.total_sent + 1)::DECIMAL * 100) > 30
            THEN NOW()
            ELSE domain_reputation.blacklisted_at
        END,
        blacklist_reason = CASE
            WHEN NOT domain_reputation.is_blacklisted AND
                 domain_reputation.total_sent >= 4 AND
                 ((domain_reputation.total_bounced + CASE WHEN p_bounced THEN 1 ELSE 0 END)::DECIMAL /
                  (domain_reputation.total_sent + 1)::DECIMAL * 100) > 30
            THEN 'Auto-blacklisted: bounce rate exceeded 30%'
            ELSE domain_reputation.blacklist_reason
        END,
        last_sent_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 7.5 Get next mystery shopper prospect
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

-- 7.6 Check if prospect can receive email (no bounce, no blacklist)
CREATE OR REPLACE FUNCTION can_send_to_prospect(p_prospect_id UUID)
RETURNS TABLE (
    can_send BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    prospect_email TEXT;
BEGIN
    SELECT email INTO prospect_email FROM prospects WHERE id = p_prospect_id;

    IF prospect_email IS NULL THEN
        RETURN QUERY SELECT false, 'No email address';
        RETURN;
    END IF;

    IF has_hard_bounce(prospect_email) THEN
        RETURN QUERY SELECT false, 'Email has hard bounced';
        RETURN;
    END IF;

    IF is_domain_blacklisted(prospect_email) THEN
        RETURN QUERY SELECT false, 'Domain is blacklisted';
        RETURN;
    END IF;

    RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 8: MONITORING VIEWS
-- =====================================================

-- 8.1 Unhealthy scrapers
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

-- 8.2 Prospects needing mystery shopper
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

-- 8.3 Email deliverability by day
CREATE OR REPLACE VIEW email_deliverability_daily AS
SELECT
    DATE_TRUNC('day', sent_at)::DATE as date,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
    COUNT(*) FILTER (WHERE bounce_type = 'hard') as hard_bounces,
    COUNT(*) FILTER (WHERE bounce_type = 'soft') as soft_bounces,
    ROUND(COUNT(*) FILTER (WHERE status = 'bounced')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as bounce_rate
FROM email_send_log
WHERE sent_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', sent_at)
ORDER BY date DESC;

-- 8.4 Campaign performance (A/B testing)
CREATE OR REPLACE VIEW campaign_performance AS
SELECT
    campaign_strategy,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE status = 'opened') as opened,
    COUNT(*) FILTER (WHERE status = 'replied') as replied,
    ROUND(COUNT(*) FILTER (WHERE status = 'opened')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as open_rate,
    ROUND(COUNT(*) FILTER (WHERE status = 'replied')::DECIMAL / NULLIF(COUNT(*), 0) * 100, 2) as reply_rate
FROM emails
WHERE direction = 'outbound'
  AND email_type = 'outreach'
  AND campaign_strategy IS NOT NULL
  AND sent_at > NOW() - INTERVAL '30 days'
GROUP BY campaign_strategy
ORDER BY reply_rate DESC;

-- 8.5 Blacklisted domains
CREATE OR REPLACE VIEW blacklisted_domains AS
SELECT
    domain,
    total_sent,
    total_bounced,
    bounce_rate,
    blacklisted_at,
    blacklist_reason
FROM domain_reputation
WHERE is_blacklisted = true
ORDER BY blacklisted_at DESC;

-- 8.6 Pipeline summary
CREATE OR REPLACE VIEW pipeline_summary AS
SELECT
    stage,
    tier,
    COUNT(*) as count,
    AVG(score) as avg_score,
    COUNT(*) FILTER (WHERE last_contacted_at > NOW() - INTERVAL '7 days') as contacted_this_week
FROM prospects
WHERE archived = false
GROUP BY stage, tier
ORDER BY
    CASE stage
        WHEN 'new' THEN 1
        WHEN 'researching' THEN 2
        WHEN 'outreach' THEN 3
        WHEN 'engaged' THEN 4
        WHEN 'meeting' THEN 5
        WHEN 'proposal' THEN 6
        WHEN 'won' THEN 7
        WHEN 'lost' THEN 8
    END,
    CASE tier WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'cold' THEN 3 END;

-- =====================================================
-- PART 9: DATA CLEANUP
-- =====================================================

-- Set lead_source for existing records based on source
UPDATE prospects
SET lead_source = 'job_posting'
WHERE lead_source IS NULL
  AND source IN ('hosco', 'hcareers', 'hotelcareer', 'indeed', 'caterer', 'journaldespalaces', 'talentshotels', 'hospitalityonline', 'hoteljobs', 'ehotelier', 'adzuna');

UPDATE prospects
SET lead_source = 'manual'
WHERE lead_source IS NULL;

-- Clean up any NULL tags
UPDATE prospects SET tags = '{}' WHERE tags IS NULL;

-- Set default archived = false for existing records
UPDATE prospects SET archived = false WHERE archived IS NULL;

-- =====================================================
-- DONE! Summary of what was created:
-- =====================================================
-- CLEANED: Duplicate prospects removed
-- COLUMNS: archived, lead_source, campaign_strategy, etc.
-- CONSTRAINTS: Unique indexes on prospects, emails
-- INDEXES: Performance indexes on all tables
-- TABLES: mystery_shopper_queue, scraper_health, email_send_log, domain_reputation
-- FUNCTIONS: update_scraper_health, has_hard_bounce, is_domain_blacklisted, can_send_to_prospect, etc.
-- VIEWS: unhealthy_scrapers, pipeline_summary, email_deliverability_daily, campaign_performance, etc.
-- =====================================================
