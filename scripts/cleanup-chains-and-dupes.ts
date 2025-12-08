/**
 * Clean up Sales Navigator prospects:
 * 1. Remove big hotel chains (Hilton, Marriott, Accor, IHG, etc.)
 * 2. Remove duplicates based on company name + contact name
 */

import { supabase } from './lib/supabase';

// Big hotel chains to remove (we want independent hotels)
const CHAINS_TO_REMOVE = [
  'hilton',
  'marriott',
  'hyatt',
  'ihg',
  'accor',
  'novotel',
  'sofitel',
  'ibis',
  'mercure',
  'pullman',
  'radisson',
  'wyndham',
  'best western',
  'choice hotels',
  'four seasons',
  'ritz carlton',
  'ritz-carlton',
  'intercontinental',
  'crowne plaza',
  'holiday inn',
  'sheraton',
  'westin',
  'w hotels',
  'doubletree',
  'hampton inn',
  'embassy suites',
  'fairfield',
  'courtyard',
  'residence inn',
  'springhill',
  'aloft',
  'element',
  'moxy',
  'le méridien',
  'le meridien',
  'st regis',
  'st. regis',
  'jw marriott',
  'autograph collection',
  'tribute portfolio',
  'design hotels',
  'luxury collection',
  'w hotel',
  'edition',
  'park hyatt',
  'grand hyatt',
  'andaz',
  'thompson',
  'kimpton',
  'curio',
  'tapestry',
  'canopy',
  'club med',
];

async function cleanup() {
  console.log('=== SALES NAVIGATOR CLEANUP ===\n');

  // Step 1: Count current prospects
  const { count: totalBefore } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'sales_navigator');
  console.log(`Total Sales Navigator prospects before: ${totalBefore}`);

  // Step 2: Find and delete chain hotel prospects
  console.log('\nFinding chain hotel prospects...');

  let chainDeleted = 0;
  for (const chain of CHAINS_TO_REMOVE) {
    // Delete prospects where company name contains chain name
    const { data: deleted } = await supabase
      .from('prospects')
      .delete()
      .eq('source', 'sales_navigator')
      .ilike('name', `%${chain}%`)
      .select('id');

    if (deleted && deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} prospects with "${chain}" in name`);
      chainDeleted += deleted.length;
    }
  }
  console.log(`Total chain prospects deleted: ${chainDeleted}`);

  // Step 3: Delete corresponding enrichment queue entries for deleted prospects
  console.log('\nCleaning up orphaned enrichment queue entries...');
  const { data: allProspectIds } = await supabase
    .from('prospects')
    .select('id')
    .eq('source', 'sales_navigator');

  const prospectIdSet = new Set(allProspectIds?.map(p => p.id) || []);

  const { data: queueEntries } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('id, prospect_id');

  let orphanedDeleted = 0;
  for (const entry of queueEntries || []) {
    if (!prospectIdSet.has(entry.prospect_id)) {
      await supabase
        .from('sales_nav_enrichment_queue')
        .delete()
        .eq('id', entry.id);
      orphanedDeleted++;
    }
  }
  console.log(`Deleted ${orphanedDeleted} orphaned queue entries`);

  // Step 4: Final count
  const { count: totalAfter } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'sales_navigator');
  console.log(`\nTotal Sales Navigator prospects after: ${totalAfter}`);

  // Step 5: Show country distribution
  const { data: byCountry } = await supabase
    .from('prospects')
    .select('country')
    .eq('source', 'sales_navigator');

  const counts: Record<string, number> = {};
  byCountry?.forEach(p => {
    const c = p.country || 'null';
    counts[c] = (counts[c] || 0) + 1;
  });

  console.log('\n=== COUNTRY DISTRIBUTION ===');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${n}: ${c}`));

  // Step 6: Reset enrichment queue for remaining prospects
  console.log('\nResetting enrichment queue...');
  const { error: resetErr } = await supabase
    .from('sales_nav_enrichment_queue')
    .update({ status: 'pending', error: null, email_found: null, email_verified: false })
    .eq('status', 'completed');

  if (!resetErr) {
    console.log('Reset completed entries to pending for re-processing');
  }

  const { count: pendingCount } = await supabase
    .from('sales_nav_enrichment_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log(`Enrichment queue pending: ${pendingCount}`);
}

cleanup();
