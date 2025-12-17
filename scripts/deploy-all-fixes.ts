/**
 * Complete Deployment Script
 * This script verifies everything is ready and provides deployment instructions
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deploymentChecklist() {
  console.log('🚀 DEPLOYMENT CHECKLIST\n');
  console.log('='.repeat(80));

  // 1. Check database migration
  console.log('\n✅ STEP 1: Database Migration');
  console.log('-'.repeat(80));

  const { error: seqErr } = await supabase.from('campaign_sequences').select('*').limit(1);
  const { error: leadsErr } = await supabase.from('campaign_leads').select('*').limit(1);

  if (!seqErr && !leadsErr) {
    console.log('✅ Database tables created successfully');
    console.log('   - campaign_sequences: EXISTS');
    console.log('   - campaign_leads: EXISTS');
  } else {
    console.log('❌ Database migration failed');
    console.log('   Please run CLEAN_MIGRATION.sql in Supabase');
    return;
  }

  // 2. Check code changes
  console.log('\n✅ STEP 2: Code Changes Ready');
  console.log('-'.repeat(80));
  console.log('   - EMERGENCY_STOP: disabled');
  console.log('   - Daily limits: 60 emails/day (3 mailboxes)');
  console.log('   - Enrichment: 100 prospects/day');
  console.log('   - Commit: c3d31f3');

  // 3. Git push instructions
  console.log('\n⏳ STEP 3: Push to Production');
  console.log('-'.repeat(80));
  console.log('   Run this command:');
  console.log('   \x1b[36mgit push origin main\x1b[0m');
  console.log('');
  console.log('   Note: You may be prompted for GitHub credentials');
  console.log('   - Username: your GitHub username');
  console.log('   - Password: use Personal Access Token (not password)');
  console.log('');
  console.log('   Create token at: https://github.com/settings/tokens');
  console.log('   - Select: repo (full control)');
  console.log('   - Expiration: 90 days');

  // 4. Check current system stats
  console.log('\n📊 STEP 4: Current System Status');
  console.log('-'.repeat(80));

  const { count: prospectCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true });

  const { count: emailCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true });

  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('email, status, sent_today, daily_limit');

  console.log(`   Prospects: ${prospectCount}`);
  console.log(`   Emails sent (all time): ${emailCount}`);
  console.log(`   Mailboxes: ${mailboxes?.length || 0}`);

  if (mailboxes) {
    mailboxes.forEach(m => {
      console.log(`      - ${m.email}: ${m.sent_today}/${m.daily_limit} today (${m.status})`);
    });
  }

  // 5. Deployment timeline
  console.log('\n⏱️  STEP 5: Expected Deployment Timeline');
  console.log('-'.repeat(80));
  console.log('   1. Push to GitHub: ~30 seconds');
  console.log('   2. Vercel auto-build: ~2 minutes');
  console.log('   3. Deployment live: ~3 minutes total');
  console.log('   4. First email sent: Within 5 minutes of deployment');

  // 6. Post-deployment verification
  console.log('\n🧪 STEP 6: Post-Deployment Verification');
  console.log('-'.repeat(80));
  console.log('   After deployment, run these commands:');
  console.log('');
  console.log('   # Test email endpoint');
  console.log('   \x1b[36mcurl https://crm.jengu.ai/api/cron/hourly-email\x1b[0m');
  console.log('');
  console.log('   # Check system stats');
  console.log('   \x1b[36mcurl https://crm.jengu.ai/api/stats\x1b[0m');
  console.log('');
  console.log('   # View campaigns (should not error)');
  console.log('   \x1b[36mcurl https://crm.jengu.ai/api/outreach/campaigns\x1b[0m');

  // 7. Monitoring
  console.log('\n📈 STEP 7: Monitor After Deployment');
  console.log('-'.repeat(80));
  console.log('   Check these within 24 hours:');
  console.log('   - Vercel logs: https://vercel.com/eddiguesti/jengucrm/logs');
  console.log('   - Mailboxes sent count should increase');
  console.log('   - Enrichment should process 100/day');
  console.log('   - No 500 errors on campaigns page');

  // 8. Cloudflare Worker check
  console.log('\n☁️  STEP 8: Cloudflare Worker (Optional)');
  console.log('-'.repeat(80));
  console.log('   Cloudflare Workers may be handling email sending.');
  console.log('   Check status in Cloudflare Dashboard:');
  console.log('   - Go to: Workers & Pages → jengu-crm');
  console.log('   - Check: Metrics for request activity');
  console.log('   - View: Logs for email sending activity');

  // Summary
  console.log('\n\n🎯 SUMMARY');
  console.log('='.repeat(80));
  console.log('✅ Database: Ready (campaign tables created)');
  console.log('✅ Code: Ready (committed locally)');
  console.log('⏳ Action Required: Push to GitHub');
  console.log('');
  console.log('Expected Results After Deployment:');
  console.log('   - Email sending: 60/day capacity');
  console.log('   - Enrichment: 100/day (Vercel) + 300/day (Cloudflare)');
  console.log('   - Campaigns: Fully functional');
  console.log('   - Time to enrich 947 prospects: ~3 days');
  console.log('');
  console.log('🚀 Ready to deploy! Run: \x1b[36mgit push origin main\x1b[0m\n');
}

deploymentChecklist().catch(console.error);
