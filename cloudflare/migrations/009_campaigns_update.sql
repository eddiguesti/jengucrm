-- Add sequence-related columns to campaigns table

ALTER TABLE campaigns ADD COLUMN sequence_count INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN leads_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN ab_testing_enabled INTEGER DEFAULT 0;
