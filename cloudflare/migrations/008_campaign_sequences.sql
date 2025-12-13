-- Campaign Sequences - Multi-step email sequences with A/B testing
-- Each campaign can have multiple steps with different delays

CREATE TABLE IF NOT EXISTS campaign_sequences (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,

  -- Timing
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,

  -- A/B Testing (variant A is default)
  variant_a_subject TEXT NOT NULL,
  variant_a_body TEXT NOT NULL,
  variant_b_subject TEXT,
  variant_b_body TEXT,
  variant_split INTEGER DEFAULT 50, -- % to variant A

  -- Metrics per step
  sent_count INTEGER DEFAULT 0,
  variant_a_sent INTEGER DEFAULT 0,
  variant_b_sent INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(campaign_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_campaign_sequences_campaign ON campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_step ON campaign_sequences(campaign_id, step_number);

-- Campaign Leads - Assign prospects to campaigns
-- Tracks progress through sequence steps

CREATE TABLE IF NOT EXISTS campaign_leads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  mailbox_id TEXT, -- Which mailbox to send from

  -- Progress
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed')),

  -- A/B tracking - which variant they're getting
  assigned_variant TEXT DEFAULT 'a' CHECK (assigned_variant IN ('a', 'b')),

  -- Timestamps
  last_email_at TEXT,
  next_email_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(campaign_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_prospect ON campaign_leads(prospect_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next ON campaign_leads(status, next_email_at);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_mailbox ON campaign_leads(mailbox_id);

-- Add new columns to campaigns table for sequence support
-- ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_count INTEGER DEFAULT 1;
-- ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
-- ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_testing_enabled INTEGER DEFAULT 0;
-- Note: D1 doesn't support IF NOT EXISTS for ALTER TABLE, so these need to be added manually if table was created before

-- Note: Run 009_campaigns_update.sql next to add sequence columns to campaigns table
