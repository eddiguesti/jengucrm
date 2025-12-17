/**
 * Run campaign tables migration
 * This creates the missing campaign_sequences and campaign_leads tables
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Need: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('📋 Running campaign tables migration...\n');

  // We'll run each table creation separately
  const steps = [
    {
      name: 'campaign_sequences table',
      sql: `
        CREATE TABLE IF NOT EXISTS campaign_sequences (
          id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
          step_number INTEGER NOT NULL,
          delay_days INTEGER DEFAULT 0,
          delay_hours INTEGER DEFAULT 0,
          variant_a_subject TEXT NOT NULL,
          variant_a_body TEXT NOT NULL,
          variant_b_subject TEXT,
          variant_b_body TEXT,
          variant_split INTEGER DEFAULT 50 CHECK (variant_split >= 0 AND variant_split <= 100),
          use_ai_generation BOOLEAN DEFAULT false,
          ai_prompt_context TEXT,
          sent_count INTEGER DEFAULT 0,
          variant_a_sent INTEGER DEFAULT 0,
          variant_b_sent INTEGER DEFAULT 0,
          open_count INTEGER DEFAULT 0,
          variant_a_opens INTEGER DEFAULT 0,
          variant_b_opens INTEGER DEFAULT 0,
          reply_count INTEGER DEFAULT 0,
          variant_a_replies INTEGER DEFAULT 0,
          variant_b_replies INTEGER DEFAULT 0,
          bounce_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(campaign_id, step_number)
        );
      `,
    },
    {
      name: 'campaign_leads table',
      sql: `
        CREATE TABLE IF NOT EXISTS campaign_leads (
          id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
          prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
          mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,
          current_step INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active' CHECK (status IN (
            'active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed'
          )),
          assigned_variant TEXT CHECK (assigned_variant IN ('A', 'B')),
          last_email_at TIMESTAMPTZ,
          next_email_at TIMESTAMPTZ,
          emails_sent INTEGER DEFAULT 0,
          emails_opened INTEGER DEFAULT 0,
          has_replied BOOLEAN DEFAULT false,
          replied_at TIMESTAMPTZ,
          added_by TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(campaign_id, prospect_id)
        );
      `,
    },
  ];

  for (const step of steps) {
    console.log(`\n📝 Creating ${step.name}...`);

    try {
      // Use Supabase's REST API to execute raw SQL
      // Note: This requires the SQL to be executed through a Supabase function or Edge Function
      // For now, we'll test if the table exists

      const tableName = step.name.split(' ')[0];
      const { error: testError } = await supabase
        .from(tableName)
        .select('*')
        .limit(0);

      if (!testError) {
        console.log(`✅ ${step.name} already exists`);
      } else if (testError.message.includes('does not exist') || testError.message.includes('not found')) {
        console.log(`⚠️  ${step.name} does not exist`);
        console.log(`\n📋 Please run this SQL in Supabase SQL Editor:`);
        console.log(`https://supabase.com/dashboard/project/${supabaseUrl.split('.')[0].split('//')[1]}/sql/new`);
        console.log('\n' + step.sql);
        console.log('\n---\n');
      } else {
        console.log(`❌ Error checking ${step.name}:`, testError.message);
      }
    } catch (err) {
      console.error(`❌ Error with ${step.name}:`, err);
    }
  }

  // Update campaigns table
  console.log('\n📝 Adding columns to campaigns table...');
  console.log('⚠️  These columns may already exist (ignore errors):\n');
  console.log(`
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy' CHECK (type IN ('legacy', 'sequence'));
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_count INTEGER DEFAULT 1;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS active_leads INTEGER DEFAULT 0;
    ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_leads INTEGER DEFAULT 0;
  `);

  console.log('\n---\n');

  // Verify tables exist
  console.log('🔍 Verification:\n');

  const tables = ['campaign_sequences', 'campaign_leads', 'campaigns'];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('*')
      .limit(0);

    if (error) {
      console.log(`❌ ${table}: NOT FOUND`);
      console.log(`   Error: ${error.message}`);
    } else {
      console.log(`✅ ${table}: EXISTS`);
    }
  }

  console.log('\n📌 Manual Steps Required:');
  console.log('   1. Go to Supabase SQL Editor:');
  console.log(`      https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new`);
  console.log('   2. Copy the contents of: supabase/migrations/fix_campaigns_tables.sql');
  console.log('   3. Paste and run in SQL Editor');
  console.log('   4. Re-run this script to verify');
}

runMigration().catch(console.error);
