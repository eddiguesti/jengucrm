-- Add CASCADE DELETE constraints to prevent orphaned records
-- This ensures data integrity when prospects are deleted

-- Drop existing foreign key constraints
ALTER TABLE emails
DROP CONSTRAINT IF EXISTS emails_prospect_id_fkey;

ALTER TABLE activities
DROP CONSTRAINT IF EXISTS activities_prospect_id_fkey;

ALTER TABLE campaign_leads
DROP CONSTRAINT IF EXISTS campaign_leads_prospect_id_fkey;

ALTER TABLE pain_signals
DROP CONSTRAINT IF EXISTS pain_signals_prospect_id_fkey;

-- Re-add foreign keys with CASCADE DELETE
ALTER TABLE emails
ADD CONSTRAINT emails_prospect_id_fkey
FOREIGN KEY (prospect_id)
REFERENCES prospects(id)
ON DELETE CASCADE;

ALTER TABLE activities
ADD CONSTRAINT activities_prospect_id_fkey
FOREIGN KEY (prospect_id)
REFERENCES prospects(id)
ON DELETE CASCADE;

ALTER TABLE campaign_leads
ADD CONSTRAINT campaign_leads_prospect_id_fkey
FOREIGN KEY (prospect_id)
REFERENCES prospects(id)
ON DELETE CASCADE;

ALTER TABLE pain_signals
ADD CONSTRAINT pain_signals_prospect_id_fkey
FOREIGN KEY (prospect_id)
REFERENCES prospects(id)
ON DELETE CASCADE;

-- Add unique constraint on emails to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unique_email_prospect
ON emails(prospect_id, direction, sent_at)
WHERE prospect_id IS NOT NULL;

-- Add index for better delete performance
CREATE INDEX IF NOT EXISTS idx_emails_prospect_id ON emails(prospect_id);
CREATE INDEX IF NOT EXISTS idx_activities_prospect_id ON activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_prospect_id ON campaign_leads(prospect_id);
CREATE INDEX IF NOT EXISTS idx_pain_signals_prospect_id ON pain_signals(prospect_id);

-- Add comment explaining the CASCADE behavior
COMMENT ON CONSTRAINT emails_prospect_id_fkey ON emails IS
'CASCADE DELETE - When a prospect is deleted, all related emails are automatically deleted';

COMMENT ON CONSTRAINT activities_prospect_id_fkey ON activities IS
'CASCADE DELETE - When a prospect is deleted, all related activities are automatically deleted';

COMMENT ON CONSTRAINT campaign_leads_prospect_id_fkey ON campaign_leads IS
'CASCADE DELETE - When a prospect is deleted, they are automatically removed from all campaigns';

COMMENT ON CONSTRAINT pain_signals_prospect_id_fkey ON pain_signals IS
'CASCADE DELETE - When a prospect is deleted, all related pain signals are automatically deleted';
