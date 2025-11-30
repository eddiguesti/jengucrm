-- Add job description and AI-extracted pain points columns
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS source_job_description TEXT,
ADD COLUMN IF NOT EXISTS job_pain_points JSONB;

-- Comment on new columns
COMMENT ON COLUMN prospects.source_job_description IS 'Full job description text from job posting';
COMMENT ON COLUMN prospects.job_pain_points IS 'AI-extracted pain points from job description (e.g., guest communication, response times, admin tasks)';
