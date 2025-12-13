-- Add lead_quality field to prospects table
-- Run this in Supabase SQL Editor

-- Add lead_quality column
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS lead_quality TEXT DEFAULT 'cold';

-- Add email_confidence column
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS email_confidence TEXT DEFAULT 'low';

-- Add index for lead quality queries
CREATE INDEX IF NOT EXISTS idx_prospects_lead_quality ON prospects(lead_quality);

-- Add index for prioritized email queue (hot leads first, then by score)
CREATE INDEX IF NOT EXISTS idx_prospects_email_priority
ON prospects(lead_quality DESC, score DESC)
WHERE stage IN ('new', 'researching', 'outreach');

-- Update existing prospects based on source
-- Job board leads = hot (they're hiring, have pain points)
UPDATE prospects
SET lead_quality = 'hot'
WHERE source IN ('indeed', 'adzuna', 'caterer', 'hosco', 'talentshotels', 'ehotelier', 'hospitalityonline', 'hoteljobs')
AND lead_quality = 'cold';

-- Comment for reference:
-- lead_quality values:
--   'hot' = High intent (job posting, bad reviews, direct inquiry)
--   'warm' = Medium intent (has contact name, verified email)
--   'cold' = Low intent (bulk scraped, info@ email only)
