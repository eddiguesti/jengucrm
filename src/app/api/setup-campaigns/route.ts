import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// One-time setup endpoint to create campaigns table and insert default campaigns
// Call this once to initialize the A/B testing system
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Require authentication
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  try {
    // Check if campaigns table exists by trying to select from it
    const { error: tableCheckError } = await supabase
      .from('campaigns')
      .select('id')
      .limit(1);

    if (tableCheckError && tableCheckError.message.includes('does not exist')) {
      return NextResponse.json({
        success: false,
        error: 'Campaigns table does not exist. Please run the migration in Supabase SQL editor.',
        migration_sql: `
-- Run this in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    strategy_key TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    send_days TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    send_time_start INTEGER DEFAULT 9,
    send_time_end INTEGER DEFAULT 17,
    daily_limit INTEGER DEFAULT 20,
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    replies_received INTEGER DEFAULT 0,
    meetings_booked INTEGER DEFAULT 0,
    open_rate DECIMAL(5,2) DEFAULT 0,
    reply_rate DECIMAL(5,2) DEFAULT 0,
    meeting_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emails ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS email_type TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS to_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(active);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true);

INSERT INTO campaigns (name, description, strategy_key, active, daily_limit) VALUES
    ('Direct & Confident', 'Short (70-90 words), punchy, authority-first', 'authority_scarcity', true, 20),
    ('Curious & Generous', 'Longer (100-120 words), story-driven, value-first', 'curiosity_value', true, 20)
ON CONFLICT (strategy_key) DO NOTHING;
        `.trim(),
      });
    }

    // Check if campaigns exist
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('id, name, strategy_key');

    if (existingCampaigns && existingCampaigns.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Campaigns already exist',
        campaigns: existingCampaigns,
      });
    }

    // Insert default campaigns
    const { data: inserted, error: insertError } = await supabase
      .from('campaigns')
      .insert([
        {
          name: 'Direct & Confident',
          description: 'Short (70-90 words), punchy, authority-first. Uses 3Ps (Praise-Picture-Push). Loss aversion. Ends with "Worth 15 mins?"',
          strategy_key: 'authority_scarcity',
          active: true,
          daily_limit: 20,
        },
        {
          name: 'Curious & Generous',
          description: 'Longer (100-120 words), story-driven. Value-first with free process map offer. Ends with "What do you think?" (foot-in-door)',
          strategy_key: 'curiosity_value',
          active: true,
          daily_limit: 20,
        },
      ])
      .select();

    if (insertError) {
      return NextResponse.json({
        success: false,
        error: insertError.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Campaigns created successfully',
      campaigns: inserted,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint with Authorization header to setup campaigns',
    usage: 'curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain/api/setup-campaigns',
  });
}
