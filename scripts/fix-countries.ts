/**
 * Fix country data for Sales Navigator prospects based on their tags
 */

import { supabase } from './lib/supabase';

// Map of tag values to proper country names
const TAG_TO_COUNTRY: Record<string, string> = {
  'anguilla': 'Anguilla',
  'antigua': 'Antigua and Barbuda',
  'antigua and barbuda': 'Antigua and Barbuda',
  'bahamas': 'Bahamas',
  'bahams': 'Bahamas',
  'barbados': 'Barbados',
  'bermuda': 'Bermuda',
  'british virgin islands': 'British Virgin Islands',
  'cayman': 'Cayman Islands',
  'cayman islands': 'Cayman Islands',
  'cuba': 'Cuba',
  'curacao': 'Curaçao',
  'curaçao': 'Curaçao',
  'dominica': 'Dominica',
  'dominican': 'Dominican Republic',
  'dominican republic': 'Dominican Republic',
  'france': 'France',
  'grenada': 'Grenada',
  'guadeloupe': 'Guadeloupe',
  'martinique': 'Martinique',
  'puerto rico': 'Puerto Rico',
  'saint kitts': 'Saint Kitts and Nevis',
  'saint vincent': 'Saint Vincent and the Grenadines',
  'sint maarten': 'Sint Maarten',
  'st lucia': 'Saint Lucia',
  'saint lucia': 'Saint Lucia',
  'turks': 'Turks and Caicos',
  'usvi': 'US Virgin Islands',
};

async function fixCountries() {
  // Get all Sales Navigator prospects with Unknown or null country
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, tags, country')
    .eq('source', 'sales_navigator')
    .or('country.eq.Unknown,country.is.null');

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log(`Found ${prospects?.length} prospects to check`);

  let updated = 0;
  let skipped = 0;

  for (const p of prospects || []) {
    // Find country from tags
    const tags = p.tags || [];
    let newCountry: string | null = null;

    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (TAG_TO_COUNTRY[tagLower]) {
        newCountry = TAG_TO_COUNTRY[tagLower];
        break;
      }
    }

    if (newCountry && newCountry !== p.country) {
      const { error: updateErr } = await supabase
        .from('prospects')
        .update({ country: newCountry })
        .eq('id', p.id);

      if (!updateErr) {
        updated++;
      }
    } else {
      skipped++;
    }
  }

  console.log(`Updated: ${updated}, Skipped (no match): ${skipped}`);

  // Show country distribution after fix
  const { data: byCountry } = await supabase
    .from('prospects')
    .select('country')
    .eq('source', 'sales_navigator');

  const counts: Record<string, number> = {};
  byCountry?.forEach(p => {
    const c = p.country || 'null';
    counts[c] = (counts[c] || 0) + 1;
  });

  console.log('\n=== COUNTRY DISTRIBUTION AFTER FIX ===');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([c, n]) => console.log(`  ${n}: ${c}`));
}

fixCountries();
