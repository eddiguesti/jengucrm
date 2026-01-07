import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getAllTimeStats() {
  console.log('\n📊 JENGU CRM - ALL-TIME STATISTICS');
  console.log('='.repeat(60));

  // ============ EMAIL STATISTICS ============
  const { data: allEmails, count: emailCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact' });

  const sent = allEmails?.filter(e => e.direction === 'outbound') || [];
  const received = allEmails?.filter(e => e.direction === 'inbound') || [];
  const opened = allEmails?.filter(e => e.opened) || [];
  const bounced = allEmails?.filter(e => e.bounced) || [];

  console.log('\n📧 EMAIL PERFORMANCE (ALL TIME)');
  console.log('─'.repeat(60));
  console.log(`  Total Sent:           ${sent.length.toLocaleString()}`);
  console.log(`  Replies Received:     ${received.length.toLocaleString()}`);
  console.log(`  Emails Opened:        ${opened.length.toLocaleString()}`);
  console.log(`  Bounced:              ${bounced.length.toLocaleString()}`);
  console.log('');
  console.log(`  📈 Reply Rate:         ${sent.length > 0 ? ((received.length / sent.length) * 100).toFixed(2) : 0}%`);
  console.log(`  📈 Open Rate:          ${sent.length > 0 ? ((opened.length / sent.length) * 100).toFixed(2) : 0}%`);
  console.log(`  📉 Bounce Rate:        ${sent.length > 0 ? ((bounced.length / sent.length) * 100).toFixed(2) : 0}%`);

  // Get latest email
  if (sent.length > 0) {
    const latestSent = sent.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    console.log(`\n  📅 Last Email Sent:    ${new Date(latestSent.created_at).toLocaleString()}`);
  }

  if (received.length > 0) {
    const latestReply = received.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    console.log(`  💬 Last Reply:         ${new Date(latestReply.created_at).toLocaleString()}`);
  }

  // ============ PROSPECT STATISTICS ============
  const { data: allProspects, count: prospectCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact' });

  console.log('\n\n👥 PROSPECT DATABASE');
  console.log('─'.repeat(60));
  console.log(`  Total Prospects:      ${prospectCount?.toLocaleString() || 0}`);

  const byStage = (allProspects || []).reduce((acc: Record<string, number>, p) => {
    acc[p.stage] = (acc[p.stage] || 0) + 1;
    return acc;
  }, {});

  console.log('\n  📊 Prospects by Stage:');
  Object.entries(byStage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([stage, count]) => {
      const percentage = prospectCount ? ((count / prospectCount) * 100).toFixed(1) : 0;
      console.log(`    ${stage.padEnd(15)}: ${String(count).padStart(5)} (${percentage}%)`);
    });

  const byTier = (allProspects || []).reduce((acc: Record<string, number>, p) => {
    acc[p.tier || 'none'] = (acc[p.tier || 'none'] || 0) + 1;
    return acc;
  }, {});

  console.log('\n  🎯 Prospects by Tier:');
  Object.entries(byTier)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tier, count]) => {
      console.log(`    ${tier.padEnd(15)}: ${count}`);
    });

  const enriched = allProspects?.filter(p => p.email && !p.email.includes('info@') && !p.email.includes('contact@')) || [];
  console.log(`\n  ✅ Valid Emails:       ${enriched.length} (${prospectCount ? ((enriched.length / prospectCount) * 100).toFixed(1) : 0}%)`);

  // ============ CAMPAIGN STATISTICS ============
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*');

  const { data: campaignLeads } = await supabase
    .from('campaign_leads')
    .select('status');

  console.log('\n\n📬 CAMPAIGNS');
  console.log('─'.repeat(60));
  console.log(`  Total Campaigns:      ${campaigns?.length || 0}`);
  console.log(`  Active Campaigns:     ${campaigns?.filter(c => c.active).length || 0}`);
  console.log(`  Total Leads:          ${campaignLeads?.length || 0}`);

  if (campaigns && campaigns.length > 0) {
    console.log('\n  Active Campaigns:');
    campaigns.filter(c => c.active).forEach(c => {
      console.log(`    - ${c.name} (${c.emails_sent || 0} sent, ${c.replies_received || 0} replies)`);
    });
  }

  // ============ MAILBOX STATISTICS ============
  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('*');

  if (mailboxes && mailboxes.length > 0) {
    console.log('\n\n📮 MAILBOXES');
    console.log('─'.repeat(60));
    console.log(`  Total Mailboxes:      ${mailboxes.length}`);
    console.log(`  Active:               ${mailboxes.filter(m => m.status === 'active').length}`);
    console.log(`  Warming:              ${mailboxes.filter(m => m.status === 'warming').length}`);
    console.log(`  Paused:               ${mailboxes.filter(m => m.status === 'paused').length}`);

    const totalSent = mailboxes.reduce((sum, m) => sum + (m.total_sent || 0), 0);
    console.log(`\n  📊 Total Sent:         ${totalSent.toLocaleString()}`);
    console.log(`  📊 Avg Health:         ${(mailboxes.reduce((sum, m) => sum + m.health_score, 0) / mailboxes.length).toFixed(1)}%`);

    console.log('\n  📧 Mailbox Details:');
    mailboxes.forEach(m => {
      console.log(`    ${m.email.padEnd(30)} ${m.status.padEnd(10)} ${String(m.total_sent).padStart(4)} sent`);
    });
  }

  // ============ ACTIVITY STATISTICS ============
  const { data: activities, count: activityCount } = await supabase
    .from('activities')
    .select('type', { count: 'exact' });

  console.log('\n\n📝 ACTIVITY LOG (ALL TIME)');
  console.log('─'.repeat(60));
  console.log(`  Total Activities:     ${activityCount?.toLocaleString() || 0}`);

  const activityTypes = (activities || []).reduce((acc: Record<string, number>, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(activityTypes).length > 0) {
    console.log('\n  Top Activities:');
    Object.entries(activityTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([type, count]) => {
        console.log(`    ${type.padEnd(30)}: ${count.toLocaleString()}`);
      });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Report Complete\n');
}

getAllTimeStats().catch(console.error);
