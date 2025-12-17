import { supabase } from './lib/supabase';

async function checkCampaigns() {
  console.log('=== CHECKING CAMPAIGNS ===\n');

  // 1. Check if campaigns table exists and has data
  try {
    const { data: campaigns, error: campaignsError, count } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (campaignsError) {
      console.error('❌ Error fetching campaigns:', campaignsError.message);
      console.error('Details:', campaignsError);
      return;
    }

    console.log(`✅ Found ${count || 0} campaigns in database\n`);

    if (campaigns && campaigns.length > 0) {
      console.log('Campaigns:');
      campaigns.forEach(c => {
        console.log(`  - ${c.name}`);
        console.log(`    ID: ${c.id}`);
        console.log(`    Type: ${c.type || 'legacy'}`);
        console.log(`    Active: ${c.active ? 'Yes' : 'No'}`);
        console.log(`    Strategy: ${c.strategy_key}`);
        console.log(`    Emails sent: ${c.emails_sent || 0}`);
        console.log(`    Created: ${c.created_at}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No campaigns found in database');
    }

    // 2. Check campaign sequences
    console.log('\n=== CHECKING CAMPAIGN SEQUENCES ===\n');
    const { data: sequences, error: seqError, count: seqCount } = await supabase
      .from('campaign_sequences')
      .select('campaign_id, step_number, variant_a_subject', { count: 'exact' });

    if (seqError) {
      console.error('❌ Error fetching sequences:', seqError.message);
    } else {
      console.log(`✅ Found ${seqCount || 0} sequence steps total\n`);

      // Group by campaign
      const byCampaign = new Map<string, any[]>();
      sequences?.forEach(seq => {
        if (!byCampaign.has(seq.campaign_id)) {
          byCampaign.set(seq.campaign_id, []);
        }
        byCampaign.get(seq.campaign_id)!.push(seq);
      });

      byCampaign.forEach((steps, campaignId) => {
        const campaign = campaigns?.find(c => c.id === campaignId);
        console.log(`Campaign: ${campaign?.name || campaignId}`);
        console.log(`  ${steps.length} steps:`);
        steps.forEach(s => {
          console.log(`    Step ${s.step_number}: ${s.variant_a_subject}`);
        });
        console.log('');
      });
    }

    // 3. Check campaign leads
    console.log('\n=== CHECKING CAMPAIGN LEADS ===\n');
    const { data: leads, error: leadsError, count: leadsCount } = await supabase
      .from('campaign_leads')
      .select('campaign_id, status', { count: 'exact' });

    if (leadsError) {
      console.error('❌ Error fetching leads:', leadsError.message);
    } else {
      console.log(`✅ Found ${leadsCount || 0} campaign leads total\n`);

      // Group by campaign and status
      const leadsByCampaign = new Map<string, Map<string, number>>();
      leads?.forEach(lead => {
        if (!leadsByCampaign.has(lead.campaign_id)) {
          leadsByCampaign.set(lead.campaign_id, new Map());
        }
        const statusMap = leadsByCampaign.get(lead.campaign_id)!;
        statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);
      });

      leadsByCampaign.forEach((statusMap, campaignId) => {
        const campaign = campaigns?.find(c => c.id === campaignId);
        console.log(`Campaign: ${campaign?.name || campaignId}`);
        statusMap.forEach((count, status) => {
          console.log(`  ${status}: ${count}`);
        });
        console.log('');
      });
    }

    // 4. Test API endpoint
    console.log('\n=== TESTING API ENDPOINT ===\n');
    try {
      const response = await fetch('http://localhost:3000/api/outreach/campaigns');
      console.log(`Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API returned successfully');
        console.log(`Campaigns: ${data.campaigns?.length || 0}`);
        console.log(`Summary:`, data.summary);
      } else {
        const text = await response.text();
        console.error('❌ API error:', text);
      }
    } catch (error) {
      console.error('❌ Failed to call API:', error);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkCampaigns();
