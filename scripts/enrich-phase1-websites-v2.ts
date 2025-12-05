/**
 * Phase 1 v2: Find websites for hotels using multiple strategies
 * 1. Domain guessing (hotelname.com, thehotelname.com, etc)
 * 2. DuckDuckGo search
 * 3. Only process prospects that look like hotels
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bxcwlwglvcqujrdudxkw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3dsd2dsdmNxdWpyZHVkeGt3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4NTIwMiwiZXhwIjoyMDc5ODYxMjAyfQ.bK2ai2Hfhb-Mud3vSItTrE0uzcwY3rbiu8J3UuWiR48'
);

// Generate possible domain names from hotel name
function generateDomainGuesses(hotelName: string): string[] {
  // Clean the name
  let clean = hotelName.toLowerCase()
    .replace(/hotel|resort|spa|inn|lodge|suites|villas|beach|house|club|collection|&|and|the|a|an/gi, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '');

  if (clean.length < 3) {
    clean = hotelName.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const variants = [
    clean,
    'the' + clean,
    clean + 'hotel',
    clean + 'resort',
    'hotel' + clean,
  ];

  const domains: string[] = [];
  for (const v of variants) {
    if (v.length >= 4) {
      domains.push(v + '.com');
      domains.push(v + '.net');
    }
  }

  return domains.slice(0, 6); // Max 6 guesses
}

// Check if a domain resolves and looks like a hotel website
async function checkDomain(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

// Search DuckDuckGo HTML
async function searchDuckDuckGo(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    // Extract result URLs (DuckDuckGo format)
    const resultPattern = /uddg=([^&"]+)/g;
    const matches = html.matchAll(resultPattern);

    const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|tiktok|google\.|duckduckgo/i;

    for (const match of matches) {
      try {
        const url = decodeURIComponent(match[1]);
        if (!excludePatterns.test(url) && url.startsWith('http')) {
          return url;
        }
      } catch {
        continue;
      }
    }

    // Fallback: look for href patterns
    const hrefMatches = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];
    for (const m of hrefMatches.slice(0, 20)) {
      const url = m.replace(/href="|"/g, '');
      if (!excludePatterns.test(url) && !url.includes('duckduckgo') && url.startsWith('http')) {
        return url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Find website for a hotel
async function findWebsite(name: string, country: string): Promise<{ website: string | null; method: string }> {
  // Strategy 1: Domain guessing
  const guesses = generateDomainGuesses(name);
  for (const domain of guesses) {
    if (await checkDomain(domain)) {
      return { website: `https://${domain}`, method: 'domain_guess' };
    }
  }

  // Strategy 2: DuckDuckGo search
  const searchQuery = `"${name}" ${country} official website`;
  const ddgResult = await searchDuckDuckGo(searchQuery);
  if (ddgResult) {
    return { website: ddgResult, method: 'duckduckgo' };
  }

  // Strategy 3: Simpler search
  const simpleQuery = `${name} hotel ${country}`;
  const simpleResult = await searchDuckDuckGo(simpleQuery);
  if (simpleResult) {
    return { website: simpleResult, method: 'duckduckgo_simple' };
  }

  return { website: null, method: 'not_found' };
}

async function main() {
  console.log('=== Phase 1 v2: Smart Website Discovery ===\n');

  // Get hotel-like prospects without websites
  const { data: prospects, count } = await supabase
    .from('prospects')
    .select('id, name, country', { count: 'exact' })
    .eq('source', 'sales_navigator')
    .is('website', null)
    .or('name.ilike.%hotel%,name.ilike.%resort%,name.ilike.%inn%,name.ilike.%lodge%,name.ilike.%villa%,name.ilike.%suites%,name.ilike.%beach%,name.ilike.%spa%,name.ilike.%house%,name.ilike.%palace%,name.ilike.%manor%')
    .order('created_at', { ascending: true })
    .limit(500); // Start with 500

  if (!prospects || prospects.length === 0) {
    console.log('No hotel prospects need websites!');
    return;
  }

  console.log(`Processing ${prospects.length} hotels (filtered from total)\n`);

  const CONCURRENCY = 5;
  let processed = 0;
  let found = 0;
  const methods: Record<string, number> = {};

  // Process in parallel batches
  for (let i = 0; i < prospects.length; i += CONCURRENCY) {
    const batch = prospects.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (p) => {
        const result = await findWebsite(p.name, p.country || '');
        return { id: p.id, name: p.name, ...result };
      })
    );

    // Update database and stats
    for (const result of results) {
      processed++;
      methods[result.method] = (methods[result.method] || 0) + 1;

      if (result.website) {
        found++;
        await supabase
          .from('prospects')
          .update({ website: result.website })
          .eq('id', result.id);

        console.log(`  [FOUND] ${result.name} -> ${result.website} (${result.method})`);
      }
    }

    // Progress
    if (i % 50 === 0) {
      const pct = Math.round((processed / prospects.length) * 100);
      console.log(`\n[${pct}%] Processed: ${processed}/${prospects.length} | Found: ${found}\n`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== Phase 1 v2 Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Found: ${found} (${Math.round(found/processed*100)}%)`);
  console.log('Methods:', methods);
}

main().catch(console.error);
