/**
 * Enrichment Worker - Find websites and emails for prospects
 * Runs in Cloudflare Workers (cloud) - no computer needed!
 *
 * Endpoints:
 * - POST /enrich/websites - Find websites for prospects without them
 * - POST /enrich/emails - Find emails for prospects with websites
 * - GET /enrich/status - Check enrichment progress
 *
 * Triggered by cron: Every 5 minutes during off-hours (to not conflict with email sending)
 */

import { Env } from '../types';
import * as RetryQueue from '../lib/retry-queue';

interface SearchResult {
  url: string;
  title: string;
}

interface WebsiteResult {
  website: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
}

interface ScrapedData {
  emails: string[];
  phones: string[];
  teamMembers: { name: string; title: string; email?: string }[];
  propertyInfo: {
    starRating?: number;
    roomCount?: string;
    chainBrand?: string;
    description?: string;
    amenities?: string[];
  };
  linkedinUrl?: string;
  instagramUrl?: string;
}

/**
 * Main enrichment handler
 */
export async function handleEnrich(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/enrich/websites' && request.method === 'POST') {
    return enrichWebsites(env);
  }

  if (path === '/enrich/emails' && request.method === 'POST') {
    return enrichEmails(env);
  }

  if (path === '/enrich/status') {
    return getEnrichmentStatus(env);
  }

  // Real-time progress endpoint for SSE streaming
  if (path === '/enrich/progress') {
    return getEnrichmentProgress(env);
  }

  // Reset endpoint - cancel stuck enrichment runs
  if (path === '/enrich/reset' && request.method === 'POST') {
    await env.KV_CACHE.delete(PROGRESS_KEY);
    return Response.json({ success: true, message: 'Enrichment progress reset' });
  }

  // Lookup endpoint - return best email for a single contact
  // Useful for enriching CSV rows without inserting into D1 first
  if (path === '/enrich/lookup-email' && request.method === 'POST') {
    return lookupEmail(request, env);
  }

  // Auto-enrich endpoint - does both
  if (path === '/enrich/auto' && request.method === 'POST') {
    // Parse limit from request body
    let limit = 70; // Default
    try {
      const body = await request.json() as { limit?: number };
      if (body.limit && body.limit > 0) {
        limit = Math.min(body.limit, 200); // Cap at 200
      }
    } catch {
      // Use default if body parsing fails
    }
    return autoEnrich(env, limit);
  }

  // Debug endpoint - test DDG search
  if (path === '/enrich/debug') {
    return debugSearch(env);
  }

  // Debug Brave search specifically
  if (path === '/enrich/debug-brave') {
    const braveConfig = getNextBraveKey(env);
    const debug: Record<string, unknown> = {
      braveKeysAvailable: !!braveConfig,
      keyIndex: braveKeyIndex,
    };

    if (braveConfig) {
      const testQuery = 'Hilton London official website';
      debug.testQuery = testQuery;
      debug.apiKeyPresent = !!braveConfig.apiKey;
      debug.apiKeyLength = braveConfig.apiKey?.length || 0;
      debug.proxyUrl = braveConfig.proxyUrl || 'none';

      try {
        const results = await searchBrave(testQuery, braveConfig.apiKey, braveConfig.proxyUrl);
        debug.resultCount = results.length;
        debug.results = results.slice(0, 3); // First 3 results
      } catch (error) {
        debug.error = String(error);
      }
    }

    return Response.json(debug);
  }

  // Debug Google Search - check usage and test API
  if (path === '/enrich/debug-google') {
    const debug: Record<string, unknown> = {
      googleConfigured: !!env.GOOGLE_SEARCH_API_KEY && !!env.GOOGLE_SEARCH_CX,
      dailyLimit: GOOGLE_DAILY_LIMIT,
    };

    const count = await getGoogleSearchCount(env);
    debug.usedToday = count;
    debug.remaining = Math.max(0, GOOGLE_DAILY_LIMIT - count);
    debug.canUse = count < GOOGLE_DAILY_LIMIT && !!env.GOOGLE_SEARCH_API_KEY;

    // Test search if requested and under limit
    const url = new URL(request.url);
    const testSearch = url.searchParams.get('test') === 'true';
    if (testSearch && debug.canUse) {
      const testQuery = 'Hilton London official website';
      debug.testQuery = testQuery;

      try {
        const results = await searchGoogle(testQuery, env);
        debug.resultCount = results.length;
        debug.results = results.slice(0, 3); // First 3 results
        debug.newUsedCount = await getGoogleSearchCount(env);
      } catch (error) {
        debug.error = String(error);
      }
    }

    return Response.json(debug);
  }

  // Debug single prospect
  if (path === '/enrich/debug-prospect') {
    return debugProspect(env);
  }

  // Debug Google Boost - see what prospects are available
  if (path === '/enrich/debug-boost') {
    const googleCount = await getGoogleSearchCount(env);
    const remaining = GOOGLE_DAILY_LIMIT - googleCount;

    const query = 'select=id,name,city,country&archived=eq.false&website=is.null&name=not.is.null&order=updated_at.asc';
    const rawProspects = await queryProspectsFromSupabase(env, query, 100);
    const filtered = rawProspects.filter(p => !isExcludedChain(p.name));

    return Response.json({
      googleUsed: googleCount,
      googleRemaining: remaining,
      rawProspectsCount: rawProspects.length,
      afterChainFilter: filtered.length,
      chainsFiltered: rawProspects.length - filtered.length,
      sampleProspects: filtered.slice(0, 5).map(p => ({ name: p.name, city: p.city })),
      sampleChains: rawProspects.filter(p => isExcludedChain(p.name)).slice(0, 5).map(p => p.name),
    });
  }

  return new Response('Not found', { status: 404 });
}

/**
 * Progress tracking interface
 */
