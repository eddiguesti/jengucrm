-- =====================================================
-- CAMPAIGNS TABLE (A/B Testing Different Strategies)
-- =====================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Campaign Identity
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    strategy_key TEXT NOT NULL UNIQUE, -- 'direct_authority', 'cheeky_ai_reveal'

    -- Status
    active BOOLEAN DEFAULT true,

    -- Scheduling
    send_days TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    send_time_start INTEGER DEFAULT 9, -- Hour in UTC (9 = 9am)
    send_time_end INTEGER DEFAULT 17, -- Hour in UTC (17 = 5pm)
    daily_limit INTEGER DEFAULT 20, -- Max emails per day for this campaign

    -- Metrics (auto-updated)
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    replies_received INTEGER DEFAULT 0,
    meetings_booked INTEGER DEFAULT 0,

    -- Calculated Rates (updated via trigger or app)
    open_rate DECIMAL(5,2) DEFAULT 0,
    reply_rate DECIMAL(5,2) DEFAULT 0,
    meeting_rate DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add campaign_id to emails table
ALTER TABLE emails ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS email_type TEXT; -- 'outreach', 'reply', 'follow_up'
ALTER TABLE emails ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound'; -- 'outbound', 'inbound'
ALTER TABLE emails ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id TEXT; -- For threading

-- Index for campaign metrics queries
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(active);

-- Trigger for campaign updated_at
CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true);

-- =====================================================
-- INSERT DEFAULT CAMPAIGNS
-- =====================================================
INSERT INTO campaigns (name, description, strategy_key, active, daily_limit) VALUES
    (
        'Direct & Confident',
        'Short (70-90 words), punchy, authority-first. Uses 3Ps (Praise-Picture-Push). Loss aversion. Ends with "Worth 15 mins?"',
        'authority_scarcity',
        true,
        20
    ),
    (
        'Curious & Generous',
        'Longer (100-120 words), story-driven. Value-first with free process map offer. Ends with "What do you think?" (foot-in-door)',
        'curiosity_value',
        true,
        20
    )
ON CONFLICT (strategy_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;
