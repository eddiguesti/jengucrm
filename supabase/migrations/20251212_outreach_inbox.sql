-- =====================================================
-- INBOX ITEMS (Unified inbox for all replies)
-- =====================================================
CREATE TABLE IF NOT EXISTS inbox_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE CASCADE,
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

    -- Email Identifiers
    message_id TEXT UNIQUE,
    in_reply_to TEXT,
    thread_id TEXT,
    references_ids TEXT[], -- Array of message IDs in thread

    -- Sender/Recipient
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_email TEXT NOT NULL,
    to_name TEXT,

    -- Content
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    snippet TEXT, -- First 200 chars preview
    attachments JSONB DEFAULT '[]',

    -- Classification
    direction TEXT DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    email_type TEXT CHECK (email_type IN (
        'reply',          -- Reply from prospect
        'auto_reply',     -- Out of office, etc.
        'bounce',         -- Bounce notification
        'unsubscribe',    -- Opt-out request
        'meeting_request',-- Wants to schedule
        'positive',       -- Interested
        'negative',       -- Not interested
        'other'
    )),

    -- Status
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_spam BOOLEAN DEFAULT false,

    -- AI Analysis
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    intent TEXT, -- 'interested', 'not_interested', 'question', 'meeting_request', etc.
    ai_summary TEXT,
    priority INTEGER DEFAULT 0, -- 0-10, higher = more important

    -- Timestamps
    received_at TIMESTAMPTZ NOT NULL,
    read_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inbox_unread ON inbox_items(is_read, received_at DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_inbox_mailbox ON inbox_items(mailbox_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_prospect ON inbox_items(prospect_id);
CREATE INDEX IF NOT EXISTS idx_inbox_campaign ON inbox_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_inbox_thread ON inbox_items(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_message_id ON inbox_items(message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_starred ON inbox_items(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_inbox_priority ON inbox_items(priority DESC) WHERE is_read = false;

CREATE TRIGGER inbox_items_updated_at
    BEFORE UPDATE ON inbox_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on inbox_items" ON inbox_items FOR ALL USING (true);

-- =====================================================
-- FUNCTION: Match inbox item to prospect/campaign
-- =====================================================
CREATE OR REPLACE FUNCTION match_inbox_item()
RETURNS TRIGGER AS $$
DECLARE
    matched_email RECORD;
    matched_prospect RECORD;
BEGIN
    -- Try to match by in_reply_to header
    IF NEW.in_reply_to IS NOT NULL THEN
        SELECT e.*, p.id as prospect_id
        INTO matched_email
        FROM emails e
        JOIN prospects p ON e.prospect_id = p.id
        WHERE e.message_id = NEW.in_reply_to
        LIMIT 1;

        IF matched_email IS NOT NULL THEN
            NEW.prospect_id := matched_email.prospect_id;
            NEW.campaign_id := matched_email.campaign_id;
            NEW.thread_id := COALESCE(NEW.thread_id, matched_email.thread_id, NEW.in_reply_to);
        END IF;
    END IF;

    -- Fallback: match by email address
    IF NEW.prospect_id IS NULL THEN
        SELECT id INTO matched_prospect
        FROM prospects
        WHERE email = NEW.from_email
        LIMIT 1;

        IF matched_prospect IS NOT NULL THEN
            NEW.prospect_id := matched_prospect.id;
        END IF;
    END IF;

    -- Generate snippet if not provided
    IF NEW.snippet IS NULL AND NEW.body_text IS NOT NULL THEN
        NEW.snippet := LEFT(REGEXP_REPLACE(NEW.body_text, E'[\n\r]+', ' ', 'g'), 200);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inbox_item_match_trigger
    BEFORE INSERT ON inbox_items
    FOR EACH ROW
    EXECUTE FUNCTION match_inbox_item();

-- =====================================================
-- FUNCTION: Handle reply - update campaign lead status
-- =====================================================
CREATE OR REPLACE FUNCTION handle_inbox_reply()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process inbound emails
    IF NEW.direction != 'inbound' THEN
        RETURN NEW;
    END IF;

    -- Update campaign lead if matched
    IF NEW.prospect_id IS NOT NULL AND NEW.campaign_id IS NOT NULL THEN
        UPDATE campaign_leads
        SET
            status = 'replied',
            has_replied = true,
            replied_at = NEW.received_at,
            next_email_at = NULL
        WHERE prospect_id = NEW.prospect_id
          AND campaign_id = NEW.campaign_id
          AND status = 'active';
    END IF;

    -- Update mailbox reply count
    IF NEW.mailbox_id IS NOT NULL THEN
        UPDATE mailboxes
        SET total_replies = total_replies + 1
        WHERE id = NEW.mailbox_id;
    END IF;

    -- Update prospect stage if not already engaged
    IF NEW.prospect_id IS NOT NULL THEN
        UPDATE prospects
        SET stage = 'engaged'
        WHERE id = NEW.prospect_id
          AND stage IN ('new', 'researching', 'outreach', 'contacted');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inbox_reply_handler
    AFTER INSERT ON inbox_items
    FOR EACH ROW
    EXECUTE FUNCTION handle_inbox_reply();

-- =====================================================
-- OUTBOX (Scheduled and sent emails from unified system)
-- =====================================================
CREATE TABLE IF NOT EXISTS outbox (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE CASCADE,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    campaign_lead_id UUID REFERENCES campaign_leads(id) ON DELETE SET NULL,
    sequence_step INTEGER,

    -- Email Content
    to_email TEXT NOT NULL,
    to_name TEXT,
    subject TEXT NOT NULL,
    body_text TEXT,
    body_html TEXT,

    -- Variant Tracking
    variant TEXT CHECK (variant IN ('A', 'B')),

    -- Scheduling
    scheduled_for TIMESTAMPTZ,
    status TEXT DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'sending', 'sent', 'failed', 'cancelled'
    )),

    -- Send Result
    message_id TEXT,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Tracking
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_scheduled ON outbox(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_outbox_mailbox ON outbox(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_outbox_prospect ON outbox(prospect_id);
CREATE INDEX IF NOT EXISTS idx_outbox_campaign_lead ON outbox(campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);

CREATE TRIGGER outbox_updated_at
    BEFORE UPDATE ON outbox
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on outbox" ON outbox FOR ALL USING (true);
