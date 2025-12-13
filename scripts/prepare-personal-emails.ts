import { supabase } from './lib/supabase';

// Personal email prospects to prepare for sending
const PERSONAL_EMAIL_PROSPECTS = [
  {
    email: 'xavier0037@hotmail.com',
    id: '4ab35dce-5ed4-4d3d-ac77-201adcf532a7',
    notes: 'Xavier Ribot - Owner & GM of Hôtel Restaurant de lUnion. Personal hotmail confirms direct contact.'
  },
  {
    email: 'caroline@lemoulindemoissac.com',
    id: '9ddb9f68-1de8-4a05-98fa-9c9cbd0ab818',
    notes: 'Caroline Carcone - Sales Manager at Le Moulin de Moissac. First name in email domain confirms personal.'
  }
];

async function prepareProspects() {
  console.log('Preparing personal email prospects for sending...\n');

  for (const p of PERSONAL_EMAIL_PROSPECTS) {
    // Update to enriched stage
    const { error } = await supabase
      .from('prospects')
      .update({
        stage: 'enriched',
        tier: 'warm',  // Upgrade tier - personal emails are valuable
        notes: p.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', p.id);

    if (error) {
      console.error(`Failed to update ${p.email}:`, error);
    } else {
      console.log(`✓ Updated ${p.email} to enriched/warm`);
    }
  }

  // Also find other prospects with emails that could be sent
  // These are non-generic emails from contacts
  console.log('\n=== SEARCHING FOR MORE SENDABLE PROSPECTS ===\n');

  // Get prospects in 'new' stage with email and contact_name
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name, email, contact_name, stage, city, country')
    .eq('archived', false)
    .eq('stage', 'new')
    .not('email', 'is', null)
    .not('contact_name', 'is', null);

  if (!prospects) {
    console.log('No prospects found');
    return;
  }

  const GENERIC = ['info', 'contact', 'reserv', 'recep', 'book', 'hello', 'hi', 'support',
    'sales', 'admin', 'office', 'team', 'help', 'service', 'hotel', 'hola', 'front', 'desk',
    'resa', 'aide', 'guest', 'marketing', 'events', 'spa', 'bar', 'restaurant', 'concierge',
    'direccion', 'gerencia', 'management', 'comercial', 'groups', 'mice', 'corporate',
    'enquir', 'mail', 'general', 'welcome', 'stay', 'noreply', 'no-reply', 'billing'];

  const nonGeneric = prospects.filter(p => {
    const local = (p.email || '').toLowerCase().split('@')[0];
    return !GENERIC.some(g => local.startsWith(g));
  });

  console.log(`Non-generic emails in 'new' stage: ${nonGeneric.length}`);

  // Show sample
  console.log('\nSample (first 20):');
  nonGeneric.slice(0, 20).forEach(p => {
    const name = (p.name || '').substring(0, 25).padEnd(25);
    const contact = (p.contact_name || '').substring(0, 20).padEnd(20);
    const loc = `${p.city || '-'}, ${p.country || '-'}`.substring(0, 20);
    console.log(`  ${name} | ${contact} | ${p.email} | ${loc}`);
  });

  console.log('\nDone!');
}

prepareProspects();
