import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMailboxes() {
  console.log('=== MAILBOXES IN SUPABASE ===\n');

  const { data: mailboxes, error } = await supabase.from('mailboxes').select('*');

  if (error) {
    console.log('Error fetching mailboxes:', error.message);
    return;
  }

  if (!mailboxes || mailboxes.length === 0) {
    console.log('❌ NO MAILBOXES FOUND IN SUPABASE!');
    console.log('\nThis is why no emails are being sent.');
    console.log('You need to add mailboxes either via:');
    console.log('  1. The UI at /outreach/mailboxes');
    console.log('  2. Running: npx tsx scripts/setup-cloudflare-supabase.ts');
    return;
  }

  for (const m of mailboxes) {
    console.log(`📧 ${m.email}`);
    console.log(`   Status: ${m.status}`);
    console.log(`   Warmup Stage: ${m.warmup_stage}`);
    console.log(`   Daily Limit: ${m.daily_limit}`);
    console.log(`   Sent Today: ${m.sent_today}`);
    console.log(`   Health Score: ${m.health_score}`);
    console.log(`   SMTP Verified: ${m.smtp_verified}`);
    console.log(`   Last Used: ${m.last_used_at || 'Never'}`);
    console.log('');
  }

  // Check ready prospects
  const { count } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('archived', false)
    .not('email', 'is', null)
    .in('stage', ['new', 'enriched', 'researching']);

  console.log('=== PROSPECTS READY TO EMAIL ===');
  console.log(`Count: ${count}`);

  // Sample of prospects with emails
  const { data: samples } = await supabase
    .from('prospects')
    .select('name, email, stage')
    .eq('archived', false)
    .not('email', 'is', null)
    .in('stage', ['new', 'enriched', 'researching'])
    .limit(5);

  if (samples?.length) {
    console.log('\nSample prospects:');
    for (const p of samples) {
      console.log(`  - ${p.name}: ${p.email} (${p.stage})`);
    }
  }
}

checkMailboxes().catch(console.error);