interface EnrichmentProgress {
  isRunning: boolean;
  type: 'websites' | 'emails' | 'auto' | null;
  processed: number;
  total: number;
  found: number;
  websitesFound: number;
  emailsFound: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

const PROGRESS_KEY = 'enrichment:progress';
const GOOGLE_DAILY_COUNT_KEY = 'google_search:daily_count';
const GOOGLE_DAILY_LIMIT = 100; // Hard limit - never exceed

/**
 * Get current enrichment progress (for real-time UI updates)
 */
async function getEnrichmentProgress(env: Env): Promise<Response> {
  try {
    const progressJson = await env.KV_CACHE.get(PROGRESS_KEY);
    if (progressJson) {
      const progress: EnrichmentProgress = JSON.parse(progressJson);
      return Response.json(progress, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }
    return Response.json({
      isRunning: false,
      type: null,
      processed: 0,
      total: 0,
      found: 0,
      websitesFound: 0,
      emailsFound: 0,
      startedAt: null,
      lastUpdatedAt: null,
    } as EnrichmentProgress, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error getting progress:', error);
    return Response.json({ isRunning: false, type: null, processed: 0, total: 0, found: 0, websitesFound: 0, emailsFound: 0, startedAt: null, lastUpdatedAt: null });
  }
}

/**
 * Update enrichment progress in KV (called during batch processing)
 */
async function updateProgress(
  env: Env,
  update: Partial<EnrichmentProgress>
): Promise<void> {
  try {
    const existingJson = await env.KV_CACHE.get(PROGRESS_KEY);
    const existing: EnrichmentProgress = existingJson
      ? JSON.parse(existingJson)
      : { isRunning: false, type: null, processed: 0, total: 0, found: 0, websitesFound: 0, emailsFound: 0, startedAt: null, lastUpdatedAt: null };

    const updated: EnrichmentProgress = {
      ...existing,
      ...update,
      lastUpdatedAt: new Date().toISOString(),
    };

    // TTL of 5 minutes - auto-cleanup if worker crashes
    await env.KV_CACHE.put(PROGRESS_KEY, JSON.stringify(updated), { expirationTtl: 300 });
  } catch (error) {
    console.error('Error updating progress:', error);
  }
}

/**
 * Sync prospect updates to Supabase (called after D1 updates)
 */
async function syncToSupabase(
  env: Env,
  prospectId: string,
  updates: {
    website?: string;
    email?: string;
    stage?: string;
    tier?: string;
    linkedin_url?: string;
    instagram_url?: string;
    research_notes?: string;
  }
): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return; // Supabase not configured
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/prospects?id=eq.${prospectId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!response.ok) {
      console.error(`Supabase sync failed for ${prospectId}:`, await response.text());
    }
  } catch (error) {
    console.error(`Supabase sync error for ${prospectId}:`, error);
  }
}

/**
 * Query prospects from Supabase (single source of truth)
 */
interface SupabaseProspect {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  contact_name: string | null;
  contact_title: string | null;
  website: string | null;
  contact_email: string | null;
  stage: string;
  lead_source: string | null;
}

async function queryProspectsFromSupabase(
  env: Env,
  query: string,
  limit: number
): Promise<SupabaseProspect[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase not configured');
    return [];
  }

  try {
    const url = `${env.SUPABASE_URL}/rest/v1/prospects?${query}&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Supabase query failed:`, await response.text());
      return [];
    }

    return await response.json() as SupabaseProspect[];
  } catch (error) {
    console.error('Supabase query error:', error);
    return [];
  }
}

/**
 * Debug search functionality
 */
