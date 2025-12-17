-- =====================================================
-- FIX: Create missing campaign tables
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create campaign_sequences table
CREATE TABLE IF NOT EXISTS campaign_sequences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

    -- Step Configuration
    step_number INTEGER NOT NULL,
    delay_days INTEGER DEFAULT 0,
    delay_hours INTEGER DEFAULT 0,

    -- Email Content (A/B testing)
    variant_a_subject TEXT NOT NULL,
    variant_a_body TEXT NOT NULL,
    variant_b_subject TEXT,
    variant_b_body TEXT,
    variant_split INTEGER DEFAULT 50 CHECK (variant_split >= 0 AND variant_split <= 100),

    -- AI Generation Settings
    use_ai_generation BOOLEAN DEFAULT false,
    ai_prompt_context TEXT,

    -- Step Metrics
    sent_count INTEGER DEFAULT 0,
    variant_a_sent INTEGER DEFAULT 0,
    variant_b_sent INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    variant_a_opens INTEGER DEFAULT 0,
    variant_b_opens INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    variant_a_replies INTEGER DEFAULT 0,
    variant_b_replies INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_sequences_campaign ON campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sequences_step ON campaign_sequences(campaign_id, step_number);

-- Enable RLS
ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_sequences" ON campaign_sequences FOR ALL USING (true);

-- 2. Create campaign_leads table
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,

    -- Progress Tracking
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN (
        'active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed'
    )),

    -- A/B Assignment
    assigned_variant TEXT CHECK (assigned_variant IN ('A', 'B')),

    -- Timing
    last_email_at TIMESTAMPTZ,
    next_email_at TIMESTAMPTZ,

    -- Result Tracking
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    has_replied BOOLEAN DEFAULT false,
    replied_at TIMESTAMPTZ,

    -- Metadata
    added_by TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_prospect ON campaign_leads(prospect_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_email ON campaign_leads(next_email_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaign_leads_mailbox ON campaign_leads(mailbox_id);

-- Enable RLS
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_leads" ON campaign_leads FOR ALL USING (true);

-- 3. Update campaigns table with missing columns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy' CHECK (type IN ('legacy', 'sequence'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_count INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS active_leads INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_leads INTEGER DEFAULT 0;

-- Done!
SELECT 'Tables created successfully!' as status;
