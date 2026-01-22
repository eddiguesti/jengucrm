import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  issue: string;
  details?: string;
  recommendation?: string;
}

const issues: Issue[] = [];

function addIssue(severity: Issue['severity'], category: string, issue: string, details?: string, recommendation?: string) {
  issues.push({ severity, category, issue, details, recommendation });
}

async function auditSystem() {
  console.log('\n🔍 JENGU CRM - COMPREHENSIVE SYSTEM AUDIT');
  console.log('='.repeat(70));
  console.log(`Audit Time: ${new Date().toLocaleString()}`);
  console.log('='.repeat(70));

  // ============ 1. EMAIL SYSTEM AUDIT ============
  console.log('\n📧 [1/9] Auditing Email System...');

  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (emails && emails.length > 0) {
    const lastEmail = emails[0];
    const daysSinceLastEmail = Math.floor((Date.now() - new Date(lastEmail.created_at).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastEmail > 7) {
      addIssue('critical', 'Email System', `No emails sent in ${daysSinceLastEmail} days`,
        `Last email: ${new Date(lastEmail.created_at).toLocaleString()}`,
        'Check cron jobs, mailbox configuration, and prospect availability');
    }
  } else {
    addIssue('critical', 'Email System', 'No emails found in database',
      'System may never have sent emails',
      'Verify email sending configuration and test with /api/test-email');
  }

  // Check for bounced emails
  const { data: bounced } = await supabase
    .from('emails')
    .select('id')
    .eq('bounced', true);

  if (bounced && bounced.length > 50) {
    addIssue('warning', 'Email System', `${bounced.length} bounced emails detected`,
      'High bounce rate can damage sender reputation',
      'Review email list quality and remove invalid addresses');
  }

  // ============ 2. PROSPECT DATABASE AUDIT ============
  console.log('👥 [2/9] Auditing Prospect Database...');

  const { data: allProspects, count: totalProspects } = await supabase
    .from('prospects')
    .select('id, email, stage, enrichment_status, company_name', { count: 'exact' });

  const validEmails = allProspects?.filter(p =>
    p.email &&
    !p.email.includes('info@') &&
    !p.email.includes('contact@') &&
    !p.email.includes('reservations@') &&
    !p.email.includes('sales@') &&
    p.email.includes('@')
  ) || [];

  const enrichmentRate = totalProspects ? (validEmails.length / totalProspects) * 100 : 0;

  if (enrichmentRate < 10) {
    addIssue('critical', 'Prospects', `Only ${enrichmentRate.toFixed(1)}% of prospects have valid emails`,
      `${validEmails.length} valid emails out of ${totalProspects} prospects`,
      'Run enrichment pipeline to find contact emails');
  }

  const { data: newProspects } = await supabase
    .from('prospects')
    .select('id')
    .eq('stage', 'new');

  if (newProspects && newProspects.length > 500) {
    addIssue('warning', 'Prospects', `${newProspects.length} prospects in 'new' stage`,
      'Large backlog of unprocessed prospects',
      'Run enrichment and move prospects through pipeline');
  }

  // Check for duplicate prospects
  const { data: duplicates } = await supabase.rpc('find_duplicate_prospects');

  if (duplicates && duplicates.length > 0) {
    addIssue('warning', 'Prospects', `${duplicates.length} potential duplicate prospects`,
      'Duplicates waste resources and can annoy contacts',
      'Run deduplication script');
  }

  // ============ 3. MAILBOX AUDIT ============
  console.log('📮 [3/9] Auditing Mailboxes...');

  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('*');

  if (!mailboxes || mailboxes.length === 0) {
    addIssue('critical', 'Mailboxes', 'No mailboxes configured',
      'Cannot send emails without mailboxes',
      'Add mailboxes at /outreach/mailboxes');
  } else {
    const activeMailboxes = mailboxes.filter(m => m.status === 'active');
    const errorMailboxes = mailboxes.filter(m => m.status === 'error');
    const lowHealthMailboxes = mailboxes.filter(m => m.health_score < 70);

    if (activeMailboxes.length === 0) {
      addIssue('critical', 'Mailboxes', 'No active mailboxes',
        `${mailboxes.length} mailboxes exist but none are active`,
        'Activate at least one mailbox or fix errors');
    }

    if (errorMailboxes.length > 0) {
      addIssue('warning', 'Mailboxes', `${errorMailboxes.length} mailboxes in error state`,
        errorMailboxes.map(m => `${m.email}: ${m.last_error}`).join(', '),
        'Test connections and fix authentication issues');
    }

    if (lowHealthMailboxes.length > 0) {
      addIssue('warning', 'Mailboxes', `${lowHealthMailboxes.length} mailboxes with low health score`,
        lowHealthMailboxes.map(m => `${m.email}: ${m.health_score}%`).join(', '),
        'Review sending patterns and reduce volume if needed');
    }

    // Check daily capacity
    const totalCapacity = mailboxes.reduce((sum, m) => sum + (m.daily_limit || 0), 0);
    if (totalCapacity < 50) {
      addIssue('warning', 'Mailboxes', `Total daily capacity is only ${totalCapacity}`,
        'Low sending capacity limits outreach scale',
        'Add more mailboxes or increase warmup targets');
    }
  }

  // ============ 4. CAMPAIGN AUDIT ============
  console.log('📬 [4/9] Auditing Campaigns...');

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*');

  if (!campaigns || campaigns.length === 0) {
    addIssue('warning', 'Campaigns', 'No campaigns configured',
      'Campaigns organize outreach sequences',
      'Create campaigns at /outreach/campaigns');
  } else {
    const activeCampaigns = campaigns.filter(c => c.active);

    if (activeCampaigns.length === 0) {
      addIssue('warning', 'Campaigns', 'No active campaigns',
        `${campaigns.length} campaigns exist but none are active`,
        'Activate at least one campaign to start sending');
    }

    // Check for campaigns without sequences
    for (const campaign of campaigns) {
      const { data: sequences } = await supabase
        .from('campaign_sequences')
        .select('id')
        .eq('campaign_id', campaign.id);

      if (!sequences || sequences.length === 0) {
        addIssue('warning', 'Campaigns', `Campaign "${campaign.name}" has no email sequences`,
          'Campaigns need sequences to send emails',
          'Add email sequence steps to this campaign');
      }
    }

    // Check for campaigns without leads
    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('campaign_id');

    const campaignsWithLeads = new Set(campaignLeads?.map(l => l.campaign_id));

    activeCampaigns.forEach(c => {
      if (!campaignsWithLeads.has(c.id)) {
        addIssue('warning', 'Campaigns', `Campaign "${c.name}" is active but has no leads`,
          'Active campaigns without leads won\'t send emails',
          'Add prospects to campaign or deactivate it');
      }
    });
  }

  // ============ 5. CRON JOBS AUDIT ============
  console.log('⏰ [5/9] Auditing Cron Jobs...');

  // Check recent activities to see if crons are running
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentActivities } = await supabase
    .from('activities')
    .select('type, created_at')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentActivities || recentActivities.length === 0) {
    addIssue('critical', 'Cron Jobs', 'No activities logged in last 24 hours',
      'System appears completely inactive',
      'Check Vercel cron (vercel.json) and external cron (cron-job.org)');
  }

  // Check for specific cron job activity types
  const cronActivityTypes = ['email_sent', 'enrichment', 'scraper', 'follow_up'];
  const recentCronActivity = recentActivities?.filter(a =>
    cronActivityTypes.some(type => a.type.includes(type))
  ) || [];

  if (recentCronActivity.length === 0) {
    addIssue('warning', 'Cron Jobs', 'No automated activity in last 24 hours',
      'Cron jobs may not be running properly',
      'Verify cron configuration and check logs');
  }

  // ============ 6. ENRICHMENT AUDIT ============
  console.log('🔍 [6/9] Auditing Enrichment System...');

  const { data: needEnrichment } = await supabase
    .from('prospects')
    .select('id')
    .or('email.is.null,email.eq.')
    .limit(1000);

  if (needEnrichment && needEnrichment.length > 100) {
    addIssue('warning', 'Enrichment', `${needEnrichment.length}+ prospects need email enrichment`,
      'Cannot send emails without prospect emails',
      'Run enrichment: curl -X POST https://crm.jengu.ai/api/enrichment/trigger');
  }

  // Check enrichment logs
  const { data: enrichmentLogs } = await supabase
    .from('activities')
    .select('created_at')
    .eq('type', 'enrichment')
    .order('created_at', { ascending: false })
    .limit(1);

  if (enrichmentLogs && enrichmentLogs.length > 0) {
    const daysSinceEnrichment = Math.floor((Date.now() - new Date(enrichmentLogs[0].created_at).getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceEnrichment > 7) {
      addIssue('warning', 'Enrichment', `No enrichment run in ${daysSinceEnrichment} days`,
        `Last enrichment: ${new Date(enrichmentLogs[0].created_at).toLocaleString()}`,
        'Schedule regular enrichment runs to find new contacts');
    }
  }

  // ============ 7. DATABASE INTEGRITY ============
  console.log('💾 [7/9] Auditing Database Integrity...');

  // Check for orphaned records
  const { data: orphanedEmails } = await supabase
    .from('emails')
    .select('id, prospect_id')
    .not('prospect_id', 'is', null)
    .limit(100);

  if (orphanedEmails) {
    let orphanCount = 0;
    for (const email of orphanedEmails) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id')
        .eq('id', email.prospect_id)
        .single();

      if (!prospect) orphanCount++;
    }

    if (orphanCount > 10) {
      addIssue('warning', 'Database', `${orphanCount}+ orphaned email records`,
        'Emails reference deleted prospects',
        'Clean up orphaned records or add CASCADE deletes');
    }
  }

  // ============ 8. API HEALTH CHECK ============
  console.log('🌐 [8/9] Checking API Health...');

  try {
    const envVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'XAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'CRON_SECRET'
    ];

    const missingVars = envVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      addIssue('critical', 'Configuration', `Missing environment variables: ${missingVars.join(', ')}`,
        'Required for system operation',
        'Add missing variables to .env.local and Vercel dashboard');
    }
  } catch (e) {
    addIssue('warning', 'Configuration', 'Unable to verify environment variables',
      String(e),
      'Check environment configuration');
  }

  // ============ 9. CLOUDFLARE WORKER STATUS ============
  console.log('☁️  [9/9] Checking Cloudflare Worker...');

  // Check if Cloudflare D1 database has data
  addIssue('info', 'Cloudflare', 'Cloudflare Worker status needs manual verification',
    'Check: npx wrangler deployments list',
    'Verify worker is deployed and cron jobs are scheduled');

  // ============ GENERATE REPORT ============
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('📊 AUDIT RESULTS');
  console.log('='.repeat(70));

  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const info = issues.filter(i => i.severity === 'info');

  console.log(`\n🔴 CRITICAL ISSUES: ${critical.length}`);
  console.log(`🟡 WARNINGS: ${warnings.length}`);
  console.log(`🔵 INFO: ${info.length}`);
  console.log(`\nTOTAL: ${issues.length} issues found`);

  if (critical.length > 0) {
    console.log('\n\n🔴 CRITICAL ISSUES (MUST FIX)');
    console.log('─'.repeat(70));
    critical.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. [${issue.category}] ${issue.issue}`);
      if (issue.details) console.log(`   Details: ${issue.details}`);
      if (issue.recommendation) console.log(`   ✅ Fix: ${issue.recommendation}`);
    });
  }

  if (warnings.length > 0) {
    console.log('\n\n🟡 WARNINGS (SHOULD FIX)');
    console.log('─'.repeat(70));
    warnings.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. [${issue.category}] ${issue.issue}`);
      if (issue.details) console.log(`   Details: ${issue.details}`);
      if (issue.recommendation) console.log(`   ✅ Fix: ${issue.recommendation}`);
    });
  }

  if (info.length > 0) {
    console.log('\n\n🔵 INFORMATIONAL');
    console.log('─'.repeat(70));
    info.forEach((issue, idx) => {
      console.log(`\n${idx + 1}. [${issue.category}] ${issue.issue}`);
      if (issue.recommendation) console.log(`   💡 ${issue.recommendation}`);
    });
  }

  // ============ ACTION PLAN ============
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('🎯 RECOMMENDED ACTION PLAN');
  console.log('='.repeat(70));

  if (critical.length > 0) {
    console.log('\n🔴 IMMEDIATE ACTIONS (Critical):');
    critical.forEach((issue, idx) => {
      if (issue.recommendation) {
        console.log(`   ${idx + 1}. ${issue.recommendation}`);
      }
    });
  }

  if (warnings.length > 0) {
    console.log('\n🟡 SHORT-TERM ACTIONS (Within 1 week):');
    warnings.slice(0, 5).forEach((issue, idx) => {
      if (issue.recommendation) {
        console.log(`   ${idx + 1}. ${issue.recommendation}`);
      }
    });
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ Audit Complete');
  console.log('='.repeat(70) + '\n');
}

auditSystem().catch(console.error);