async function debugSearch(env: Env): Promise<Response> {
  const debug: Record<string, unknown> = {};

  // Test DDG search via ScraperAPI
  const testQuery = 'Hilton London official website';
  debug.query = testQuery;
  debug.scraperApiAvailable = !!env.SCRAPERAPI_KEY;

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(testQuery)}`;

    let response: Response;
    if (env.SCRAPERAPI_KEY) {
      const scraperUrl = `https://api.scraperapi.com?api_key=${env.SCRAPERAPI_KEY}&url=${encodeURIComponent(ddgUrl)}`;
      response = await fetch(scraperUrl);
      debug.method = 'ScraperAPI';
    } else {
      response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      debug.method = 'Direct';
    }

    debug.ddgStatus = response.status;
    debug.ddgOk = response.ok;

    if (response.ok) {
      const html = await response.text();
      debug.htmlLength = html.length;
      debug.htmlSnippet = html.substring(0, 500);

      // Check for results
      const linkMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi)];
      debug.matchCount = linkMatches.length;

      if (linkMatches.length > 0) {
        debug.firstMatch = {
          href: linkMatches[0][1],
          title: linkMatches[0][2],
        };
      }
    }
  } catch (error) {
    debug.ddgError = String(error);
  }

  // Test Grok API
  if (env.GROK_API_KEY) {
    debug.grokKeyPresent = true;
    try {
      const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-3-mini',
          messages: [{ role: 'user', content: 'Say "test ok" in JSON format: {"status": "..."}' }],
          temperature: 0.1,
          max_tokens: 50,
        }),
      });
      debug.grokStatus = grokResponse.status;
      if (grokResponse.ok) {
        const grokData = await grokResponse.json();
        debug.grokResponse = grokData;
      } else {
        debug.grokError = await grokResponse.text();
      }
    } catch (error) {
      debug.grokError = String(error);
    }
  } else {
    debug.grokKeyPresent = false;
  }

  return Response.json(debug, { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Debug a single prospect enrichment
 */
async function debugProspect(env: Env): Promise<Response> {
  // Get one hotel prospect
  const result = await env.DB.prepare(`
    SELECT id, name, city, country, contact_name, contact_title
    FROM prospects
    WHERE archived = 0
      AND website IS NULL
      AND name IS NOT NULL
      AND (name LIKE '%Hotel%' OR name LIKE '%Resort%' OR name LIKE '%Inn%')
    ORDER BY
      CASE WHEN lead_source = 'sales_navigator' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `).first();

  if (!result) {
    return Response.json({ error: 'No prospect found' });
  }

  const debug: Record<string, unknown> = {
    prospect: result,
  };

  // Search DDG - use city if available
  const location = (result.city as string) || (result.country as string) || '';
  const searchQuery = `${result.name} ${location} official website`;
  debug.searchQuery = searchQuery;

  const searchResults = await searchDuckDuckGo(searchQuery, env.SCRAPERAPI_KEY);
  debug.searchResultsCount = searchResults.length;
  debug.searchResults = searchResults.slice(0, 5);

  if (searchResults.length === 0) {
    return Response.json(debug);
  }

  // Grok analysis
  const grokResult = await analyzeWithGrok(
    result.name as string,
    location,
    result.contact_name as string | null,
    searchResults,
    env
  );
  debug.grokResult = grokResult;

  // URL verification
  if (grokResult.website) {
    const isValid = await verifyUrl(grokResult.website);
    debug.urlValid = isValid;
  }

  return Response.json(debug);
}

/**
 * Auto enrichment - runs websites then emails (faster with parallel processing)
 * ALSO: Uses remaining Google quota to find hard-to-reach prospects
 */
async function autoEnrich(env: Env, limit: number = 70): Promise<Response> {
  // Reset API counters for this batch
  googleApiErrors = 0;
  googleApiSuccesses = 0;

  const results = {
    websites: { processed: 0, found: 0 },
    emails: { processed: 0, found: 0 },
    googleBoost: { processed: 0, found: 0 },
  };

  // Split limit: 70% websites, 30% emails
  const websiteLimit = Math.max(1, Math.round(limit * 0.7));
  const emailLimit = Math.max(1, limit - websiteLimit);

  // Mark as running
  await updateProgress(env, {
    isRunning: true,
    type: 'auto',
    processed: 0,
    total: limit,
    found: 0,
    websitesFound: 0,
    emailsFound: 0,
    startedAt: new Date().toISOString(),
  });

  try {
    // Step 1: Find websites (uses tiered strategy: Grok → DDG → Brave → Google)
    const websiteResult = await enrichWebsitesBatch(env, websiteLimit);
    results.websites = websiteResult;

    // Update progress after websites
    await updateProgress(env, {
      processed: websiteResult.processed,
      found: websiteResult.found,
      websitesFound: websiteResult.found,
      type: 'emails', // Moving to emails phase
    });

    // Step 2: Find emails
    const emailResult = await enrichEmailsBatch(env, emailLimit);
    results.emails = emailResult;

    // Step 3: USE REMAINING GOOGLE QUOTA progressively
    // Process 10 per batch (Cloudflare has 30s timeout, 2s per call = max 15 calls)
    // Over 72 cron runs per day, this ensures we use all 100 Google searches
    const googleRemaining = GOOGLE_DAILY_LIMIT - await getGoogleSearchCount(env);
    if (googleRemaining > 0 && env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_CX) {
      const boostLimit = Math.min(10, googleRemaining); // Max 10 per batch to fit in timeout
      console.log(`[Google Boost] ${googleRemaining} remaining, processing ${boostLimit} this batch`);
      const boostResult = await googleBoostBatch(env, boostLimit);
      results.googleBoost = boostResult;
    }

    // Mark as complete
    await updateProgress(env, {
      isRunning: false,
      processed: websiteResult.processed + emailResult.processed,
      found: websiteResult.found + emailResult.found,
      websitesFound: websiteResult.found,
      emailsFound: emailResult.found,
    });

    const finalGoogleCount = await getGoogleSearchCount(env);
    return Response.json({
      success: true,
      message: 'Auto enrichment batch complete',
      results,
      googleStats: {
        used: finalGoogleCount,
        remaining: GOOGLE_DAILY_LIMIT - finalGoogleCount,
        apiErrors: googleApiErrors,
        apiSuccesses: googleApiSuccesses,
      },
    });
  } catch (error) {
    // Mark as stopped on error
    await updateProgress(env, { isRunning: false });
    throw error;
  }
}

/**
 * Find websites for prospects without them
 */
async function enrichWebsites(env: Env): Promise<Response> {
  const result = await enrichWebsitesBatch(env, 15);  // Batch of 15 with 3-key rotation
  return Response.json({
    success: true,
    message: `Processed ${result.processed} prospects, found ${result.found} websites`,
    ...result,
  });
}

// Major hotel chains to exclude from enrichment (we want independent/boutique hotels)
const EXCLUDED_CHAINS = [
  // Major global chains
  'marriott', 'hilton', 'hyatt', 'ihg', 'accor', 'wyndham', 'choice hotels',
  'best western', 'radisson', 'carlson', 'intercontinental', 'holiday inn',
  'crowne plaza', 'kimpton', 'fairmont', 'sofitel', 'novotel', 'ibis',
  'mercure', 'pullman', 'mgallery', 'mövenpick', 'swissôtel',
  // Marriott brands
  'sheraton', 'westin', 'w hotel', 'st. regis', 'st regis', 'ritz-carlton',
  'ritz carlton', 'jw marriott', 'courtyard', 'residence inn', 'springhill',
  'fairfield', 'towneplace', 'four points', 'aloft', 'element', 'moxy',
  'autograph', 'tribute', 'delta hotels', 'gaylord', 'le méridien', 'le meridien',
  'ac hotels', 'renaissance',
  // Hilton brands
  'doubletree', 'embassy suites', 'hampton inn', 'hampton by hilton', 'hilton garden',
  'homewood suites', 'home2 suites', 'canopy by hilton', 'curio', 'tapestry',
  'lxr hotels', 'signia', 'motto', 'spark', 'tempo',
  // IHG brands
  'intercontinental', 'regent', 'six senses', 'vignette', 'kimpton',
  'hotel indigo', 'even hotels', 'hualuxe', 'crowne plaza', 'voco',
  'holiday inn express', 'staybridge', 'atwell', 'candlewood',
  // Hyatt brands
  'park hyatt', 'grand hyatt', 'andaz', 'alila', 'thompson', 'hyatt regency',
  'hyatt centric', 'hyatt place', 'hyatt house', 'caption', 'miraval',
  // Others
  'virgin hotels', 'virgin hotel', 'loews', 'omni', 'langham', 'peninsula',
  'shangri-la', 'mandarin oriental', 'four seasons', 'aman', 'rosewood',
  'rocco forte', 'kempinski', 'jumeirah', 'oberoi', 'taj hotels',
  // Budget chains
  'motel 6', 'super 8', 'days inn', 'la quinta', 'red roof', 'econolodge',
  'comfort inn', 'comfort suites', 'quality inn', 'sleep inn', 'clarion',
  'travelodge', 'ramada', 'howard johnson', 'microtel', 'wingate',
  'baymont', 'hawthorn', 'tryp', 'americinn',
  // Fast food (keep existing)
  'popeyes', 'mcdonald', 'taco bell', 'burger king', 'wendy', 'subway',
  'pizza hut', 'domino', 'kfc', 'chick-fil-a', 'chipotle', 'starbucks',
];

/**
 * Check if a prospect name matches a major hotel chain (case-insensitive)
 */
function isExcludedChain(name: string): boolean {
  const nameLower = name.toLowerCase();
  return EXCLUDED_CHAINS.some(chain => nameLower.includes(chain));
}

async function enrichWebsitesBatch(
  env: Env,
  limit: number
): Promise<{ processed: number; found: number }> {
  // Get prospects without websites from Supabase (single source of truth)
  // Filter: archived=false, website is null, has name
  // Order: sales_navigator first, then by created_at desc
  // Note: Chain filtering done in JavaScript for better control
  const query = 'select=id,name,city,country,contact_name,contact_title&archived=eq.false&website=is.null&name=not.is.null&order=lead_source.desc.nullslast,created_at.desc';

  // Fetch more than needed to account for chain filtering
  const fetchLimit = Math.min(limit * 3, 600);
  const rawProspects = await queryProspectsFromSupabase(env, query, fetchLimit);

  // Filter out major hotel chains (we want independent/boutique hotels)
  const prospects = rawProspects
    .filter(p => !isExcludedChain(p.name))
    .slice(0, limit);

  console.log(`Fetched ${rawProspects.length}, filtered to ${prospects.length} (excluded ${rawProspects.length - prospects.length} chains)`);
  let found = 0;

  console.log(`Processing ${prospects.length} prospects for websites (parallel - 3 Brave keys)`);

  // Process in parallel batches of 3 (matching Brave API key count)
  const PARALLEL_SIZE = 3;
  for (let i = 0; i < prospects.length; i += PARALLEL_SIZE) {
    const batch = prospects.slice(i, i + PARALLEL_SIZE);

    const results = await Promise.all(
      batch.map(async (prospect) => {
        try {
          // Decode HTML entities in name
          const name = (prospect.name as string).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          // Use city for location if available, otherwise country
          const location = (prospect.city as string) || (prospect.country as string) || '';

          const website = await findWebsiteForProspect(
            name,
            location,
            prospect.contact_name as string | null,
            env
          );

          if (website) {
            console.log(`✓ Found: ${name} -> ${website}`);

            // Scrape the website for emails, team members, property info
            const scraped = await scrapeWebsite(website);

            // Build research notes from scraped data
            const researchNotes: string[] = [];
            if (scraped.propertyInfo.description) {
              researchNotes.push(`Description: ${scraped.propertyInfo.description}`);
            }
            if (scraped.propertyInfo.starRating) {
              researchNotes.push(`Star Rating: ${scraped.propertyInfo.starRating}`);
            }
            if (scraped.propertyInfo.roomCount) {
              researchNotes.push(`Rooms: ${scraped.propertyInfo.roomCount}`);
            }
            if (scraped.propertyInfo.chainBrand) {
              researchNotes.push(`Chain: ${scraped.propertyInfo.chainBrand}`);
            }
            if (scraped.propertyInfo.amenities?.length) {
              researchNotes.push(`Amenities: ${scraped.propertyInfo.amenities.join(', ')}`);
            }
            if (scraped.teamMembers.length > 0) {
              researchNotes.push(`Team: ${scraped.teamMembers.map(m => `${m.name} (${m.title})`).join(', ')}`);
            }
            if (scraped.emails.length > 0) {
              researchNotes.push(`Emails found: ${scraped.emails.join(', ')}`);
            }

            // If we found a personal email (not generic like info@, contact@, etc), use it directly
            const genericPrefixes = /^(info|contact|hello|hi|reservations|reception|booking|bookings|support|sales|admin|office|enquiries|enquiry|mail|email|help|team|general|press|media|marketing|hr|jobs|careers|events|feedback|webmaster|privacy|legal|billing|accounts|finance|service|services|customerservice|guest|guestservices|frontdesk|concierge|stay|stays)@/i;
            const personalEmail = scraped.emails.find(e => !genericPrefixes.test(e));

            // Update prospect in Supabase (single source of truth)
            if (personalEmail) {
              console.log(`  ✓ Found email from scraping: ${personalEmail}`);
              await syncToSupabase(env, prospect.id, {
                website,
                email: personalEmail,
                stage: 'enriched',
                tier: 'warm',
                linkedin_url: scraped.linkedinUrl || undefined,
                instagram_url: scraped.instagramUrl || undefined,
                research_notes: researchNotes.join('\n') || undefined,
              });
            } else {
              await syncToSupabase(env, prospect.id, {
                website,
                linkedin_url: scraped.linkedinUrl || undefined,
                instagram_url: scraped.instagramUrl || undefined,
                research_notes: researchNotes.join('\n') || undefined,
              });
            }
            return true;  // Found website
          } else {
            console.log(`✗ Not found: ${name}`);
            // Record failure for retry
            await RetryQueue.recordFailure(
              env,
              'find_website',
              prospect.id as string,
              name,
              'No website found after search',
              { city: prospect.city, country: prospect.country }
            );
            return false;  // Not found
          }
        } catch (error) {
          console.error(`Error for ${prospect.name}:`, error);
          // Record failure for retry
          await RetryQueue.recordFailure(
            env,
            'find_website',
            prospect.id as string,
            prospect.name as string,
            error instanceof Error ? error.message : String(error),
            { city: prospect.city, country: prospect.country }
          );
          return false;
        }
      })
    );

    // Count successful finds from this batch
    found += results.filter(Boolean).length;

    // Update progress after each mini-batch for real-time UI feedback
    await updateProgress(env, {
      processed: Math.min(i + PARALLEL_SIZE, prospects.length),
      found,
      websitesFound: found,
    });

    // Rate limit: wait between batches (3 keys = 3 req/sec, so 1s between batches)
    if (i + PARALLEL_SIZE < prospects.length) {
      await sleep(1100);
    }
  }

  console.log(`Batch complete: found ${found}/${prospects.length} websites`);
  return { processed: prospects.length, found };
}

/**
 * GOOGLE BOOST: Use remaining Google quota to find hard-to-reach prospects
 * This runs AFTER the main enrichment and uses Google Search directly (skipping other tiers)
 * Ensures we use ALL 100 Google searches per day
 */
async function googleBoostBatch(
  env: Env,
  limit: number
): Promise<{ processed: number; found: number }> {
  // Check how many Google searches we have left
  const currentCount = await getGoogleSearchCount(env);
  const remaining = Math.max(0, GOOGLE_DAILY_LIMIT - currentCount);

  if (remaining === 0) {
    console.log('[Google Boost] No Google quota remaining today');
    return { processed: 0, found: 0 };
  }

  const batchSize = Math.min(limit, remaining);
  console.log(`[Google Boost] Using up to ${batchSize} of ${remaining} remaining Google searches`);

  // Fetch LOTS of prospects - we'll process them until Google quota is exhausted
  // Even if we need to go through 500 prospects to use all 100 Google searches
  const query = 'select=id,name,city,country,contact_name&archived=eq.false&website=is.null&name=not.is.null&order=updated_at.asc';
  const fetchLimit = Math.max(batchSize * 5, 500); // Fetch plenty to ensure we use all quota
  const rawProspects = await queryProspectsFromSupabase(env, query, fetchLimit);

  console.log(`[Google Boost] Fetched ${rawProspects.length} raw prospects from Supabase`);

  // Filter out chains - DON'T limit, we'll process until Google quota exhausted
  const prospects = rawProspects.filter(p => !isExcludedChain(p.name));
  console.log(`[Google Boost] After chain filter: ${prospects.length} prospects (filtered out ${rawProspects.length - prospects.length} chains)`);

  if (prospects.length === 0) {
    console.log('[Google Boost] No more prospects needing websites after chain filter');
    return { processed: 0, found: 0 };
  }

  console.log(`[Google Boost] ${prospects.length} prospects available, will use all ${remaining} Google searches`);

  let found = 0;
  let processed = 0;
  let errors: string[] = [];

  // Process one at a time to maximize Google usage
  for (const prospect of prospects) {
    // Check if we still have Google quota
    const currentCount = await getGoogleSearchCount(env);
    if (currentCount >= GOOGLE_DAILY_LIMIT) {
      console.log(`[Google Boost] Google quota exhausted at ${currentCount}/${GOOGLE_DAILY_LIMIT}`);
      break;
    }

    const name = prospect.name as string;
    const location = (prospect.city as string) || (prospect.country as string) || '';
    const searchQuery = `${name} ${location} official website`;

    try {
      console.log(`[Google Boost] Searching: ${name} (Google: ${currentCount}/${GOOGLE_DAILY_LIMIT})`);

      // Use Google Search directly (skip other tiers)
      const searchResults = await searchGoogle(searchQuery, env);

      if (searchResults.length > 0) {
        const grokResult = await analyzeWithGrok(
          name,
          location,
          prospect.contact_name as string | null,
          searchResults,
          env
        );

        if (grokResult.website && grokResult.confidence !== 'none') {
          const isValid = await verifyUrl(grokResult.website);
          if (isValid) {
            console.log(`[Google Boost] Found: ${name} -> ${grokResult.website}`);
            await syncToSupabase(env, prospect.id, { website: grokResult.website });
            found++;
          }
        }
      }
      processed++;
    } catch (error) {
      const errMsg = `${name}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Google Boost] Error: ${errMsg}`);
      errors.push(errMsg);
      processed++;
    }

    // Delay between requests (2 seconds to avoid Google rate limiting)
    await sleep(2000);
  }

  console.log(`[Google Boost] Complete: found ${found}/${processed} websites, ${errors.length} errors, googleApiErrors=${googleApiErrors}, googleApiSuccesses=${googleApiSuccesses}`);
  return { processed, found, errors: errors.slice(0, 5), googleApiErrors, googleApiSuccesses } as { processed: number; found: number };
}

/**
 * Find emails for prospects with websites but no email
 */
async function enrichEmails(env: Env): Promise<Response> {
  const result = await enrichEmailsBatch(env, 10);
  return Response.json({
    success: true,
    message: `Processed ${result.processed} prospects, found ${result.found} emails`,
    ...result,
  });
}

async function enrichEmailsBatch(
  env: Env,
  limit: number
): Promise<{ processed: number; found: number }> {
  // Get prospects with websites but no email from Supabase (single source of truth)
  // Note: Chain filtering done in JavaScript for consistency with website enrichment
  const query = 'select=id,name,website,contact_name&archived=eq.false&stage=not.in.(contacted,engaged,meeting,won,lost)&website=not.is.null&contact_email=is.null&contact_name=not.is.null&order=lead_source.desc.nullslast,created_at.desc';

  // Fetch more than needed to account for chain filtering
  const fetchLimit = Math.min(limit * 3, 300);
  const rawProspects = await queryProspectsFromSupabase(env, query, fetchLimit);

  // Filter out major hotel chains (we want independent/boutique hotels)
  const prospects = rawProspects
    .filter(p => !isExcludedChain(p.name))
    .slice(0, limit);

  console.log(`Email batch: Fetched ${rawProspects.length}, filtered to ${prospects.length} (excluded chains)`);
  let found = 0;

  console.log(`Processing ${prospects.length} prospects for emails (parallel)`);

  // Process in parallel batches of 3 (MillionVerifier is more rate-limited)
  const PARALLEL_SIZE = 3;
  for (let i = 0; i < prospects.length; i += PARALLEL_SIZE) {
    const batch = prospects.slice(i, i + PARALLEL_SIZE);

    const results = await Promise.all(
      batch.map(async (prospect) => {
        try {
          const website = prospect.website as string;
          const contactName = prospect.contact_name as string;

          // Try scraping first (cheap + often yields direct emails)
          const scrape = await scrapeWebsite(website);
          const scrapedPersonal = pickPersonalEmail(scrape.emails);

          const email =
            scrapedPersonal ||
            (await findEmailForProspect(
              website,
              contactName,
              env
            ));

          if (email) {
            console.log(`✓ Found email: ${prospect.name} -> ${email}`);
            // Update Supabase directly (single source of truth)
            await syncToSupabase(env, prospect.id, {
              email,
              stage: 'enriched',
              tier: 'warm',
            });

            // Resolve any existing retry tasks for this prospect
            await RetryQueue.resolveByProspect(env, prospect.id);
            return true;
          }
          // Record failure for retry
          await RetryQueue.recordFailure(
            env,
            'find_email',
            prospect.id as string,
            prospect.name as string,
            'No valid email pattern found',
            { website: prospect.website, contactName: prospect.contact_name }
          );
          return false;
        } catch (error) {
          console.error(`Error finding email for ${prospect.name}:`, error);
          // Record failure for retry
          await RetryQueue.recordFailure(
            env,
            'find_email',
            prospect.id as string,
            prospect.name as string,
            error instanceof Error ? error.message : String(error),
            { website: prospect.website, contactName: prospect.contact_name }
          );
          return false;
        }
      })
    );

    found += results.filter(Boolean).length;

    // Update progress after each mini-batch for real-time UI feedback
    // Get current progress to add to it (websites may have already been processed)
    const currentProgressJson = await env.KV_CACHE.get(PROGRESS_KEY);
    const currentProgress = currentProgressJson ? JSON.parse(currentProgressJson) : { websitesFound: 0 };
    await updateProgress(env, {
      processed: (currentProgress.websitesFound || 0) + Math.min(i + PARALLEL_SIZE, prospects.length),
      emailsFound: found,
    });

    // Delay between parallel batches
    if (i + PARALLEL_SIZE < prospects.length) {
      await sleep(300);
    }
  }

  console.log(`Email batch complete: found ${found}/${prospects.length} emails`);
  return { processed: prospects.length, found };
}

/**
 * Get enrichment status
 */
async function getEnrichmentStatus(env: Env): Promise<Response> {
  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN website IS NULL THEN 1 ELSE 0 END) as needs_website,
      SUM(CASE WHEN website IS NOT NULL AND contact_email IS NULL THEN 1 ELSE 0 END) as needs_email,
      SUM(CASE WHEN contact_email IS NOT NULL THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN stage = 'contacted' THEN 1 ELSE 0 END) as contacted
    FROM prospects
    WHERE archived = 0
  `).first();

  return Response.json({
    total: stats?.total || 0,
    needsWebsite: stats?.needs_website || 0,
    needsEmail: stats?.needs_email || 0,
    enriched: stats?.enriched || 0,
    contacted: stats?.contacted || 0,
  });
}

/**
 * Find website using intelligent multi-tier strategy
 *
 * STRATEGY (optimized for cost + success rate):
 *
 * Tier 1: Grok Direct (FREE, instant) - ~40% hit rate for known hotels
 *   → Grok has web knowledge, may already know major chains/famous hotels
 *   → No API cost, just ask if it knows the URL
 *
 * Tier 2: DDG Search + Grok (FREE) - ~50% hit rate
 *   → Search DuckDuckGo, have Grok pick best result
 *   → Catches most hotels Grok didn't know directly
 *
 * Tier 3: Brave Search + Grok (cheap, 6k/mo) - ~30% additional
 *   → Different search index catches DDG misses
 *   → Good backup, still affordable
 *
 * Tier 4: Google Search + Grok (expensive, 100/day) - LAST RESORT
 *   → Highest quality but limited
 *   → Only for the hardest-to-find hotels
 */
async function findWebsiteForProspect(
  companyName: string,
  location: string,
  contactName: string | null,
  env: Env
): Promise<string | null> {
  if (!env.GROK_API_KEY) {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Ask Grok directly (FREE - it may already know!)
  // ═══════════════════════════════════════════════════════════════════════════
  const grokDirect = await askGrokDirectly(companyName, location, env);
  if (grokDirect) {
    const isValid = await verifyUrl(grokDirect);
    if (isValid) {
      console.log(`[Grok-Direct] Found: ${companyName} -> ${grokDirect}`);
      return grokDirect;
    }
    console.log(`[Grok-Direct] URL invalid: ${grokDirect}`);
  }

  const searchQuery = `${companyName} ${location} official website`;

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: DDG Search + Grok analysis (FREE)
  // ═══════════════════════════════════════════════════════════════════════════
  if (env.VERCEL_SEARCH_URL) {
    const searchResults = await searchViaVercel(searchQuery, env);
    if (searchResults.length > 0) {
      const grokResult = await analyzeWithGrok(companyName, location, contactName, searchResults, env);
      if (grokResult.website && grokResult.confidence !== 'none') {
        const isValid = await verifyUrl(grokResult.website);
        if (isValid) {
          console.log(`[DDG+Grok] Found: ${companyName} -> ${grokResult.website} (${grokResult.confidence})`);
          return grokResult.website;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Brave Search + Grok analysis (cheap - 6k/month)
  // ═══════════════════════════════════════════════════════════════════════════
  const braveConfig = getNextBraveKey(env);
  if (braveConfig) {
    const searchResults = await searchBrave(searchQuery, braveConfig.apiKey, braveConfig.proxyUrl);
    if (searchResults.length > 0) {
      const grokResult = await analyzeWithGrok(companyName, location, contactName, searchResults, env);
      if (grokResult.website && grokResult.confidence !== 'none') {
        const isValid = await verifyUrl(grokResult.website);
        if (isValid) {
          console.log(`[Brave+Grok] Found: ${companyName} -> ${grokResult.website} (${grokResult.confidence})`);
          return grokResult.website;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: Google Search + Grok analysis (expensive - 100/day, LAST RESORT)
  // ═══════════════════════════════════════════════════════════════════════════
  if (await canUseGoogleSearch(env)) {
    const searchResults = await searchGoogle(searchQuery, env);
    if (searchResults.length > 0) {
      const grokResult = await analyzeWithGrok(companyName, location, contactName, searchResults, env);
      if (grokResult.website && grokResult.confidence !== 'none') {
        const isValid = await verifyUrl(grokResult.website);
        if (isValid) {
          console.log(`[Google+Grok] Found: ${companyName} -> ${grokResult.website} (${grokResult.confidence})`);
          return grokResult.website;
        }
      }
    }
  }

  console.log(`[All tiers failed] No website found for: ${companyName}`);
  return null;
}

/**
 * Ask Grok directly if it knows the hotel's website (FREE - no search API needed)
 * Grok has web knowledge baked in, may already know major chains and famous hotels
 */
async function askGrokDirectly(
  companyName: string,
  location: string,
  env: Env
): Promise<string | null> {
  if (!env.GROK_API_KEY) return null;

  const prompt = `You are a hotel industry expert. Do you know the OFFICIAL WEBSITE URL for this property?

HOTEL: ${companyName}
LOCATION: ${location || 'Unknown'}

IMPORTANT RULES:
- Only return URLs you are CONFIDENT about
- Never guess or make up URLs
- Never return OTAs (booking.com, expedia), social media, or review sites
- Only return the hotel's own direct website
- If you're not sure, return null

Response format (JSON only, no explanation):
{"website": "https://..." or null, "confidence": "high"|"medium"|"none"}`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;

    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as { website: string | null; confidence: string };
      // Only return high/medium confidence results
      if (result.website && (result.confidence === 'high' || result.confidence === 'medium')) {
        return result.website;
      }
    }
  } catch (error) {
    console.error('Grok direct lookup error:', error);
  }

  return null;
}


// Counter for Brave API key rotation (round-robin)
let braveKeyIndex = 0;

/**
 * Google Search API Daily Counter
 * Tracks usage per day with KV - NEVER exceeds 100/day
 */
async function getGoogleSearchCount(env: Env): Promise<number> {
  const countStr = await env.KV_CACHE.get(GOOGLE_DAILY_COUNT_KEY);
  return countStr ? parseInt(countStr, 10) : 0;
}

async function incrementGoogleSearchCount(env: Env): Promise<number> {
  const current = await getGoogleSearchCount(env);
  const newCount = current + 1;

  // TTL: Reset at midnight UTC (calculate seconds until midnight)
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const secondsUntilMidnight = Math.ceil((midnight.getTime() - now.getTime()) / 1000);

  await env.KV_CACHE.put(GOOGLE_DAILY_COUNT_KEY, String(newCount), {
    expirationTtl: Math.max(secondsUntilMidnight, 60), // Min 60s to avoid edge cases
  });

  return newCount;
}

async function canUseGoogleSearch(env: Env): Promise<boolean> {
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_CX) {
    return false;
  }
  const count = await getGoogleSearchCount(env);
  return count < GOOGLE_DAILY_LIMIT;
}

// Track Google API errors (for debugging)
let googleApiErrors = 0;
let googleApiSuccesses = 0;

/**
 * Search Google Custom Search API (100 queries/day FREE, then $5 per 1000)
 * HIGHEST QUALITY - use sparingly, only when other methods don't find results
 * Returns search results filtered to exclude OTAs, social media, review sites
 */
async function searchGoogle(query: string, env: Env): Promise<SearchResult[]> {
  // Double-check we can use Google (rate limit)
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_CX) {
    console.log('[Google] Not configured, skipping');
    return [];
  }

  const count = await getGoogleSearchCount(env);
  if (count >= GOOGLE_DAILY_LIMIT) {
    console.log(`[Google] Daily limit reached (${count}/${GOOGLE_DAILY_LIMIT}), skipping`);
    return [];
  }

  try {
    const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_SEARCH_API_KEY}&cx=${env.GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=10`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      googleApiErrors++;
      const error = await response.text();
      console.log(`[Google] API error #${googleApiErrors}: ${response.status} - ${error.slice(0, 200)}`);
      // If rate limited (429), wait longer before next request
      if (response.status === 429) {
        console.log('[Google] Rate limited! Waiting 5 seconds...');
        await sleep(5000);
      }
      return [];
    }
    googleApiSuccesses++;

    // Increment counter AFTER successful response
    const newCount = await incrementGoogleSearchCount(env);
    console.log(`[Google] Search #${newCount}/${GOOGLE_DAILY_LIMIT} for "${query}"`);

    const data = await response.json() as {
      items?: Array<{ link: string; title: string; snippet?: string }>;
    };

    const results: SearchResult[] = [];
    const items = data.items || [];

    // Filter out OTAs, social media, review sites
    const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|google\.com\/maps|tiktok|pinterest/i;

    for (const item of items) {
      if (!excludePatterns.test(item.link) && item.link.startsWith('http')) {
        results.push({ url: item.link, title: item.title });
      }
      if (results.length >= 10) break;
    }

    console.log(`[Google] Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[Google] Search error:', error);
    return [];
  }
}

/**
 * Get the next Brave API key and proxy URL (round-robin rotation)
 */
function getNextBraveKey(env: Env): { apiKey: string; proxyUrl?: string } | null {
  const keys = [
    { apiKey: env.BRAVE_SEARCH_API_KEY, proxyUrl: env.PROXY_URL_1 },
    { apiKey: env.BRAVE_SEARCH_API_KEY_2, proxyUrl: env.PROXY_URL_2 },
    { apiKey: env.BRAVE_SEARCH_API_KEY_3, proxyUrl: env.PROXY_URL_3 },
  ].filter(k => k.apiKey) as Array<{ apiKey: string; proxyUrl?: string }>;

  if (keys.length === 0) return null;

  const config = keys[braveKeyIndex % keys.length];
  braveKeyIndex++;
  return config;
}

/**
 * Search Brave Web Search API (free tier: 2k/month per key)
 * With rotation: 3 keys = 6k/month and 3 req/sec
 * Supports optional proxy URL for IP rotation
 */
async function searchBrave(query: string, apiKey: string, proxyUrl?: string): Promise<SearchResult[]> {
  try {
    const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;

    // If proxy is configured, route through it
    const url = proxyUrl ? buildProxyUrl(proxyUrl, apiUrl) : apiUrl;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      console.log(`Brave Search error: ${response.status}`);
      return [];
    }

    const data = await response.json() as {
      web?: { results?: Array<{ url: string; title: string; description?: string }> }
    };

    const results: SearchResult[] = [];
    const webResults = data.web?.results || [];

    // Filter out OTAs, social media, review sites
    const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|google\.com|tiktok/i;

    for (const r of webResults) {
      if (!excludePatterns.test(r.url) && r.url.startsWith('http')) {
        results.push({ url: r.url, title: r.title });
      }
      if (results.length >= 10) break;
    }

    console.log(`Brave found ${results.length} results for "${query}"`);
    return results;
  } catch (error) {
    console.error('Brave Search error:', error);
    return [];
  }
}

/**
 * Search via Vercel DDG Proxy (FREE - uses existing Vercel deployment)
 * Vercel IPs aren't blocked by DDG like Cloudflare's are
 */
async function searchViaVercel(query: string, env: Env): Promise<SearchResult[]> {
  try {
    if (!env.VERCEL_SEARCH_URL) return [];

    const vercelUrl = env.VERCEL_SEARCH_URL;
    const url = `${vercelUrl}?q=${encodeURIComponent(query)}`;
    const auth = envAuthHeader(env);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Cloudflare-Worker',
        ...(auth ? { 'Authorization': auth } : {}),
      },
    });

    if (!response.ok) {
      console.log(`Vercel DDG proxy error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { results?: SearchResult[]; error?: string };

    if (data.error) {
      console.log(`Vercel DDG error: ${data.error}`);
      return [];
    }

    console.log(`Vercel DDG found ${data.results?.length || 0} results for "${query}"`);
    return data.results || [];
  } catch (error) {
    console.error('Vercel DDG proxy error:', error);
    return [];
  }
}

