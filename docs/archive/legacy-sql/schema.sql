-- Luxury Hospitality Prospecting CRM Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROSPECTS TABLE (Main leads table)
-- =====================================================
CREATE TABLE IF NOT EXISTS prospects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Basic Info
    name TEXT NOT NULL,
    property_type TEXT, -- 'hotel', 'resort', 'restaurant', 'spa', 'cruise'

    -- Location
    city TEXT,
    country TEXT,
    region TEXT, -- 'EMEA', 'APAC', 'Americas'
    full_address TEXT,

    -- Contact
    website TEXT,
    email TEXT,
    phone TEXT,
    contact_name TEXT,
    contact_title TEXT,

    -- Enrichment Data (Google Places)
    google_place_id TEXT,
    google_rating DECIMAL(2,1),
    google_review_count INTEGER,
    google_price_level INTEGER, -- 1-4
    google_photos JSONB, -- Array of photo URLs

    -- Social Media
    linkedin_url TEXT,
    instagram_handle TEXT,

    -- Classification
    star_rating INTEGER, -- 1-5 stars
    chain_affiliation TEXT, -- 'independent', 'Marriott', 'Hilton', etc.
    estimated_rooms INTEGER,

    -- Scoring
    score INTEGER DEFAULT 0,
    score_breakdown JSONB,
    tier TEXT DEFAULT 'cold', -- 'hot', 'warm', 'cold'

    -- Pipeline
    stage TEXT DEFAULT 'new', -- 'new', 'researching', 'outreach', 'engaged', 'meeting', 'proposal', 'won', 'lost'

    -- Source Tracking
    source TEXT, -- 'hosco', 'caterer', 'linkedin', 'manual', 'referral'
    source_url TEXT,
    source_job_title TEXT, -- If from job board
    source_job_description TEXT, -- Full job description text
    job_pain_points JSONB, -- AI-extracted pain points from job description

    -- Activity
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,

    -- Notes
    notes TEXT,
    tags TEXT[], -- Array of tags

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMAILS TABLE (Generated and sent emails)
-- =====================================================
CREATE TABLE IF NOT EXISTS emails (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,

    -- Email Content
    subject TEXT NOT NULL,
    body TEXT NOT NULL,

    -- Metadata
    template_id UUID,
    personalization_notes TEXT,
    tone TEXT DEFAULT 'professional', -- 'professional', 'friendly', 'casual'

    -- Status
    status TEXT DEFAULT 'draft', -- 'draft', 'approved', 'scheduled', 'sent', 'opened', 'replied', 'bounced'

    -- Tracking
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,

    -- Sequence
    sequence_number INTEGER DEFAULT 1, -- 1 = initial, 2+ = follow-ups

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ACTIVITIES TABLE (All interactions log)
-- =====================================================
CREATE TABLE IF NOT EXISTS activities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,

    -- Activity Info
    type TEXT NOT NULL, -- 'email_sent', 'email_opened', 'call', 'meeting', 'note', 'stage_change', 'linkedin_message'
    title TEXT NOT NULL,
    description TEXT,

    -- Related Data
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    metadata JSONB, -- Flexible storage for activity-specific data

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SCRAPE RUNS TABLE (Scraping job logs)
-- =====================================================
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    source TEXT NOT NULL, -- 'hosco', 'caterer', etc.

    -- Config
    locations JSONB,
    job_titles JSONB,

    -- Results
    total_found INTEGER DEFAULT 0,
    new_prospects INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    error_log JSONB,

    -- Status
    status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- =====================================================
-- EMAIL TEMPLATES TABLE (For A/B testing)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    name TEXT NOT NULL,
    description TEXT,

    -- Template Content
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,

    -- Classification
    category TEXT, -- 'initial_outreach', 'follow_up', 'meeting_request', 'value_prop'
    tone TEXT DEFAULT 'professional',

    -- Performance
    times_used INTEGER DEFAULT 0,
    open_rate DECIMAL(5,2),
    reply_rate DECIMAL(5,2),

    -- Status
    active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SETTINGS TABLE (App configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects(tier);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_city ON prospects(city);
CREATE INDEX IF NOT EXISTS idx_prospects_source ON prospects(source);
CREATE INDEX IF NOT EXISTS idx_prospects_created ON prospects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_sent ON emails(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_prospect ON activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prospects_updated_at
    BEFORE UPDATE ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (single user)
CREATE POLICY "Allow all on prospects" ON prospects FOR ALL USING (true);
CREATE POLICY "Allow all on emails" ON emails FOR ALL USING (true);
CREATE POLICY "Allow all on activities" ON activities FOR ALL USING (true);
CREATE POLICY "Allow all on scrape_runs" ON scrape_runs FOR ALL USING (true);
CREATE POLICY "Allow all on email_templates" ON email_templates FOR ALL USING (true);
CREATE POLICY "Allow all on settings" ON settings FOR ALL USING (true);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('scoring_weights', '{
        "has_google_rating": 10,
        "rating_above_4": 15,
        "rating_above_4_5": 10,
        "review_count_50_plus": 10,
        "review_count_100_plus": 10,
        "review_count_500_plus": 10,
        "has_email": 20,
        "has_website": 10,
        "has_phone": 5,
        "senior_role": 15,
        "growth_role": 10,
        "premium_market": 15,
        "luxury_property": 20
    }'::jsonb),
    ('scrape_locations', '["London, UK", "Paris, France", "Dubai, UAE", "New York, USA", "Miami, USA", "Barcelona, Spain", "Rome, Italy", "Singapore", "Hong Kong", "Maldives"]'::jsonb),
    ('scrape_job_titles', '["General Manager", "Hotel Manager", "Director of Operations", "F&B Manager", "Revenue Manager", "Marketing Director"]'::jsonb),
    ('tier_thresholds', '{"hot": 70, "warm": 40}'::jsonb)
ON CONFLICT (key) DO NOTHING;
