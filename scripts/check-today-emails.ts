import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkTodayEmails() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log('\n📧 EMAIL ACTIVITY CHECK - ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  console.log('='.repeat(60));

  // Count outreach emails sent today
  const { data: todayEmails, error } = await supabase
    .from('emails')
    .select('id, to_email, from_email, email_type, status, sent_at, subject')
    .eq('direction', 'outbound')
    .gte('sent_at', today.toISOString())
    .order('sent_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  const outreach = todayEmails?.filter(e => e.email_type === 'outreach') || [];
  const followUps = todayEmails?.filter(e => e.email_type === 'follow_up') || [];
  const mysteryShopper = todayEmails?.filter(e => e.email_type === 'mystery_shopper') || [];

  console.log(`\n📊 TODAY'S TOTALS:`);
  console.log(`   Outreach emails:      ${outreach.length}`);
  console.log(`   Follow-up emails:     ${followUps.length}`);
  console.log(`   Mystery shopper:      ${mysteryShopper.length}`);
  console.log(`   ─────────────────────`);
  console.log(`   TOTAL SENT TODAY:     ${todayEmails?.length || 0}`);

  // Show last 5 emails sent
  if (todayEmails && todayEmails.length > 0) {
    console.log(`\n📬 LAST 5 EMAILS SENT:`);
    for (const email of todayEmails.slice(0, 5)) {
      const time = new Date(email.sent_at).toLocaleTimeString();
      console.log(`   ${time} | ${email.email_type.padEnd(15)} | ${email.to_email}`);
    }
  } else {
    console.log(`\n⚠️  NO EMAILS SENT TODAY YET`);
  }

  // Check warmup limit
  const WARMUP_LIMIT = 80;
  const remaining = Math.max(0, WARMUP_LIMIT - outreach.length);
  console.log(`\n🎯 WARMUP STATUS:`);
  console.log(`   Daily limit:          ${WARMUP_LIMIT}`);
  console.log(`   Outreach sent:        ${outreach.length}`);
  console.log(`   Remaining capacity:   ${remaining}`);

  // Check by inbox
  const byInbox: Record<string, number> = {};
  for (const e of outreach) {
    byInbox[e.from_email] = (byInbox[e.from_email] || 0) + 1;
  }
  if (Object.keys(byInbox).length > 0) {
    console.log(`\n📮 BY INBOX:`);
    for (const [inbox, count] of Object.entries(byInbox)) {
      console.log(`   ${inbox}: ${count}/20`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

checkTodayEmails().catch(console.error);
