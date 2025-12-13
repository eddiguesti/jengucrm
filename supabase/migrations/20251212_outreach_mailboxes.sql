-- =====================================================
-- MAILBOXES TABLE (SmartLead-style email account management)
-- =====================================================
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Identity
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,

    -- SMTP Configuration
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER DEFAULT 465,
    smtp_user TEXT NOT NULL,
    smtp_pass TEXT NOT NULL,  -- Store encrypted in production
    smtp_secure BOOLEAN DEFAULT true,

    -- IMAP Configuration (for reply detection)
    imap_host TEXT,
    imap_port INTEGER DEFAULT 993,
    imap_user TEXT,
    imap_pass TEXT,
    imap_secure BOOLEAN DEFAULT true,

    -- Warmup Configuration
    warmup_enabled BOOLEAN DEFAULT true,
    warmup_start_date DATE DEFAULT CURRENT_DATE,
    warmup_stage INTEGER DEFAULT 1, -- 1-5 (weeks)
    warmup_target_per_day INTEGER DEFAULT 40, -- Target after warmup complete

    -- Current Limits (calculated from warmup stage)
    daily_limit INTEGER DEFAULT 5,

    -- Daily Counters (reset at midnight)
    sent_today INTEGER DEFAULT 0,
    bounces_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,

    -- Lifetime Stats
    total_sent INTEGER DEFAULT 0,
    total_bounces INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    total_opens INTEGER DEFAULT 0,

    -- Health Monitoring
    health_score INTEGER DEFAULT 100, -- 0-100, starts at 100
    bounce_rate DECIMAL(5,2) DEFAULT 0,
    reply_rate DECIMAL(5,2) DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'warming' CHECK (status IN ('active', 'warming', 'paused', 'error')),
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,

    -- Connection Status
    smtp_verified BOOLEAN DEFAULT false,
    smtp_verified_at TIMESTAMPTZ,
    imap_verified BOOLEAN DEFAULT false,
    imap_verified_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status);
CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(email);
CREATE INDEX IF NOT EXISTS idx_mailboxes_health ON mailboxes(health_score);

-- Trigger for updated_at
CREATE TRIGGER mailboxes_updated_at
    BEFORE UPDATE ON mailboxes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on mailboxes" ON mailboxes FOR ALL USING (true);

