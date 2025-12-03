-- Sales Navigator Import Tables Migration
-- Run this in Supabase SQL Editor

-- Add linkedin_url to prospects if not exists
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company TEXT;

-- Create index for linkedin_url
CREATE INDEX IF NOT EXISTS idx_prospects_linkedin_url ON prospects(linkedin_url);

-- Sales Navigator Import Logs
CREATE TABLE IF NOT EXISTS sales_nav_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  total_records INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create index for import logs
CREATE INDEX IF NOT EXISTS idx_sales_nav_import_logs_created ON sales_nav_import_logs(created_at DESC);

-- Sales Navigator Enrichment Queue
CREATE TABLE IF NOT EXISTS sales_nav_enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  prospect_name TEXT NOT NULL,
  company TEXT NOT NULL,
  firstname TEXT,
  lastname TEXT,
  linkedin_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  email_found TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  research_done BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indices for enrichment queue
CREATE INDEX IF NOT EXISTS idx_sales_nav_enrichment_status ON sales_nav_enrichment_queue(status);
CREATE INDEX IF NOT EXISTS idx_sales_nav_enrichment_prospect ON sales_nav_enrichment_queue(prospect_id);
CREATE INDEX IF NOT EXISTS idx_sales_nav_enrichment_created ON sales_nav_enrichment_queue(created_at DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_sales_nav_enrichment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sales_nav_enrichment_updated_at ON sales_nav_enrichment_queue;
CREATE TRIGGER trigger_sales_nav_enrichment_updated_at
  BEFORE UPDATE ON sales_nav_enrichment_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_nav_enrichment_updated_at();

-- Enable RLS
ALTER TABLE sales_nav_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_nav_enrichment_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all operations for authenticated users)
DROP POLICY IF EXISTS "Allow all for sales_nav_import_logs" ON sales_nav_import_logs;
CREATE POLICY "Allow all for sales_nav_import_logs" ON sales_nav_import_logs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for sales_nav_enrichment_queue" ON sales_nav_enrichment_queue;
CREATE POLICY "Allow all for sales_nav_enrichment_queue" ON sales_nav_enrichment_queue
  FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON sales_nav_import_logs TO authenticated;
GRANT ALL ON sales_nav_import_logs TO service_role;
GRANT ALL ON sales_nav_enrichment_queue TO authenticated;
GRANT ALL ON sales_nav_enrichment_queue TO service_role;

-- Verify tables were created
SELECT 'sales_nav_import_logs created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_nav_import_logs');

SELECT 'sales_nav_enrichment_queue created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_nav_enrichment_queue');