/**
 * Search DuckDuckGo via ScraperAPI (DDG blocks Cloudflare IPs)
 */
async function searchDuckDuckGo(query: string, scraperApiKey?: string): Promise<SearchResult[]> {
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    // Use ScraperAPI if available (DDG blocks Cloudflare IPs)
    let response: Response;
    if (scraperApiKey) {
      const scraperUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(ddgUrl)}`;
      response = await fetch(scraperUrl);
      console.log(`ScraperAPI search for "${query}": status=${response.status}`);
    } else {
      response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      console.log(`DDG search for "${query}": status=${response.status}`);
    }

    if (!response.ok) {
      console.log(`Search failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    console.log(`Search HTML length: ${html.length}`);
    const results: SearchResult[] = [];

    // Extract URLs from DuckDuckGo HTML
    const linkMatches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi);

    for (const match of linkMatches) {
      let url = match[1];
      const title = match[2].trim();

      // Extract actual URL from DDG wrapper
      if (url.includes('uddg=')) {
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }
      }

      // Skip OTAs and social media
      const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|google\.com/i;
      if (!excludePatterns.test(url) && url.startsWith('http')) {
        results.push({ url, title });
      }

      if (results.length >= 10) break;
    }

    console.log(`DDG found ${results.length} results`);
    return results;
  } catch (error) {
    console.error(`DDG error:`, error);
    return [];
  }
}

