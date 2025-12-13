-- Enrichment Stats RPC Function
-- Efficient single-query counting for accurate enrichment statistics

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_enrichment_stats();

-- Create the enrichment stats function
CREATE OR REPLACE FUNCTION get_enrichment_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  stage_counts JSON;
BEGIN
  -- Get stage counts as a subquery
  SELECT json_object_agg(stage, cnt)
  INTO stage_counts
  FROM (
    SELECT stage, COUNT(*) as cnt
    FROM prospects
    WHERE archived = false
    GROUP BY stage
  ) s;

  -- Build the complete stats object
  SELECT json_build_object(
    'total', COUNT(*) FILTER (WHERE archived = false),
    'needsWebsite', COUNT(*) FILTER (WHERE website IS NULL AND archived = false),
    'hasWebsite', COUNT(*) FILTER (WHERE website IS NOT NULL AND archived = false),
    'needsEmail', COUNT(*) FILTER (WHERE website IS NOT NULL AND email IS NULL AND archived = false),
    'hasEmail', COUNT(*) FILTER (WHERE email IS NOT NULL AND archived = false),
    'fullyEnriched', COUNT(*) FILTER (WHERE website IS NOT NULL AND email IS NOT NULL AND archived = false),
    'contacted', COUNT(*) FILTER (WHERE stage = 'contacted' AND archived = false),
    'byStage', COALESCE(stage_counts, '{}'::json),
    'last24h', COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours' AND archived = false),
    'stuckCount', COUNT(*) FILTER (
      WHERE stage = 'new'
      AND created_at < NOW() - INTERVAL '7 days'
      AND archived = false
    ),
    'hasContactName', COUNT(*) FILTER (WHERE contact_name IS NOT NULL AND archived = false),
    'hasStarRating', COUNT(*) FILTER (WHERE star_rating IS NOT NULL AND archived = false),
    'hasGoogleRating', COUNT(*) FILTER (WHERE google_rating IS NOT NULL AND archived = false)
  )
  INTO result
  FROM prospects;

  RETURN result;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_enrichment_stats() TO anon, authenticated, service_role;

-- Add a comment
COMMENT ON FUNCTION get_enrichment_stats() IS 'Returns comprehensive enrichment statistics in a single efficient query';
