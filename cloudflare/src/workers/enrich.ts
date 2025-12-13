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

  // Debug single prospect
  if (path === '/enrich/debug-prospect') {
    return debugProspect(env);
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
 */
async function autoEnrich(env: Env, limit: number = 70): Promise<Response> {
  const results = {
    websites: { processed: 0, found: 0 },
    emails: { processed: 0, found: 0 },
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
    // Step 1: Find websites
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

    // Mark as complete
    await updateProgress(env, {
      isRunning: false,
      processed: websiteResult.processed + emailResult.processed,
      found: websiteResult.found + emailResult.found,
      websitesFound: websiteResult.found,
      emailsFound: emailResult.found,
    });

    return Response.json({
      success: true,
      message: 'Auto enrichment batch complete',
      results,
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

async function enrichWebsitesBatch(
  env: Env,
  limit: number
): Promise<{ processed: number; found: number }> {
  // Get prospects without websites (any stage, prioritize sales_navigator)
  const result = await env.DB.prepare(`
    SELECT id, name, city, country, contact_name, contact_title
    FROM prospects
    WHERE archived = 0
      AND website IS NULL
      AND name IS NOT NULL
      AND name NOT LIKE '%Popeyes%'
      AND name NOT LIKE '%McDonald%'
      AND name NOT LIKE '%Taco Bell%'
    ORDER BY
      CASE WHEN lead_source = 'sales_navigator' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `).bind(limit).all();

  const prospects = result.results || [];
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

            // Update prospect with website, scraped data, and maybe email
            if (personalEmail) {
              console.log(`  ✓ Found email from scraping: ${personalEmail}`);
              await env.DB.prepare(`
                UPDATE prospects
                SET website = ?,
                    linkedin_url = ?,
                    instagram_url = ?,
                    research_notes = ?,
                    contact_email = ?,
                    stage = 'enriched',
                    tier = 'warm',
                    updated_at = datetime('now')
                WHERE id = ?
              `).bind(
                website,
                scraped.linkedinUrl || null,
                scraped.instagramUrl || null,
                researchNotes.join('\n') || null,
                personalEmail,
                prospect.id
              ).run();

              // Sync to Supabase immediately
              await syncToSupabase(env, prospect.id as string, {
                website,
                email: personalEmail,
                stage: 'enriched',
                tier: 'warm',
                linkedin_url: scraped.linkedinUrl || undefined,
                instagram_url: scraped.instagramUrl || undefined,
                research_notes: researchNotes.join('\n') || undefined,
              });
            } else {
              await env.DB.prepare(`
                UPDATE prospects
                SET website = ?,
                    linkedin_url = ?,
                    instagram_url = ?,
                    research_notes = ?,
                    updated_at = datetime('now')
                WHERE id = ?
              `).bind(
                website,
                scraped.linkedinUrl || null,
                scraped.instagramUrl || null,
                researchNotes.join('\n') || null,
                prospect.id
              ).run();

              // Sync to Supabase immediately
              await syncToSupabase(env, prospect.id as string, {
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

    // Rate limit: wait between batches (3 keys = 3 req/sec, so 1s between batches)
    if (i + PARALLEL_SIZE < prospects.length) {
      await sleep(1100);
    }
  }

  console.log(`Batch complete: found ${found}/${prospects.length} websites`);
  return { processed: prospects.length, found };
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
  // Get prospects with websites but no email (any stage except contacted/engaged)
  const result = await env.DB.prepare(`
    SELECT id, name, website, contact_name
    FROM prospects
    WHERE archived = 0
      AND stage NOT IN ('contacted', 'engaged', 'meeting', 'won', 'lost')
      AND website IS NOT NULL
      AND contact_email IS NULL
      AND contact_name IS NOT NULL
    ORDER BY
      CASE WHEN lead_source = 'sales_navigator' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `).bind(limit).all();

  const prospects = result.results || [];
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
            await env.DB.prepare(`
              UPDATE prospects
              SET contact_email = ?, stage = 'enriched', tier = 'warm', updated_at = datetime('now')
              WHERE id = ?
            `).bind(email, prospect.id).run();

            // Sync to Supabase immediately
            await syncToSupabase(env, prospect.id as string, {
              email,
              stage: 'enriched',
              tier: 'warm',
            });

            // Resolve any existing retry tasks for this prospect
            await RetryQueue.resolveByProspect(env, prospect.id as string);
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
 * Find website using DDG/Brave Search + Grok analysis (90%+ hit rate)
 * Priority: Vercel DDG proxy (free) > Brave Search > Grok-only
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

  const searchQuery = `${companyName} ${location} official website`;

  // Strategy 1: Vercel DDG Proxy (FREE - best option, 90% hit rate)
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

  // Strategy 2: Brave Search (free tier: 2k/month per key, rotation for 3x rate)
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

  // Strategy 3: Grok-only (fallback, ~5-10% hit rate)
  const prompt = `Find the official website URL for this hotel/property:

BUSINESS: ${companyName}
LOCATION: ${location || 'Unknown'}
CONTACT: ${contactName || 'Not provided'}

Search the web and return the most likely OFFICIAL hotel website.
Never return OTAs (booking.com, expedia, hotels.com), social media, or review sites.
Only return the hotel's own direct website if you can find it.

Response format (JSON only, no explanation):
{"website": "https://..." or null, "confidence": "high"|"medium"|"low"|"none", "reasoning": "brief explanation"}`;

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
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.log(`Grok API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content;

    const jsonMatch = content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as WebsiteResult;

      if (result.website && result.confidence !== 'none') {
        const isValid = await verifyUrl(result.website);
        if (isValid) {
          console.log(`[Grok-only] Found: ${companyName} -> ${result.website} (${result.confidence})`);
          return result.website;
        }
      }
    }
  } catch (error) {
    console.error(`Grok search error for ${companyName}:`, error);
  }

  return null;
}

// Counter for Brave API key rotation (round-robin)
let braveKeyIndex = 0;

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
