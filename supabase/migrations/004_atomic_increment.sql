-- Atomic increment function to prevent race conditions
-- Used for counter fields like emails_sent, replies_received, etc.

CREATE OR REPLACE FUNCTION increment_counter(
  table_name TEXT,
  column_name TEXT,
  row_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = %I + 1 WHERE id = $1',
    table_name,
    column_name,
    column_name
  ) USING row_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_counter TO anon, authenticated;

-- Also create a specific function for campaign counters (safer, no dynamic SQL)
CREATE OR REPLACE FUNCTION increment_campaign_emails_sent(campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET emails_sent = emails_sent + 1
  WHERE id = campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_replies(campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET replies_received = replies_received + 1
  WHERE id = campaign_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_campaign_emails_sent TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_campaign_replies TO anon, authenticated;
