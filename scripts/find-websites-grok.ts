/**
 * Find hotel websites using DuckDuckGo search + Grok AI analysis
 *
 * Two-step process:
 * 1. Search DuckDuckGo for hotel website (free, no API key needed)
 * 2. Use Grok to analyze and pick the best result
 *
 * Run: npx tsx scripts/find-websites-grok.ts [--limit=50] [--dry-run]
 */

import { supabase } from './lib/supabase';

const XAI_API_KEY = process.env.XAI_API_KEY;

if (!XAI_API_KEY) {
  console.error('XAI_API_KEY not set');
  process.exit(1);
}

// ============================================
// DUCKDUCKGO SEARCH (Free, no API key needed)
// ============================================

interface SearchResult {
  url: string;
  title: string;
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: SearchResult[] = [];

    // Extract URLs and titles from DuckDuckGo HTML results
    const linkMatches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi);

    for (const match of linkMatches) {
      let url = match[1];
      const title = match[2].trim();

      // DuckDuckGo wraps URLs - extract the actual URL
      if (url.includes('uddg=')) {
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }
      }

      // Skip excluded domains
      const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|tiktok|google\.com|bing\.com|yahoo\.com/i;
      if (!excludePatterns.test(url) && url.startsWith('http')) {
        results.push({ url, title });
      }

      if (results.length >= 10) break;
    }

    return results;
  } catch {
    return [];
  }
}

interface GrokResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface WebsiteResult {
  website: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
}

async function findWebsiteWithGrok(
  companyName: string,
  location: string,
  contactName: string | null,
  contactTitle: string | null,
  searchResults: SearchResult[]
): Promise<WebsiteResult> {
  // If we have search results, ask Grok to pick the best one
  const hasSearchResults = searchResults.length > 0;

  const searchResultsText = hasSearchResults
    ? `\nSEARCH RESULTS FROM DUCKDUCKGO:\n${searchResults.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}`).join('\n')}\n`
    : '';

  const prompt = `You are a hospitality industry research assistant. Your task is to identify the OFFICIAL WEBSITE for a hotel, resort, campsite, or travel agency.

BUSINESS INFORMATION:
- Business Name: ${companyName}
- Location: ${location}
- Contact Person: ${contactName || 'Not provided'}
- Contact Title: ${contactTitle || 'Not provided'}
${searchResultsText}
INSTRUCTIONS:
${hasSearchResults
    ? `1. Review the search results above
2. Identify which URL is most likely the OFFICIAL website for "${companyName}"
3. The URL MUST be the business's OWN domain (e.g., hotelname.com, resortname.co.uk)
4. The domain should match or closely resemble the business name
5. Common hotel domain patterns: [name].com, [name]hotel.com, hotel[name].com, [name]resort.com`
    : `1. Based on the business name and location, determine the most likely official website URL
2. Use common hotel domain patterns: [name].com, [name]hotel.com, [name].co.uk`}

STRICT EXCLUSIONS - NEVER select URLs from:
- Booking platforms: booking.com, expedia.com, hotels.com, agoda.com, trivago.com, kayak.com, priceline.com
- Review sites: tripadvisor.com, yelp.com, google.com/maps
- Social media: facebook.com, instagram.com, twitter.com, linkedin.com
- Directories: wikipedia.org, crunchbase.com, yellowpages.com
- Generic hotel portals: londonhotelsgb.com, toplondonhotels.net, etc.
- ANY third-party aggregator or directory site

VALID EXAMPLES (own domain):
✓ marriottcourtyard.com - matches business name
✓ seasideresort.co.uk - matches business name with .co.uk
✓ grandhotelrome.com - matches business name + "hotel"
✓ thecrowninn.com - matches business name

INVALID EXAMPLES (third-party):
✗ booking.com/marriott-courtyard - booking platform
✗ tripadvisor.com/hotel-123456 - review site
✗ londonhotelsgb.com/crown-inn - aggregator directory

CONFIDENCE LEVELS:
- "high": Domain directly matches the business name (e.g., "The Grand Hotel" → grandhotel.com)
- "medium": Domain closely matches but with variations (e.g., "The Grand Hotel" → thegrandhotellondon.com)
- "low": Domain seems related but uncertain match
- "none": No valid official website found, or only third-party sites available

RESPONSE FORMAT (JSON only, no explanatory text):
{
  "website": "https://example-hotel.com" or null,
  "confidence": "high" | "medium" | "low" | "none",
  "reasoning": "Brief explanation (max 20 words)"
}

