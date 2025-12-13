import { supabase } from './lib/supabase';

async function verifyTopProspects() {
  // Get the 2 top prospects
  const emails = ['xavier0037@hotmail.com', 'caroline@lemoulindemoissac.com'];

  for (const email of emails) {
    const { data: prospect, error } = await supabase
      .from('prospects')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !prospect) {
      console.log(`Could not find: ${email}`);
      continue;
    }

    console.log('\n' + '='.repeat(60));
    console.log('PROSPECT:', prospect.name);
    console.log('='.repeat(60));
    console.log('ID:', prospect.id);
    console.log('Contact:', prospect.contact_name);
    console.log('Email:', prospect.email);
    console.log('Title:', prospect.contact_title || '-');
    console.log('City:', prospect.city);
    console.log('Country:', prospect.country);
    console.log('Website:', prospect.website);
    console.log('Stage:', prospect.stage);
    console.log('Tier:', prospect.tier);
    console.log('Score:', prospect.score);
    console.log('Lead Source:', prospect.source);
    console.log('Email Verified:', prospect.email_verified);
    console.log('Email Bounced:', prospect.email_bounced);
    console.log('Last Contacted:', prospect.last_contacted_at || 'NEVER');
    console.log('Research Notes:', (prospect.research_notes || '-').substring(0, 200));
  }

  // Also show summary of prospects by stage
  console.log('\n' + '='.repeat(60));
  console.log('PROSPECT SUMMARY BY STAGE');
  console.log('='.repeat(60));

  const { data: stages } = await supabase
    .from('prospects')
    .select('stage')
    .eq('archived', false);

  if (stages) {
    const counts: Record<string, number> = {};
    stages.forEach(s => {
      counts[s.stage] = (counts[s.stage] || 0) + 1;
    });
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
      console.log(`  ${stage}: ${count}`);
    });
  }

  // Count with email
  const { count: withEmail } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('archived', false)
    .not('email', 'is', null);

  console.log(`\nWith email: ${withEmail}`);

  // Count ready to send (enriched/ready stage, has email, not bounced)
  const { data: ready } = await supabase
    .from('prospects')
    .select('id, email')
    .eq('archived', false)
    .in('stage', ['enriched', 'ready'])
    .not('email', 'is', null)
    .eq('email_bounced', false);

  console.log(`Ready to send (enriched/ready, has email, not bounced): ${ready?.length || 0}`);
}

verifyTopProspects();
