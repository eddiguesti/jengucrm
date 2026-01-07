import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getStats() {
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  console.log('\n📊 JENGU CRM - 15 DAY PERFORMANCE REPORT');
  console.log('='.repeat(60));
  console.log(`Period: ${new Date(fifteenDaysAgo).toLocaleDateString()} - ${new Date().toLocaleDateString()}`);
  console.log('='.repeat(60));

  // ============ EMAIL STATISTICS ============
  const { data: allEmails } = await supabase
    .from('emails')
    .select('*')
    .gte('created_at', fifteenDaysAgo)
    .lte('created_at', now);

  const sent = allEmails?.filter(e => e.direction === 'outbound') || [];
  const received = allEmails?.filter(e => e.direction === 'inbound') || [];
  const opened = allEmails?.filter(e => e.opened) || [];
  const bounced = allEmails?.filter(e => e.bounced) || [];

  console.log('\n📧 EMAIL PERFORMANCE');
  console.log('─'.repeat(60));
  console.log(`  Total Sent:           ${sent.length.toLocaleString()}`);
  console.log(`  Replies Received:     ${received.length.toLocaleString()}`);
  console.log(`  Emails Opened:        ${opened.length.toLocaleString()}`);
  console.log(`  Bounced:              ${bounced.length.toLocaleString()}`);
  console.log('');
  console.log(`  📈 Reply Rate:         ${sent.length > 0 ? ((received.length / sent.length) * 100).toFixed(2) : 0}%`);
  console.log(`  📈 Open Rate:          ${sent.length > 0 ? ((opened.length / sent.length) * 100).toFixed(2) : 0}%`);
  console.log(`  📉 Bounce Rate:        ${sent.length > 0 ? ((bounced.length / sent.length) * 100).toFixed(2) : 0}%`);

  // Emails by day
  const emailsByDay: Record<string, { sent: number; replies: number }> = {};
  sent.forEach(email => {
    const day = new Date(email.created_at).toLocaleDateString();
    if (!emailsByDay[day]) emailsByDay[day] = { sent: 0, replies: 0 };
    emailsByDay[day].sent++;
  });
  received.forEach(email => {
    const day = new Date(email.created_at).toLocaleDateString();
    if (!emailsByDay[day]) emailsByDay[day] = { sent: 0, replies: 0 };
    emailsByDay[day].replies++;
  });

  console.log('\n  📅 Daily Breakdown:');
  Object.entries(emailsByDay)
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .slice(0, 7)
    .forEach(([day, stats]) => {
      console.log(`    ${day}: ${stats.sent} sent, ${stats.replies} replies`);
    });

  // ============ PROSPECT STATISTICS ============
  const { data: newProspects } = await supabase
    .from('prospects')
    .select('stage, tier, enrichment_status, email')
    .gte('created_at', fifteenDaysAgo);

  const { data: allProspects } = await supabase
    .from('prospects')
    .select('stage, tier, enrichment_status');

  console.log('\n\n👥 PROSPECT STATISTICS');
  console.log('─'.repeat(60));
  console.log(`  New Prospects (15d):  ${newProspects?.length.toLocaleString() || 0}`);
  console.log(`  Total Database:       ${allProspects?.length.toLocaleString() || 0}`);

  const byStage = (newProspects || []).reduce((acc: Record<string, number>, p) => {
    acc[p.stage] = (acc[p.stage] || 0) + 1;
    return acc;
  }, {});

  console.log('\n  📊 New Prospects by Stage:');
  Object.entries(byStage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([stage, count]) => {
      console.log(`    ${stage.padEnd(15)}: ${count}`);
    });

  const enriched = newProspects?.filter(p => p.email && !p.email.includes('@')) || [];
  console.log(`\n  ✅ Enriched (w/ email): ${enriched.length} (${newProspects?.length ? ((enriched.length / newProspects.length) * 100).toFixed(1) : 0}%)`);

  // ============ CAMPAIGN STATISTICS ============
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*');

  const { data: campaignLeads } = await supabase
    .from('campaign_leads')
    .select('status')
    .gte('created_at', fifteenDaysAgo);

  console.log('\n\n📬 CAMPAIGN STATISTICS');
  console.log('─'.repeat(60));
  console.log(`  Active Campaigns:     ${campaigns?.filter(c => c.active).length || 0}`);
  console.log(`  Total Campaigns:      ${campaigns?.length || 0}`);
  console.log(`  New Leads Added:      ${campaignLeads?.length || 0}`);

  const leadsByStatus = (campaignLeads || []).reduce((acc: Record<string, number>, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(leadsByStatus).length > 0) {
    console.log('\n  Lead Status:');
    Object.entries(leadsByStatus).forEach(([status, count]) => {
      console.log(`    ${status.padEnd(15)}: ${count}`);
    });
  }

  // ============ ACTIVITY STATISTICS ============
  const { data: activities } = await supabase
    .from('activities')
    .select('type')
    .gte('created_at', fifteenDaysAgo);

  console.log('\n\n📝 ACTIVITY LOG (Last 15 Days)');
  console.log('─'.repeat(60));
  console.log(`  Total Activities:     ${activities?.length.toLocaleString() || 0}`);

  const activityTypes = (activities || []).reduce((acc: Record<string, number>, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  console.log('\n  Top Activities:');
  Object.entries(activityTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`    ${type.padEnd(25)}: ${count}`);
    });

  // ============ MAILBOX STATISTICS ============
  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('*');

  if (mailboxes && mailboxes.length > 0) {
    console.log('\n\n📮 MAILBOX STATISTICS');
    console.log('─'.repeat(60));
    console.log(`  Active Mailboxes:     ${mailboxes.filter(m => m.status === 'active').length}`);
    console.log(`  Total Sent (All):     ${mailboxes.reduce((sum, m) => sum + (m.total_sent || 0), 0).toLocaleString()}`);
    console.log(`  Avg Health Score:     ${(mailboxes.reduce((sum, m) => sum + m.health_score, 0) / mailboxes.length).toFixed(1)}%`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Report Complete\n');
}

getStats().catch(console.error);
