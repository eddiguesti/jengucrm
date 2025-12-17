/**
 * Comprehensive Supabase Schema Analysis
 * This script analyzes the entire database schema to understand what exists and what's needed
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

async function analyzeSchema() {
  console.log('🔍 COMPREHENSIVE SUPABASE SCHEMA ANALYSIS\n');
  console.log('='.repeat(80));

  // Get all tables
  const tables = [
    'prospects',
    'emails',
    'campaigns',
    'campaign_sequences',
    'campaign_leads',
    'mailboxes',
    'mailbox_daily_stats',
    'activities',
    'pain_signals',
    'mystery_shopper_queue',
    'api_usage',
    'bounced_emails',
  ];

  for (const table of tables) {
    console.log(`\n📊 TABLE: ${table}`);
    console.log('-'.repeat(80));

    try {
      // Count rows
      const { count, error: countError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        if (countError.message.includes('does not exist') || countError.message.includes('not found')) {
          console.log(`❌ TABLE DOES NOT EXIST`);
          continue;
        } else {
          console.log(`⚠️  Error: ${countError.message}`);
          continue;
        }
      }

      console.log(`✅ EXISTS - ${count} rows`);

      // Get sample row to see columns
      const { data: sample, error: sampleError } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (sample && sample.length > 0) {
        const columns = Object.keys(sample[0]);
        console.log(`📋 Columns (${columns.length}): ${columns.join(', ')}`);
      }

      // Get some stats for key tables
      if (table === 'prospects') {
        const { data: stats } = await supabase
          .from(table)
          .select('stage, tier, email, website, contact_name')
          .limit(1000);

        if (stats) {
          const withEmail = stats.filter(p => p.email).length;
          const withWebsite = stats.filter(p => p.website).length;
          const withContact = stats.filter(p => p.contact_name).length;
          const byStage = stats.reduce((acc, p) => {
            acc[p.stage] = (acc[p.stage] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const byTier = stats.reduce((acc, p) => {
            acc[p.tier] = (acc[p.tier] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          console.log(`   📧 With email: ${withEmail}/${stats.length} (${Math.round(withEmail/stats.length*100)}%)`);
          console.log(`   🌐 With website: ${withWebsite}/${stats.length} (${Math.round(withWebsite/stats.length*100)}%)`);
          console.log(`   👤 With contact: ${withContact}/${stats.length} (${Math.round(withContact/stats.length*100)}%)`);
          console.log(`   📊 By stage:`, byStage);
          console.log(`   🎯 By tier:`, byTier);
        }
      }

      if (table === 'campaigns') {
        const { data: campaigns } = await supabase
          .from(table)
          .select('name, status, type, sequence_count, leads_count, active_leads');

        if (campaigns && campaigns.length > 0) {
          console.log(`   📋 Campaigns:`);
          campaigns.forEach(c => {
            console.log(`      - ${c.name} (${c.status})`);
            if (c.type) console.log(`        Type: ${c.type}, Sequences: ${c.sequence_count}, Leads: ${c.leads_count}, Active: ${c.active_leads}`);
          });
        }
      }

      if (table === 'emails') {
        const { data: emailStats } = await supabase
          .from(table)
          .select('status, created_at')
          .limit(1000);

        if (emailStats) {
          const byStatus = emailStats.reduce((acc, e) => {
            acc[e.status] = (acc[e.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log(`   📊 By status:`, byStatus);

          // Last week
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const lastWeek = emailStats.filter(e => new Date(e.created_at) >= weekAgo).length;
          console.log(`   📅 Last 7 days: ${lastWeek} emails`);
        }
      }

      if (table === 'mailboxes') {
        const { data: mailboxes } = await supabase
          .from(table)
          .select('email, status, daily_limit, sent_today, warmup_stage, health_score');

        if (mailboxes && mailboxes.length > 0) {
          console.log(`   📧 Mailboxes (${mailboxes.length}):`);
          mailboxes.forEach(m => {
            console.log(`      - ${m.email}: ${m.status}, ${m.sent_today}/${m.daily_limit} today, warmup: ${m.warmup_stage}, health: ${m.health_score}`);
          });
        }
      }

      if (table === 'campaign_sequences') {
        const { data: sequences } = await supabase
          .from(table)
          .select('campaign_id, step_number, variant_a_subject, sent_count');

        if (sequences && sequences.length > 0) {
          console.log(`   📧 Sequences (${sequences.length}):`);
          const byCampaign = sequences.reduce((acc, s) => {
            acc[s.campaign_id] = (acc[s.campaign_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log(`      Sequences by campaign:`, byCampaign);
        }
      }

      if (table === 'campaign_leads') {
        const { data: leads } = await supabase
          .from(table)
          .select('campaign_id, status, current_step, has_replied');

        if (leads && leads.length > 0) {
          const byStatus = leads.reduce((acc, l) => {
            acc[l.status] = (acc[l.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log(`   📊 By status:`, byStatus);
          const replied = leads.filter(l => l.has_replied).length;
          console.log(`   💬 Replied: ${replied}/${leads.length} (${Math.round(replied/leads.length*100)}%)`);
        }
      }

    } catch (err) {
      console.log(`❌ Error analyzing table: ${err}`);
    }
  }

  // Check for relationships
  console.log('\n\n🔗 CHECKING RELATIONSHIPS');
  console.log('='.repeat(80));

  // Check if campaigns can reference sequences
  try {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name')
      .limit(5);

    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        const { data: sequences, error } = await supabase
          .from('campaign_sequences')
          .select('*')
          .eq('campaign_id', campaign.id);

        if (!error && sequences) {
          console.log(`✅ Campaign "${campaign.name}" → ${sequences.length} sequences`);
        } else if (error?.message.includes('does not exist')) {
          console.log(`⚠️  Campaign "${campaign.name}" → campaign_sequences table missing`);
        }
      }
    }
  } catch (err) {
    console.log(`❌ Error checking relationships: ${err}`);
  }

  // Summary
  console.log('\n\n📋 SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(80));

  const { data: prospects } = await supabase.from('prospects').select('*', { count: 'exact', head: true });
  const { data: emails } = await supabase.from('emails').select('*', { count: 'exact', head: true });
  const { data: campaigns } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });
  const { data: sequences } = await supabase.from('campaign_sequences').select('*', { count: 'exact', head: true });
  const { data: leads } = await supabase.from('campaign_leads').select('*', { count: 'exact', head: true });
  const { data: mailboxes } = await supabase.from('mailboxes').select('*', { count: 'exact', head: true });

  console.log('\n📊 Table Status:');
  console.log(`   ✅ prospects: ${prospects?.count || 0} rows`);
  console.log(`   ✅ emails: ${emails?.count || 0} rows`);
  console.log(`   ✅ campaigns: ${campaigns?.count || 0} rows`);
  console.log(`   ${sequences ? '✅' : '❌'} campaign_sequences: ${sequences?.count || 'MISSING'} rows`);
  console.log(`   ${leads ? '✅' : '❌'} campaign_leads: ${leads?.count || 'MISSING'} rows`);
  console.log(`   ✅ mailboxes: ${mailboxes?.count || 0} rows`);

  console.log('\n💡 Recommendations:');
  if (!sequences || !leads) {
    console.log('   🚨 CRITICAL: campaign_sequences and/or campaign_leads tables missing');
    console.log('      → Run CLEAN_MIGRATION.sql in Supabase SQL Editor');
    console.log('      → This will enable campaign sequences feature');
  } else {
    console.log('   ✅ All campaign tables exist');
  }

  if ((mailboxes?.count || 0) < 3) {
    console.log('   ⚠️  Only found', mailboxes?.count || 0, 'mailboxes (expected 3+)');
    console.log('      → Check /outreach/mailboxes to configure');
  }

  console.log('\n✅ Analysis complete!\n');
}

analyzeSchema().catch(console.error);