${hasSearchResults ? 'Pick the BEST matching official domain from search results, or return null if all results are third-party sites.' : 'Return null if you cannot determine an official website URL with reasonable confidence.'}`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3-mini',  // Use mini for cost efficiency on simple lookups
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,  // Low temperature for factual lookup
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  Grok API error: ${response.status} - ${error}`);
      return { website: null, confidence: 'none', reasoning: 'API error' };
    }

    const data = await response.json() as GrokResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { website: null, confidence: 'none', reasoning: 'Empty response' };
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`  Could not parse JSON from response: ${content.slice(0, 100)}`);
      return { website: null, confidence: 'none', reasoning: 'Invalid response format' };
    }

    const result = JSON.parse(jsonMatch[0]) as WebsiteResult;

    // Validate the URL isn't from excluded domains
    if (result.website) {
      const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|tiktok|google\.com/i;
      if (excludePatterns.test(result.website)) {
        return { website: null, confidence: 'none', reasoning: 'Returned URL is from excluded domain' };
      }

      // Ensure URL has protocol
      if (!result.website.startsWith('http')) {
        result.website = `https://${result.website}`;
      }
    }

    return result;
  } catch (error) {
    console.error(`  Grok exception:`, error);
    return { website: null, confidence: 'none', reasoning: 'Exception during request' };
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  // Try HEAD first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    if (response.ok || response.status === 403 || response.status === 405) {
      return true;
    }
  } catch {
    // HEAD failed, try GET
  }

  // Fallback to GET request
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    return response.ok || response.status === 403;
  } catch {
    return false;
  }
}

async function findWebsites(dryRun: boolean, limit: number) {
  console.log(`=== WEBSITE FINDER (Grok AI) ${dryRun ? '[DRY RUN]' : ''} ===\n`);

  // Filter for hospitality sources only (hotels, resorts, campsites, travel agents)
  const hospitalitySources = [
    'sales_navigator',    // LinkedIn Sales Nav (mixed but includes hotels)
    'hcareers',          // Hospitality Careers (hotels)
    'hotelcareer',       // Hotel Career (hotels)
    'journaldespalaces', // Luxury hotels
    'hosco',             // Hospitality focused
    'talentshotels',     // Hotels
    'caterer',           // Hospitality
    'hospitalityonline', // Hospitality
  ];

  // Get prospects without websites (hotels/resorts only)
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, city, region, country, contact_name, contact_title, source')
    .eq('archived', false)
    .eq('stage', 'new')
    .is('website', null)
    .not('name', 'is', null)
    .in('source', hospitalitySources)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching prospects:', error);
    return;
  }

  if (!prospects || prospects.length === 0) {
    console.log('No prospects need website discovery');
    return;
  }

  console.log(`Found ${prospects.length} prospects to process\n`);

  let found = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let failed = 0;

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    const progress = `[${i + 1}/${prospects.length}]`;

    // Build location string (city > region > country)
    const location = [prospect.city, prospect.region, prospect.country]
      .filter(Boolean)
      .join(', ');

    console.log(`\n${progress} ${prospect.name}`);
    console.log(`  Location: ${location || 'Unknown'}`);
    console.log(`  Contact: ${prospect.contact_name || 'None'}`);
    console.log(`  Source: ${prospect.source}`);

    if (dryRun) {
      console.log(`  [DRY] Would search for website...`);
      continue;
    }

    // Step 1: Search DuckDuckGo with better location (city first, then country)
    const searchLocation = prospect.city || prospect.country || '';
    const searchQuery = `${prospect.name} ${searchLocation} official website`.trim();
    console.log(`  Searching: "${searchQuery}"`);
    const searchResults = await searchDuckDuckGo(searchQuery);
    console.log(`  Found ${searchResults.length} search results`);

    // Step 2: Use Grok to analyze results
    const result = await findWebsiteWithGrok(
      prospect.name,
      location || 'Unknown',
      prospect.contact_name,
      prospect.contact_title,
      searchResults
    );

    if (result.website && (result.confidence === 'high' || result.confidence === 'medium')) {
      console.log(`  Found: ${result.website} (${result.confidence})`);

      // Verify URL exists
      console.log(`  Verifying URL...`);
      const urlValid = await verifyUrl(result.website);

      if (urlValid) {
        console.log(`  ✓ URL verified!`);

        // Update prospect
        const { error: updateError } = await supabase
          .from('prospects')
          .update({
            website: result.website,
            notes: `Website found by Grok (${result.confidence} confidence, verified): ${result.reasoning}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        if (updateError) {
          console.log(`  ✗ Failed to update: ${updateError.message}`);
          failed++;
        } else {
          found++;
          if (result.confidence === 'high') highConfidence++;
          if (result.confidence === 'medium') mediumConfidence++;
        }
      } else {
        console.log(`  ✗ URL verification failed - not saving`);
        failed++;
      }
    } else if (result.website && result.confidence === 'low') {
      console.log(`  ⚠ Low confidence guess: ${result.website} - not saving`);
      failed++;
    } else {
      console.log(`  ✗ No website found: ${result.reasoning}`);
      failed++;
    }

    // Rate limiting - 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Processed: ${prospects.length}`);
  console.log(`Websites found: ${found}`);
  console.log(`  - High confidence: ${highConfidence}`);
  console.log(`  - Medium confidence: ${mediumConfidence}`);
  console.log(`No website found: ${failed}`);
}

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

findWebsites(dryRun, limit);