/**
 * Use Grok to analyze search results
 */
async function analyzeWithGrok(
  companyName: string,
  location: string,
  contactName: string | null,
  searchResults: SearchResult[],
  env: Env
): Promise<WebsiteResult> {
  const GROK_API_KEY = env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    return { website: null, confidence: 'none', reasoning: 'No API key' };
  }

  const searchResultsText = searchResults.map((r, i) =>
    `${i + 1}. ${r.title}\n   URL: ${r.url}`
  ).join('\n');

  const prompt = `You are a hotel industry research assistant. Identify the OFFICIAL WEBSITE for:

BUSINESS: ${companyName}
LOCATION: ${location}
CONTACT: ${contactName || 'Not provided'}

SEARCH RESULTS:
${searchResultsText}

Pick the URL that is most likely the official website. Never pick OTAs, social media, or review sites.

Response format (JSON only):
{"website": "https://..." or null, "confidence": "high"|"medium"|"low"|"none", "reasoning": "brief explanation"}`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return { website: null, confidence: 'none', reasoning: 'API error' };
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;

    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as WebsiteResult;
    }
  } catch (error) {
    console.error('Grok error:', error);
  }

  return { website: null, confidence: 'none', reasoning: 'Parse error' };
}

/**
 * Verify URL exists
 */
