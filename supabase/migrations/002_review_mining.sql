-- Review Pain Mining Schema
-- This adds support for the second lead generation strategy

-- Add lead_source column to prospects table
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'job_posting';

-- Create index for filtering by lead source
CREATE INDEX IF NOT EXISTS idx_prospects_lead_source ON prospects(lead_source);

-- Pain signals table - stores detected complaints from reviews
CREATE TABLE IF NOT EXISTS pain_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL, -- tripadvisor, google, booking
  keyword_matched TEXT NOT NULL, -- the pain keyword that was detected
  review_snippet TEXT NOT NULL, -- the actual complaint text
  review_rating DECIMAL(2,1), -- star rating of the review
  review_date DATE,
  reviewer_name TEXT,
  review_url TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for pain_signals
CREATE INDEX IF NOT EXISTS idx_pain_signals_prospect ON pain_signals(prospect_id);
CREATE INDEX IF NOT EXISTS idx_pain_signals_platform ON pain_signals(source_platform);
CREATE INDEX IF NOT EXISTS idx_pain_signals_keyword ON pain_signals(keyword_matched);

-- Review scrape logs table - tracks scraping history
CREATE TABLE IF NOT EXISTS review_scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL, -- tripadvisor, google, booking
  location TEXT NOT NULL,
  properties_scanned INTEGER DEFAULT 0,
  reviews_scanned INTEGER DEFAULT 0,
  pain_signals_found INTEGER DEFAULT 0,
  new_leads_created INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_log TEXT[],
  status TEXT DEFAULT 'running', -- running, completed, failed
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for scrape logs
CREATE INDEX IF NOT EXISTS idx_review_scrape_logs_platform ON review_scrape_logs(platform);
CREATE INDEX IF NOT EXISTS idx_review_scrape_logs_started ON review_scrape_logs(started_at DESC);

-- Enable RLS
ALTER TABLE pain_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_scrape_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for pain_signals (allow all for now, can be restricted later)
CREATE POLICY "Allow all on pain_signals" ON pain_signals FOR ALL USING (true);

-- Create policies for review_scrape_logs
CREATE POLICY "Allow all on review_scrape_logs" ON review_scrape_logs FOR ALL USING (true);

-- Add pain_signal_count to prospects for quick filtering
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS pain_signal_count INTEGER DEFAULT 0;

-- Update existing prospects to have job_posting as lead_source
UPDATE prospects SET lead_source = 'job_posting' WHERE lead_source IS NULL;
