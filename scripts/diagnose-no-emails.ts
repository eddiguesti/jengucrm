import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function diagnose() {
  console.log('\n🔍 WHY NO EMAILS ARE BEING SENT - ROOT CAUSE ANALYSIS');
  console.log('='.repeat(70));

  // 1. Check campaigns
  console.log('\n📬 STEP 1: Checking Campaigns...');
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*');

  console.log(`   Total campaigns: ${campaigns?.length || 0}`);
  console.log(`   Active campaigns: ${campaigns?.filter(c => c.active).length || 0}`);

  if (!campaigns || campaigns.length === 0) {
    console.log('   ❌ BLOCKER: No campaigns exist');
    return;
  }

  for (const campaign of campaigns) {
    console.log(`\n   Campaign: "${campaign.name}" [${campaign.active ? 'ACTIVE' : 'PAUSED'}]`);

    // Check sequences
    const { data: sequences } = await supabase
      .from('campaign_sequences')
      .select('*')
      .eq('campaign_id', campaign.id);

    console.log(`   ├─ Email sequences: ${sequences?.length || 0}`);
    if (!sequences || sequences.length === 0) {
      console.log(`   ├─ ❌ BLOCKER: No email templates - can't send without content`);
    } else {
      sequences.forEach(seq => {
        console.log(`   │  └─ Step ${seq.step_number}: "${seq.variant_a_subject?.substring(0, 50)}..."`);
      });
    }

    // Check leads
    const { data: leads } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('campaign_id', campaign.id);

    console.log(`   └─ Assigned leads: ${leads?.length || 0}`);
    if (!leads || leads.length === 0) {
      console.log(`      ❌ BLOCKER: No prospects assigned - can't send to nobody`);
    } else {
      const byStatus = leads.reduce((acc: Record<string, number>, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {});
      Object.entries(byStatus).forEach(([status, count]) => {
        console.log(`      └─ ${status}: ${count}`);
      });
    }
  }

  // 2. Check prospects
  console.log('\n\n👥 STEP 2: Checking Prospect Pool...');

  const { data: allProspects, count: total } = await supabase
    .from('prospects')
    .select('id, email, stage', { count: 'exact' });

  console.log(`   Total prospects: ${total}`);

  const withEmail = allProspects?.filter(p => p.email && p.email.includes('@')) || [];
  const validEmail = withEmail.filter(p =>
    !p.email.includes('info@') &&
    !p.email.includes('contact@') &&
    !p.email.includes('reservations@') &&
    !p.email.includes('sales@')
  );

  console.log(`   With email: ${withEmail.length}`);
  console.log(`   Valid email: ${validEmail.length}`);

  if (validEmail.length === 0) {
    console.log(`   ❌ BLOCKER: No prospects with valid emails`);
  }

  const byStage = allProspects?.reduce((acc: Record<string, number>, p) => {
    acc[p.stage] = (acc[p.stage] || 0) + 1;
    return acc;
  }, {});

  console.log('\n   Prospects by stage:');
  Object.entries(byStage || {}).forEach(([stage, count]) => {
    console.log(`   ├─ ${stage}: ${count}`);
  });

  // 3. Check mailboxes
  console.log('\n\n📮 STEP 3: Checking Mailboxes...');

  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('*');

  console.log(`   Total mailboxes: ${mailboxes?.length || 0}`);
  console.log(`   Active mailboxes: ${mailboxes?.filter(m => m.status === 'active').length || 0}`);

  if (!mailboxes || mailboxes.length === 0) {
    console.log(`   ❌ BLOCKER: No mailboxes configured`);
  } else if (mailboxes.filter(m => m.status === 'active').length === 0) {
    console.log(`   ❌ BLOCKER: No active mailboxes`);
  } else {
    const totalCapacity = mailboxes
      .filter(m => m.status === 'active')
      .reduce((sum, m) => sum + (m.daily_limit - m.sent_today), 0);
    console.log(`   ✓ Daily capacity remaining: ${totalCapacity}`);

    mailboxes.forEach(m => {
      console.log(`   ├─ ${m.email} [${m.status}] ${m.sent_today}/${m.daily_limit} today`);
    });
  }

  // 4. Check cron configuration
  console.log('\n\n⏰ STEP 4: Checking Cron Configuration...');

  console.log(`   Vercel cron: /api/cron/daily at 7am UTC (from vercel.json)`);
  console.log(`   ⚠️  Only 1 cron job in vercel.json!`);
  console.log(`   ❌ BLOCKER: Missing /api/cron/hourly-email cron`);
  console.log(`   ❌ BLOCKER: External cron (cron-job.org) not configured here`);

  // 5. Check recent activity
  console.log('\n\n📊 STEP 5: Checking Recent Activity...');

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentActivity } = await supabase
    .from('activities')
    .select('type, created_at')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`   Activities in last 24h: ${recentActivity?.length || 0}`);

  if (!recentActivity || recentActivity.length === 0) {
    console.log(`   ❌ BLOCKER: No activity at all - system completely inactive`);
  } else {
    const activityTypes = recentActivity.reduce((acc: Record<string, number>, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});

    Object.entries(activityTypes).forEach(([type, count]) => {
      console.log(`   ├─ ${type}: ${count}`);
    });
  }

  // 6. Check env variables
  console.log('\n\n🔧 STEP 6: Checking Environment Variables...');

  const requiredVars = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'CRON_SECRET': process.env.CRON_SECRET,
    'XAI_API_KEY': process.env.XAI_API_KEY,
    'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
  };

  let missingCount = 0;
  Object.entries(requiredVars).forEach(([key, value]) => {
    if (!value) {
      console.log(`   ❌ Missing: ${key}`);
      missingCount++;
    } else {
      console.log(`   ✓ ${key}: ${value.substring(0, 10)}...`);
    }
  });

  if (missingCount > 0) {
    console.log(`   ⚠️  ${missingCount} missing environment variables`);
  }

  // SUMMARY
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('🎯 ROOT CAUSE SUMMARY');
  console.log('='.repeat(70));

  const blockers = [];

  // Check each blocker
  if (!campaigns || campaigns.filter(c => c.active).length === 0) {
    blockers.push('No active campaigns');
  }

  let hasSequences = false;
  for (const campaign of campaigns || []) {
    if (campaign.active) {
      const { data: sequences } = await supabase
        .from('campaign_sequences')
        .select('id')
        .eq('campaign_id', campaign.id);
      if (sequences && sequences.length > 0) {
        hasSequences = true;
        break;
      }
    }
  }
  if (!hasSequences) {
    blockers.push('Active campaigns have NO email sequences');
  }

  let hasLeads = false;
  for (const campaign of campaigns || []) {
    if (campaign.active) {
      const { data: leads } = await supabase
        .from('campaign_leads')
        .select('id')
        .eq('campaign_id', campaign.id);
      if (leads && leads.length > 0) {
        hasLeads = true;
        break;
      }
    }
  }
  if (!hasLeads) {
    blockers.push('Active campaigns have NO leads assigned');
  }

  if (validEmail.length === 0) {
    blockers.push('No prospects with valid email addresses');
  }

  if (!mailboxes || mailboxes.filter(m => m.status === 'active').length === 0) {
    blockers.push('No active mailboxes');
  }

  if (!recentActivity || recentActivity.length === 0) {
    blockers.push('Cron jobs are NOT running (no activity in 24h)');
  }

  console.log('\n❌ BLOCKERS PREVENTING EMAIL SENDING:');
  blockers.forEach((blocker, idx) => {
    console.log(`   ${idx + 1}. ${blocker}`);
  });

  console.log('\n\n📋 ACTION PLAN TO FIX:');
  console.log('─'.repeat(70));

  if (blockers.includes('Active campaigns have NO email sequences')) {
    console.log('\n1. CREATE EMAIL SEQUENCES:');
    console.log('   Go to /outreach/campaigns and add email steps to each campaign');
    console.log('   Or use: curl -X POST https://crm.jengu.ai/api/setup-campaigns');
  }

  if (blockers.includes('Active campaigns have NO leads assigned')) {
    console.log('\n2. ASSIGN PROSPECTS TO CAMPAIGNS:');
    console.log('   - Go to /prospects, select prospects, add to campaign');
    console.log('   - Or create script to bulk assign enriched prospects');
  }

  if (blockers.includes('No prospects with valid email addresses')) {
    console.log('\n3. RUN ENRICHMENT:');
    console.log('   curl -X POST https://crm.jengu.ai/api/enrichment/trigger');
    console.log('   Or use Cloudflare enrichment worker');
  }

  if (blockers.includes('Cron jobs are NOT running (no activity in 24h)')) {
    console.log('\n4. FIX CRON JOBS:');
    console.log('   - Setup external cron at cron-job.org for /api/cron/hourly-email');
    console.log('   - URL: https://crm.jengu.ai/api/cron/hourly-email');
    console.log('   - Schedule: */5 8-18 * * 1-5 (every 5 min, 8am-6pm, Mon-Fri)');
    console.log('   - Add header: Authorization: Bearer [CRON_SECRET]');
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ Diagnosis Complete');
  console.log('='.repeat(70) + '\n');
}

diagnose().catch(console.error);
