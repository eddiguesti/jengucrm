-- Add archive and notification columns
-- Run this in Supabase SQL Editor

-- Add archive columns to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS archive_reason TEXT;
-- Archive reasons: 'not_interested', 'wrong_contact', 'competitor', 'budget', 'timing', 'other'

-- Add notification tracking
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,

    type TEXT NOT NULL, -- 'meeting_request', 'positive_reply', 'urgent'
    title TEXT NOT NULL,
    message TEXT,

    -- Status
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,

    -- For push/email notifications
    sent_email BOOLEAN DEFAULT false,
    sent_push BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prospects_archived ON prospects(archived);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on notifications" ON notifications FOR ALL USING (true);