async function verifyUrl(url: string): Promise<boolean> {
  try {
    const normalized = normalizeWebsiteUrl(url);
    if (!normalized) return false;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    };

    // HEAD is cheap but often blocked; fall back to GET with a small range.
    const head = await fetchWithTimeout(normalized, { method: 'HEAD', headers }, 8000);
    if (head && (head.ok || [403, 405].includes(head.status))) return true;

    const get = await fetchWithTimeout(
      normalized,
      { method: 'GET', headers: { ...headers, 'Range': 'bytes=0-2048' } },
      12000
    );
    return !!get && (get.ok || [403, 405].includes(get.status));
  } catch {
    return false;
  }
}

/**
 * Scrape website for emails, team members, and property info
 */
async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const result: ScrapedData = {
    emails: [],
    phones: [],
    teamMembers: [],
    propertyInfo: {},
  };

  try {
    const normalized = normalizeWebsiteUrl(url);
    if (!normalized) return result;

    // Fetch homepage
    const response = await fetchWithTimeout(
      normalized,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      },
      12000
    );
    if (!response || !response.ok) return result;

    const html = await response.text();

    // Extract emails from page
    result.emails = extractEmails(html).slice(0, 10);

    // Extract LinkedIn
    const linkedinMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'#?]+)/i);
    if (linkedinMatch) result.linkedinUrl = linkedinMatch[1];

    // Extract Instagram
    const instagramMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'#?]+)/i);
    if (instagramMatch) result.instagramUrl = instagramMatch[1];

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (descMatch) result.propertyInfo.description = descMatch[1].substring(0, 300);

    // Extract star rating
    const starMatch = html.match(/(\d)\s*(?:star|sterne|étoiles|stelle)/i);
    if (starMatch) result.propertyInfo.starRating = parseInt(starMatch[1]);

    // Extract room count
    const roomMatch = html.match(/(\d+)\s*(?:rooms|zimmer|chambres|suites)/i);
    if (roomMatch) result.propertyInfo.roomCount = roomMatch[1];

    // Look for chain brands
    const chains = ['Marriott', 'Hilton', 'IHG', 'Hyatt', 'Accor', 'Wyndham', 'Best Western', 'Radisson', 'Four Seasons', 'Ritz-Carlton', 'Sofitel', 'Mandarin Oriental', 'Kempinski', 'Fairmont'];
    for (const chain of chains) {
      if (html.toLowerCase().includes(chain.toLowerCase())) {
        result.propertyInfo.chainBrand = chain;
        break;
      }
    }

    // Look for amenities
    const amenities = ['spa', 'pool', 'gym', 'fitness', 'restaurant', 'bar', 'wifi', 'beach', 'golf', 'michelin'];
    result.propertyInfo.amenities = amenities.filter(a => html.toLowerCase().includes(a));

    // Find contact/about pages and scrape them too
    const contactLinks = html.match(/href=["']([^"']*(?:contact|about|team|management)[^"']*)["']/gi) || [];
    const baseHost = new URL(normalized).hostname;

    for (const link of contactLinks.slice(0, 3)) {
      try {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) continue;

        const pageUrl = new URL(hrefMatch[1], normalized).href;
        if (new URL(pageUrl).hostname !== baseHost) continue;

        const pageResponse = await fetchWithTimeout(
          pageUrl,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          },
          10000
        );
        if (!pageResponse || !pageResponse.ok) continue;

        const pageHtml = await pageResponse.text();

        // Extract emails from subpage (apply same filtering rules)
        const pageEmails = extractEmails(pageHtml);
        result.emails = dedupeEmails([...result.emails, ...pageEmails]).slice(0, 10);

        // Look for team members on about/team pages
        if (pageUrl.match(/team|about|management|leadership/i)) {
          const titlePatterns = ['General Manager', 'GM', 'Hotel Manager', 'Managing Director', 'Director of', 'Owner'];
          for (const title of titlePatterns) {
            const pattern = new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)\\s*[,–-]\\s*${title}`, 'gi');
            let match;
            while ((match = pattern.exec(pageHtml)) !== null) {
              const name = match[1]?.trim();
              if (name && name.length > 3 && name.length < 50 && !name.match(/hotel|resort|spa/i)) {
                result.teamMembers.push({ name, title });
              }
            }
          }
        }
      } catch {
        // Skip failed pages
      }
    }

    // Dedupe team members
    const seen = new Set<string>();
    result.teamMembers = result.teamMembers.filter(m => {
      const key = m.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Scraped ${url}: ${result.emails.length} emails, ${result.teamMembers.length} team members`);
  } catch (error) {
    console.error(`Scrape error for ${url}:`, error);
  }

  return result;
}

