-- Add missing columns to emails table for full email tracking
-- Run this in Supabase SQL Editor

-- Add recipient and sender columns
ALTER TABLE emails ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id TEXT; -- For reply matching

-- Add email type to distinguish outreach vs mystery shopper
ALTER TABLE emails ADD COLUMN IF NOT EXISTS email_type TEXT DEFAULT 'outreach';
-- 'outreach' = from edd@jengu.ai
-- 'mystery_shopper' = from andy@gmail
-- 'reply' = inbound reply

-- Add direction for inbox monitoring
ALTER TABLE emails ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
-- 'outbound' = sent by us
-- 'inbound' = received reply

-- Add reply tracking
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES emails(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id TEXT; -- For grouping conversations

-- Create index for reply matching
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_to_email ON emails(to_email);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
