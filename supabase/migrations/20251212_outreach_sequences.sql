-- =====================================================
-- CAMPAIGN SEQUENCES (Multi-step email sequences)
-- =====================================================
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

CREATE TRIGGER campaign_sequences_updated_at
    BEFORE UPDATE ON campaign_sequences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_sequences" ON campaign_sequences FOR ALL USING (true);

-- =====================================================
-- CAMPAIGN LEADS (Lead assignment and progress tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,

    -- Progress Tracking
    current_step INTEGER DEFAULT 0, -- 0 = not started, 1+ = step number
    status TEXT DEFAULT 'active' CHECK (status IN (
        'active',      -- Actively in sequence
        'paused',      -- Manually paused
        'completed',   -- Finished all steps
        'replied',     -- Got a reply, stopped
        'bounced',     -- Email bounced
        'unsubscribed' -- Opted out
    )),

    -- A/B Assignment (locked when first email sent)
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
    added_by TEXT, -- 'manual', 'import', 'automation'
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

CREATE TRIGGER campaign_leads_updated_at
    BEFORE UPDATE ON campaign_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_leads" ON campaign_leads FOR ALL USING (true);

-- =====================================================
-- UPDATE CAMPAIGNS TABLE (Add sequence-related columns)
-- =====================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy' CHECK (type IN ('legacy', 'sequence'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_count INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS active_leads INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_leads INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_testing_enabled BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS default_mailbox_id UUID REFERENCES mailboxes(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- =====================================================
-- FUNCTION: Update campaign lead counts
-- =====================================================
CREATE OR REPLACE FUNCTION update_campaign_lead_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the campaign's lead counts
    UPDATE campaigns
    SET
        leads_count = (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)),
        active_leads = (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status = 'active'),
        completed_leads = (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id) AND status IN ('completed', 'replied'))
    WHERE id = COALESCE(NEW.campaign_id, OLD.campaign_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_leads_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON campaign_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_campaign_lead_counts();

-- =====================================================
-- FUNCTION: Schedule next email for lead
-- =====================================================
CREATE OR REPLACE FUNCTION schedule_next_email(lead_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    lead_record RECORD;
    next_step RECORD;
    next_time TIMESTAMPTZ;
BEGIN
    -- Get the lead
    SELECT * INTO lead_record FROM campaign_leads WHERE id = lead_id;

    IF lead_record IS NULL OR lead_record.status != 'active' THEN
        RETURN NULL;
    END IF;

    -- Get the next step
    SELECT * INTO next_step
    FROM campaign_sequences
    WHERE campaign_id = lead_record.campaign_id
      AND step_number = lead_record.current_step + 1
    ORDER BY step_number
    LIMIT 1;

    IF next_step IS NULL THEN
        -- No more steps, mark as completed
        UPDATE campaign_leads
        SET status = 'completed', next_email_at = NULL
        WHERE id = lead_id;
        RETURN NULL;
    END IF;

    -- Calculate next send time
    next_time := COALESCE(lead_record.last_email_at, NOW())
                 + (next_step.delay_days || ' days')::INTERVAL
                 + (next_step.delay_hours || ' hours')::INTERVAL;

    -- Update the lead
    UPDATE campaign_leads
    SET next_email_at = next_time
    WHERE id = lead_id;

    RETURN next_time;
END;
$$ LANGUAGE plpgsql;