/**
 * Find email for a prospect using MillionVerifier
 */
async function findEmailForProspect(
  website: string,
  contactName: string,
  env: Env
): Promise<string | null> {
  const MILLIONVERIFIER_API_KEY = env.MILLIONVERIFIER_API_KEY;
  if (!MILLIONVERIFIER_API_KEY) {
    return null;
  }

  // Extract domain
  let domain: string;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    domain = url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

  // Parse name
  const parts = contactName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lastName = parts[parts.length - 1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Generate email patterns
  const patterns = [
    `${firstName}.${lastName}@${domain}`,
    `${firstName}@${domain}`,
    `${firstName}${lastName}@${domain}`,
    `${firstName.charAt(0)}${lastName}@${domain}`,
    `${lastName}.${firstName}@${domain}`,
    `${lastName}${firstName.charAt(0)}@${domain}`,
  ];

  // Test each pattern
  for (const email of patterns) {
    try {
      const response = await fetch(
        `https://api.millionverifier.com/api/v3/?api=${MILLIONVERIFIER_API_KEY}&email=${email}&timeout=10`
      );

      if (!response.ok) continue;

      const result = await response.json() as { result?: string; role?: boolean };

      const verdict = (result.result || '').toLowerCase();
      const isRole = !!result.role;

      // Hotels are commonly catch-all; accept those as "probably valid" if not a role mailbox.
      if ((verdict === 'ok' || verdict === 'catch_all') && !isRole) {
        return email;
      }

      await sleep(200);
    } catch {
      continue;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function envAuthHeader(env: Env): string | null {
  if (!env.VERCEL_SEARCH_SECRET) return null;
  return `Bearer ${env.VERCEL_SEARCH_SECRET}`;
}

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    // Default to https when possible
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildProxyUrl(proxyUrl: string, targetUrl: string): string {
  // Supports either:
  // 1) A template URL containing "{url}" placeholder
  // 2) A base URL where we append `url=` as a query parameter
  if (proxyUrl.includes('{url}')) {
    return proxyUrl.replace('{url}', encodeURIComponent(targetUrl));
  }

  const separator = proxyUrl.includes('?') ? '&' : '?';
  return `${proxyUrl}${separator}url=${encodeURIComponent(targetUrl)}`;
}

function extractEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const excludePatterns =
    /example\.com|test\.com|wixpress|sentry|cloudflare|placeholder|noreply|no-reply|@(website|domain|example)\./i;

  // Filter out file extensions that look like emails (e.g., x60@2x.png)
  const fileExtensions = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|json|xml|pdf|doc|docx|xls|xlsx)$/i;

  const raw = html.match(emailRegex) || [];
  return dedupeEmails(
    raw
      .map(e => e.replace(/[),.;:]$/, '')) // common trailing punctuation
      .filter(e => !excludePatterns.test(e))
      .filter(e => !fileExtensions.test(e))
      .filter(e => e.length <= 254)
  ).slice(0, 50);
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function pickPersonalEmail(emails: string[]): string | null {
  const genericPrefixes =
    /^(info|contact|hello|hi|reservations|reception|booking|bookings|support|sales|admin|office|enquiries|enquiry|mail|email|help|team|general|press|media|marketing|hr|jobs|careers|events|feedback|webmaster|privacy|legal|billing|accounts|finance|service|services|customerservice|guest|guestservices|frontdesk|concierge|stay|stays)@/i;
  const first = emails.find(e => !genericPrefixes.test(e));
  return first || null;
}

async function lookupEmail(request: Request, env: Env): Promise<Response> {
  let body: { website?: string; contact_name?: string; contactName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const website = typeof body.website === 'string' ? body.website : '';
  const contactName = (typeof body.contactName === 'string' ? body.contactName : body.contact_name) || null;

  if (!website) {
    return Response.json({ error: 'website is required' }, { status: 400 });
  }

  const scrape = await scrapeWebsite(website);
  const scrapedPersonal = pickPersonalEmail(scrape.emails);
  if (scrapedPersonal) {
    return Response.json({
      success: true,
      email: scrapedPersonal,
      source: 'scrape',
      emailsFound: scrape.emails,
    });
  }

  if (!contactName) {
    return Response.json({
      success: true,
      email: null,
      source: 'none',
      emailsFound: scrape.emails,
      reason: 'No contact name for pattern verification',
    });
  }

  const email = await findEmailForProspect(website, contactName, env);
  return Response.json({
    success: true,
    email,
    source: email ? 'pattern+millionverifier' : 'none',
    emailsFound: scrape.emails,
  });
}
