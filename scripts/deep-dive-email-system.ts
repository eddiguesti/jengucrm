import { supabase } from './lib/supabase';

/**
 * Deep dive into email system to understand what's really happening
 */
async function deepDive() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DEEP DIVE: EMAIL SYSTEM ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Check mailboxes
  console.log('📧 MAILBOXES IN DATABASE\n');
  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('email, status, sent_today, daily_limit, total_sent, warmup_stage, health_score')
    .order('email');

  if (mailboxes) {
    mailboxes.forEach(m => {
      console.log(`  ${m.email}`);
      console.log(`    Status: ${m.status} | Health: ${m.health_score}`);
      console.log(`    Sent today: ${m.sent_today}/${m.daily_limit} | Total sent: ${m.total_sent}`);
      console.log(`    Warmup stage: ${m.warmup_stage}`);
      console.log('');
    });
  }
  console.log(`  Total capacity: ${mailboxes?.reduce((sum, m) => sum + m.daily_limit, 0) || 0} emails/day\n`);

  // 2. Check email history
  console.log('📨 EMAIL HISTORY (Last 7 Days)\n');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: emails, count: totalEmails } = await supabase
    .from('emails')
    .select('*', { count: 'exact' })
    .eq('direction', 'outbound')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  console.log(`  Total emails sent (last 7 days): ${totalEmails || 0}\n`);

  // Group by date
  const byDate = new Map<string, number>();
  emails?.forEach(e => {
    const date = e.created_at.split('T')[0];
    byDate.set(date, (byDate.get(date) || 0) + 1);
  });

  console.log('  Daily breakdown:');
  const sortedDates = Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  sortedDates.forEach(([date, count]) => {
    console.log(`    ${date}: ${count} emails`);
  });

  // 3. Check campaigns
  console.log('\n🎯 CAMPAIGNS\n');
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('name, strategy_key, active, daily_limit, emails_sent, replies_received')
    .order('created_at', { ascending: false });

  if (campaigns) {
    campaigns.forEach(c => {
      const status = c.active ? '✓ ACTIVE' : '✗ PAUSED';
      console.log(`  ${status} ${c.name}`);
      console.log(`    Strategy: ${c.strategy_key}`);
      console.log(`    Daily limit: ${c.daily_limit}`);
      console.log(`    Sent: ${c.emails_sent} | Replies: ${c.replies_received}`);
      console.log('');
    });
  }

  // 4. Check prospects ready to email
  console.log('👥 PROSPECTS READY FOR OUTREACH\n');

  const { count: withEmail } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .not('email', 'is', null)
    .in('stage', ['new', 'researching']);

  const { count: alreadyEmailed } = await supabase
    .from('emails')
    .select('prospect_id', { count: 'exact', head: true })
    .eq('direction', 'outbound');

  console.log(`  Prospects with email: ${withEmail || 0}`);
  console.log(`  Already emailed: ${alreadyEmailed || 0}`);
  console.log(`  Net available: ${(withEmail || 0) - (alreadyEmailed || 0)}`);

  // Check for generic emails
  const { data: sampleProspects } = await supabase
    .from('prospects')
    .select('name, email, stage')
    .not('email', 'is', null)
    .in('stage', ['new', 'researching'])
    .limit(20);

  console.log('\n  Sample prospects:');
  sampleProspects?.forEach(p => {
    const isGeneric = /^(info|contact|reception|booking|sales|reservations|hello|inquiry)@/i.test(p.email || '');
    const flag = isGeneric ? '⚠️  GENERIC' : '✓ Personal';
    console.log(`    ${flag} ${(p.name || '').padEnd(35)} ${p.email}`);
  });

  // 5. Check recent cron activity
  console.log('\n⏰ RECENT CRON ACTIVITY\n');
  const { data: activities } = await supabase
    .from('activities')
    .select('title, metadata, created_at')
    .ilike('title', '%cron%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (activities) {
    activities.forEach(a => {
      const time = new Date(a.created_at).toLocaleString();
      console.log(`  ${time}: ${a.title}`);
      if (a.metadata) {
        const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata;
        if (meta.sent) console.log(`    → Sent: ${meta.sent}`);
        if (meta.error) console.log(`    → Error: ${meta.error}`);
      }
    });
  }

  // 6. Check for any bounced emails
  console.log('\n⚠️  BOUNCED/FAILED EMAILS\n');
  const { data: bounced, count: bouncedCount } = await supabase
    .from('emails')
    .select('to_email, subject, error_message, created_at', { count: 'exact' })
    .eq('status', 'bounced')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`  Total bounced: ${bouncedCount || 0}\n`);
  if (bounced && bounced.length > 0) {
    bounced.forEach(e => {
      console.log(`  ${e.to_email}: ${e.subject}`);
      if (e.error_message) console.log(`    Error: ${e.error_message}`);
    });
  }

  // 7. Calculate current warmup status
  console.log('\n🔥 WARMUP STATUS\n');
  const warmupStartDate = new Date('2025-12-06');
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - warmupStartDate.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`  Warmup started: 2025-12-06`);
  console.log(`  Days since start: ${daysSinceStart}`);
  console.log(`  Current limit: 60 emails/day (3 inboxes × 20)`);
  console.log(`  Sent today: ${mailboxes?.reduce((sum, m) => sum + m.sent_today, 0) || 0}`);

  console.log('\n═══════════════════════════════════════════════════════════');
}

deepDive().catch(console.error);
