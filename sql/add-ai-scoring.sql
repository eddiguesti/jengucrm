-- Add AI scoring columns to prospects table
-- Run this in Supabase SQL Editor

-- AI Score (1-100)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT NULL;

-- AI Grade (A, B, C, D, F)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_grade VARCHAR(1) DEFAULT NULL;

-- AI Analysis JSON (buying signals, concerns, recommendations)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT NULL;

-- Add comment to explain the columns
COMMENT ON COLUMN prospects.ai_score IS 'AI-generated fit score 1-100. A=80-100, B=60-79, C=40-59, D=20-39, F=0-19';
COMMENT ON COLUMN prospects.ai_grade IS 'AI-generated grade (A/B/C/D/F) based on fit score';
COMMENT ON COLUMN prospects.ai_analysis IS 'Detailed AI analysis: buying_signals, concerns, hotel_size_estimate, decision_maker_access, automation_opportunity, recommended_approach';

-- Create index for filtering by grade/score
CREATE INDEX IF NOT EXISTS idx_prospects_ai_grade ON prospects(ai_grade) WHERE ai_grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_ai_score ON prospects(ai_score) WHERE ai_score IS NOT NULL;

-- Example query to find hot prospects
-- SELECT * FROM prospects
-- WHERE ai_grade IN ('A', 'B')
-- AND archived = false
-- ORDER BY ai_score DESC;