-- =====================================================
-- MAILBOX DAILY STATS (Historical tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS mailbox_daily_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Counts
    sent INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    opens INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,

    -- Calculated
    bounce_rate DECIMAL(5,2) DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0,
    reply_rate DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(mailbox_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_stats_date ON mailbox_daily_stats(mailbox_id, date DESC);

ALTER TABLE mailbox_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on mailbox_daily_stats" ON mailbox_daily_stats FOR ALL USING (true);

-- =====================================================
-- FUNCTION: Calculate warmup daily limit
-- =====================================================
CREATE OR REPLACE FUNCTION get_warmup_limit(warmup_stage INTEGER, target_per_day INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE warmup_stage
        WHEN 1 THEN 5
        WHEN 2 THEN 10
        WHEN 3 THEN 15
        WHEN 4 THEN 20
        WHEN 5 THEN LEAST(25, target_per_day)
        ELSE target_per_day
    END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Update mailbox health score
-- =====================================================
CREATE OR REPLACE FUNCTION update_mailbox_health()
RETURNS TRIGGER AS $$
DECLARE
    bounce_penalty INTEGER;
    new_health INTEGER;
BEGIN
    -- Calculate bounce penalty: -10 per bounce today
    bounce_penalty := NEW.bounces_today * 10;

    -- Calculate new health (minimum 0)
    new_health := GREATEST(0, 100 - bounce_penalty);

    -- Update the health score
    NEW.health_score := new_health;

    -- Auto-pause if health drops below 50
    IF new_health < 50 AND NEW.status = 'active' THEN
        NEW.status := 'paused';
        NEW.last_error := 'Auto-paused due to low health score';
        NEW.last_error_at := NOW();
    END IF;

    -- Calculate rates
    IF NEW.total_sent > 0 THEN
        NEW.bounce_rate := (NEW.total_bounces::DECIMAL / NEW.total_sent) * 100;
        NEW.open_rate := (NEW.total_opens::DECIMAL / NEW.total_sent) * 100;
        NEW.reply_rate := (NEW.total_replies::DECIMAL / NEW.total_sent) * 100;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mailbox_health_trigger
    BEFORE UPDATE ON mailboxes
    FOR EACH ROW
    WHEN (OLD.bounces_today IS DISTINCT FROM NEW.bounces_today
          OR OLD.total_sent IS DISTINCT FROM NEW.total_sent)
    EXECUTE FUNCTION update_mailbox_health();

-- =====================================================
-- FUNCTION: Reset daily counters
-- =====================================================
CREATE OR REPLACE FUNCTION reset_mailbox_daily_counters()
RETURNS void AS $$
BEGIN
    -- Archive yesterday's stats before reset
    INSERT INTO mailbox_daily_stats (mailbox_id, date, sent, bounces, opens, replies, bounce_rate, open_rate, reply_rate)
    SELECT
        id,
        last_reset_date,
        sent_today,
        bounces_today,
        COALESCE(total_opens - LAG(total_opens) OVER (PARTITION BY id ORDER BY last_reset_date), 0),
        COALESCE(total_replies - LAG(total_replies) OVER (PARTITION BY id ORDER BY last_reset_date), 0),
        CASE WHEN sent_today > 0 THEN (bounces_today::DECIMAL / sent_today) * 100 ELSE 0 END,
        0, -- Opens calculated separately
        0  -- Replies calculated separately
    FROM mailboxes
    WHERE last_reset_date < CURRENT_DATE
    ON CONFLICT (mailbox_id, date) DO UPDATE SET
        sent = EXCLUDED.sent,
        bounces = EXCLUDED.bounces;

    -- Reset counters and advance warmup stage if needed
    UPDATE mailboxes
    SET
        sent_today = 0,
        bounces_today = 0,
        last_reset_date = CURRENT_DATE,
        -- Advance warmup stage every 7 days
        warmup_stage = CASE
            WHEN warmup_enabled AND warmup_stage < 5
                 AND (CURRENT_DATE - warmup_start_date) >= (warmup_stage * 7)
            THEN warmup_stage + 1
            ELSE warmup_stage
        END,
        -- Update daily limit based on new warmup stage
        daily_limit = get_warmup_limit(
            CASE
                WHEN warmup_enabled AND warmup_stage < 5
                     AND (CURRENT_DATE - warmup_start_date) >= (warmup_stage * 7)
                THEN warmup_stage + 1
                ELSE warmup_stage
            END,
            warmup_target_per_day
        ),
        -- Recover health by 5 points per clean day
        health_score = LEAST(100, health_score + CASE WHEN bounces_today = 0 THEN 5 ELSE 0 END)
    WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Increment mailbox sent (atomic)
-- Called by Cloudflare Workers after sending an email
-- =====================================================
CREATE OR REPLACE FUNCTION increment_mailbox_sent(mailbox_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE mailboxes
    SET
        sent_today = sent_today + 1,
        total_sent = total_sent + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = mailbox_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Record mailbox bounce (atomic)
-- Called by Cloudflare Workers when a bounce is detected
-- =====================================================
CREATE OR REPLACE FUNCTION record_mailbox_bounce(mailbox_id UUID)
RETURNS void AS $$
DECLARE
    current_bounces INTEGER;
    current_sent INTEGER;
    bounce_pct DECIMAL;
BEGIN
    -- Increment bounce counters
    UPDATE mailboxes
    SET
        bounces_today = bounces_today + 1,
        total_bounces = total_bounces + 1,
        updated_at = NOW()
    WHERE id = mailbox_id
    RETURNING bounces_today, sent_today INTO current_bounces, current_sent;

    -- Check if bounce rate is too high
    IF current_sent >= 5 THEN
        bounce_pct := (current_bounces::DECIMAL / current_sent) * 100;
        IF bounce_pct > 5 THEN
            -- Auto-pause the mailbox
            UPDATE mailboxes
            SET
                status = 'paused',
                last_error = 'High bounce rate: ' || ROUND(bounce_pct, 1) || '%',
                last_error_at = NOW()
            WHERE id = mailbox_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;
