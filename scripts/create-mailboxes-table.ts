/**
 * Create mailboxes table directly via Supabase SQL
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function createTable() {
  console.log('Creating mailboxes table via SQL...\n');

  const sql = `
    -- Create mailboxes table
    CREATE TABLE IF NOT EXISTS mailboxes (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER DEFAULT 465,
      smtp_user TEXT NOT NULL,
      smtp_pass TEXT NOT NULL,
      smtp_secure BOOLEAN DEFAULT true,
      imap_host TEXT,
      imap_port INTEGER DEFAULT 993,
      imap_user TEXT,
      imap_pass TEXT,
      imap_secure BOOLEAN DEFAULT true,
      warmup_enabled BOOLEAN DEFAULT true,
      warmup_start_date DATE DEFAULT CURRENT_DATE,
      warmup_stage INTEGER DEFAULT 1,
      warmup_target_per_day INTEGER DEFAULT 40,
      daily_limit INTEGER DEFAULT 5,
      sent_today INTEGER DEFAULT 0,
      bounces_today INTEGER DEFAULT 0,
      last_reset_date DATE DEFAULT CURRENT_DATE,
      total_sent INTEGER DEFAULT 0,
      total_bounces INTEGER DEFAULT 0,
      total_replies INTEGER DEFAULT 0,
      total_opens INTEGER DEFAULT 0,
      health_score INTEGER DEFAULT 100,
      bounce_rate DECIMAL(5,2) DEFAULT 0,
      reply_rate DECIMAL(5,2) DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0,
      status TEXT DEFAULT 'warming',
      last_error TEXT,
      last_error_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      smtp_verified BOOLEAN DEFAULT false,
      smtp_verified_at TIMESTAMPTZ,
      imap_verified BOOLEAN DEFAULT false,
      imap_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;

    -- Create policy
    DROP POLICY IF EXISTS "Allow all on mailboxes" ON mailboxes;
    CREATE POLICY "Allow all on mailboxes" ON mailboxes FOR ALL USING (true);

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status);
    CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(email);
  `;

  // Use the Supabase REST API to execute SQL
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!response.ok) {
    // Try direct postgres connection via pg_query if available
    console.log('RPC not available, trying alternative...\n');

    // Fall back to creating via individual statements
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: { persistSession: false },
    });

    // Try to query the table first
    const { error: checkError } = await supabase.from('mailboxes').select('id').limit(1);

    if (checkError?.message.includes('does not exist') || checkError?.message.includes('not found')) {
      console.log('Table does not exist. Please run this SQL in your Supabase Dashboard:\n');
      console.log('1. Go to: https://supabase.com/dashboard/project/_/sql/new');
      console.log('2. Paste and run the following SQL:\n');
      console.log('─'.repeat(60));
      console.log(sql);
      console.log('─'.repeat(60));
      console.log('\n3. Then run: npx tsx scripts/setup-outreach.ts');
      return false;
    }

    console.log('✓ Table already exists!');
    return true;
  }

  console.log('✓ Table created successfully!');
  return true;
}

createTable().catch(console.error);
