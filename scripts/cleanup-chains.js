#!/usr/bin/env node
/**
 * Cleanup script to remove big hotel chains from prospects
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Big hotel chains to filter out (case-insensitive matching)
const CHAIN_PATTERNS = [
  // Major international chains
  'marriott', 'hilton', 'hyatt', 'ihg', 'wyndham', 'accor', 'radisson',
  'best western', 'choice hotels', 'four seasons', 'ritz-carlton', 'ritz carlton',
  'sheraton', 'westin', 'w hotel', 'st. regis', 'st regis', 'le meridien',
  'intercontinental', 'crowne plaza', 'holiday inn', 'hampton inn', 'doubletree',
  'embassy suites', 'homewood suites', 'home2 suites', 'tru by hilton',
  'waldorf astoria', 'conrad hotel', 'curio collection', 'tapestry collection',
  'lxr hotels', 'motto by hilton', 'spark by hilton', 'tempo by hilton',

  // Marriott brands
  'courtyard by marriott', 'fairfield inn', 'springhill suites', 'residence inn',
  'towneplace suites', 'ac hotels', 'aloft', 'element hotels', 'moxy hotels',
  'protea hotels', 'autograph collection', 'tribute portfolio', 'gaylord hotels',
  'jw marriott', 'edition hotels', 'the luxury collection', 'delta hotels',

  // IHG brands
  'indigo hotel', 'staybridge', 'candlewood', 'even hotels', 'avid hotels',
  'atwell suites', 'voco hotels', 'regent hotels', 'six senses', 'kimpton',

  // Hyatt brands
  'park hyatt', 'andaz', 'thompson hotels', 'hyatt regency', 'hyatt place',
  'hyatt house', 'hyatt centric', 'caption by hyatt', 'miraval',
  'alila hotels', 'destination hotels', 'joie de vivre', 'unbound collection',

  // Accor brands
  'novotel', 'sofitel', 'pullman', 'mgallery', 'swissotel', 'fairmont',
  'raffles', 'sls hotels', 'mondrian', 'delano', 'movenpick', 'mantis',
  '25hours', 'tribe hotels', 'jo&joe', 'greet', 'ibis', 'mercure', 'adagio',
  'mama shelter', 'orient express', 'rixos', 'banyan tree', 'anantara',

  // Radisson brands
  'radisson blu', 'radisson red', 'radisson collection', 'park plaza',
  'park inn', 'country inn', 'prizeotel',

  // Wyndham brands
  'ramada', 'days inn', 'super 8', 'la quinta', 'baymont', 'microtel',
  'wingate', 'hawthorn suites', 'trademark collection', 'tryp',

  // Other major chains
  'extended stay', 'motel 6', 'studio 6', 'red roof', 'drury hotels',
  'omni hotels', 'loews hotels', 'preferred hotels', 'leading hotels',
  'mandarin oriental', 'peninsula hotels', 'langham', 'rosewood hotels',
  'como hotels', 'belmond', 'aman resorts', 'one&only', 'oetker collection',
  'rocco forte', 'dorchester collection', 'jumeirah', 'kempinski',
  'lotte hotels', 'okura hotels', 'prince hotels', 'taj hotels',
  'oberoi hotels', 'itc hotels', 'leela palaces', 'shangri-la',

  // Corporate/management companies (not independent)
  'marriott international', 'hilton worldwide', 'ihg hotels',
  'accorhotels', 'accor corpo', 'vail resorts', 'trump international',
  'mcr hotels', 'aimbridge', 'highgate hotels', 'crescent hotels',
  'interstate hotels', 'remington hotels', 'sage hospitality',
  'benchmark hospitality', 'destination by hyatt', 'graduate hotels',

  // Non-hotels that shouldn't be in list
  'nyc health', 'hospital', 'university', 'l\'oreal', 'loreal', 'culligan',
  'government', 'jll', 'cvent', 'opentable', 'shiji group', 'orbisk',
  'iproov', 'creation technologies', 'sisters of st', 'excelsior university'
];

async function findChainProspects() {
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, website, email');

  if (error) {
    console.error('Error fetching prospects:', error.message);
    return [];
  }

  const chains = prospects.filter(p => {
    const nameLower = (p.name || '').toLowerCase();
    const websiteLower = (p.website || '').toLowerCase();

    return CHAIN_PATTERNS.some(pattern =>
      nameLower.includes(pattern) || websiteLower.includes(pattern)
    );
  });

  return chains;
}

async function deleteChainProspects(prospects) {
  const ids = prospects.map(p => p.id);

  if (ids.length === 0) {
    console.log('No chain prospects to delete');
    return;
  }

  // Delete related records first
  console.log(`Deleting activities for ${ids.length} prospects...`);
  await supabase.from('activities').delete().in('prospect_id', ids);

  console.log(`Deleting emails for ${ids.length} prospects...`);
  await supabase.from('emails').delete().in('prospect_id', ids);

  console.log(`Deleting ${ids.length} chain prospects...`);
  const { error } = await supabase.from('prospects').delete().in('id', ids);

  if (error) {
    console.error('Error deleting:', error.message);
  } else {
    console.log(`Successfully deleted ${ids.length} chain prospects`);
  }
}

async function main() {
  console.log('Finding chain hotel prospects...\n');

  const chains = await findChainProspects();

  console.log(`Found ${chains.length} chain prospects to delete:\n`);
  chains.forEach(p => console.log(`  - ${p.name}`));

  if (process.argv.includes('--delete')) {
    console.log('\n--- DELETING ---\n');
    await deleteChainProspects(chains);
  } else {
    console.log('\nRun with --delete to remove these prospects');
  }
}

main();
