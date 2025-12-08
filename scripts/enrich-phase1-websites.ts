/**
 * Phase 1: Find websites for all Sales Navigator prospects
 * Uses Google Places + DuckDuckGo search
 * Runs in parallel batches for speed
 */

import { supabase } from './lib/supabase';

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// Search DuckDuckGo for hotel website
async function searchDuckDuckGo(hotelName: string, country: string): Promise<string | null> {
  try {
    const query = `${hotelName} hotel ${country} official website`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const urlMatches = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];

    const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|tiktok/i;

    for (const match of urlMatches) {
      const url = match.replace(/href="|"/g, '');
      if (!excludePatterns.test(url) && !url.includes('duckduckgo')) {
        if (url.includes('hotel') || url.includes('resort') || url.includes('inn')) {
          return url;
        }
      }
    }

    for (const match of urlMatches.slice(0, 10)) {
      const url = match.replace(/href="|"/g, '');
      if (!excludePatterns.test(url) && !url.includes('duckduckgo') && url.startsWith('http')) {
        return url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// DISABLED: Google Places API - even "free tier" has costs
// Use DuckDuckGo + Grok instead (see enrich-phase1-google-search.ts)
async function searchGooglePlaces(_hotelName: string, _city: string, _country: string): Promise<{ website: string | null; placeId: string | null; address: string | null }> {
  // Google Places API DISABLED to avoid unexpected charges
  // Use the main enrichment script instead: npx ts-node scripts/enrich-phase1-google-search.ts
  console.log('  [SKIPPED] Google Places API disabled - use enrich-phase1-google-search.ts instead');
  return { website: null, placeId: null, address: null };
}

// Find website for a single prospect
async function findWebsite(prospect: { id: string; name: string; city: string | null; country: string | null }): Promise<{ id: string; website: string | null; placeId: string | null; address: string | null; source: string }> {
  // Try Google Places first
  const places = await searchGooglePlaces(prospect.name, prospect.city || '', prospect.country || '');
  if (places.website) {
    return { id: prospect.id, website: places.website, placeId: places.placeId, address: places.address, source: 'google_places' };
  }

  // Fallback to DuckDuckGo
  const ddgWebsite = await searchDuckDuckGo(prospect.name, prospect.country || '');
  if (ddgWebsite) {
    return { id: prospect.id, website: ddgWebsite, placeId: null, address: null, source: 'duckduckgo' };
  }

  return { id: prospect.id, website: null, placeId: null, address: null, source: 'not_found' };
}

async function main() {
  console.log('=== Phase 1: Website Discovery ===\n');

  // Get prospects without websites
  const { data: prospects, count } = await supabase
    .from('prospects')
    .select('id, name, city, country', { count: 'exact' })
    .eq('source', 'sales_navigator')
    .is('website', null)
    .order('created_at', { ascending: true });

  if (!prospects || prospects.length === 0) {
    console.log('No prospects need websites!');
    return;
  }

  console.log(`Found ${count} prospects without websites\n`);

  const BATCH_SIZE = 20;
  const CONCURRENCY = 10;
  let processed = 0;
  let found = 0;
  let googleFound = 0;
  let ddgFound = 0;

  // Process in batches
  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);

    // Process batch with concurrency
    const chunks: typeof batch[] = [];
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      chunks.push(batch.slice(j, j + CONCURRENCY));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(p => findWebsite(p)));

      // Update database
      for (const result of results) {
        processed++;

        if (result.website) {
          found++;
          if (result.source === 'google_places') googleFound++;
          if (result.source === 'duckduckgo') ddgFound++;

          await supabase
            .from('prospects')
            .update({
              website: result.website,
              google_place_id: result.placeId,
              full_address: result.address,
            })
            .eq('id', result.id);
        }
      }
    }

    // Progress update
    const pct = Math.round((processed / prospects.length) * 100);
    console.log(`[${pct}%] Processed: ${processed}/${prospects.length} | Found: ${found} (Google: ${googleFound}, DDG: ${ddgFound})`);

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== Phase 1 Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Websites found: ${found} (${Math.round(found/processed*100)}%)`);
  console.log(`  - Google Places: ${googleFound}`);
  console.log(`  - DuckDuckGo: ${ddgFound}`);
}

main().catch(console.error);
