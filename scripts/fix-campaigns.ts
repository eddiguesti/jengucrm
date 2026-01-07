import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// STRICT email filtering - only truly personal emails
const GENERIC_PREFIXES = [
  'info', 'contact', 'reservations', 'reservation', 'reception', 'booking', 'book',
  'hello', 'support', 'sales', 'admin', 'office', 'accueil', 'enquiries', 'enquiry',
  'mail', 'general', 'team', 'help', 'service', 'welcome', 'stay', 'guest', 'front',
  'frontdesk', 'desk', 'concierge', 'reserva', 'reservas', 'recepcion', 'direccion',
  'gerencia', 'hotel', 'resort', 'spa', 'marketing', 'pr', 'press', 'media', 'jobs',
  'careers', 'hr', 'recruitment', 'legal', 'finance', 'accounting', 'billing', 'invoice'
];

function isPersonalEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;

  const lowerEmail = email.toLowerCase().trim();

  // No URL encoding
  if (lowerEmail.includes('%')) return false;

  const [username, domain] = lowerEmail.split('@');

  // Username checks
  if (!username || username.length < 3) return false;

  // Check if starts with generic prefix
  for (const prefix of GENERIC_PREFIXES) {
    if (username === prefix || username.startsWith(prefix + '.') ||
        username.startsWith(prefix + '_') || username.startsWith(prefix + '-')) {
      return false;
    }
  }

  // Domain checks
  if (!domain || !domain.includes('.')) return false;

  // Must look like a personal name (has a dot or typical name patterns)
  const hasNamePattern = username.includes('.') ||
                         /^[a-z]{2,}[a-z]$/.test(username) ||  // firstname
                         /^[a-z]\.[a-z]+$/.test(username) ||   // f.lastname
                         /^[a-z]+\d{0,2}$/.test(username);     // name or name99

  return hasNamePattern || username.length >= 5;
}

async function fixCampaigns() {
  console.log('\n' + '='.repeat(60));
  console.log('FIXING CAMPAIGNS - Strict Personal Email Filter');
  console.log('='.repeat(60));

  // 1. Clear ALL existing campaign leads (start fresh)
  console.log('\nStep 1: Clearing all existing campaign leads...');
  const { error: clearError } = await supabase
    .from('campaign_leads')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (clearError) {
    console.log('Error clearing leads:', clearError.message);
  } else {
    console.log('   Cleared all existing leads');
  }

  // 2. Get all active campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('active', true);

  if (!campaigns || campaigns.length === 0) {
    console.log('No active campaigns found');
    return;
  }

  console.log('\nStep 2: Found ' + campaigns.length + ' active campaigns');

  // 3. Find prospects with TRULY personal emails
  console.log('\nStep 3: Finding prospects with personal emails...');

  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name, email, contact_name, stage')
    .not('email', 'is', null)
    .eq('archived', false)
    .in('stage', ['new', 'enriched', 'researching'])
    .limit(500);

  if (!prospects) {
    console.log('No prospects found');
    return;
  }

  const validProspects = prospects.filter(p => isPersonalEmail(p.email));

  console.log('   Total prospects checked: ' + prospects.length);
  console.log('   With personal emails: ' + validProspects.length);

  if (validProspects.length === 0) {
    console.log('\n   No prospects with valid personal emails!');
    console.log('   Need to run enrichment to find more emails.');
    return;
  }

  // Show sample of valid emails
  console.log('\n   Sample valid emails:');
  validProspects.slice(0, 5).forEach(p => {
    console.log('   - ' + p.email);
  });

  // 4. Assign to campaigns (round-robin)
  console.log('\nStep 4: Assigning prospects to campaigns...');

  let assigned = 0;
  for (let i = 0; i < validProspects.length; i++) {
    const prospect = validProspects[i];
    const campaign = campaigns[i % campaigns.length];

    const { error: leadError } = await supabase
      .from('campaign_leads')
      .insert({
        campaign_id: campaign.id,
        prospect_id: prospect.id,
        status: 'active',
        current_step: 0,
        next_email_at: new Date().toISOString(),
        added_by: 'fix-script-v2',
      });

    if (!leadError) {
      assigned++;
    }
  }

  console.log('   Assigned ' + assigned + ' prospects');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('   Active campaigns: ' + campaigns.length);
  console.log('   Prospects assigned: ' + assigned);
  console.log('   Per campaign: ~' + Math.floor(assigned / campaigns.length));
  console.log('='.repeat(60) + '\n');
}

fixCampaigns().catch(console.error);
