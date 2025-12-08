/**
 * Phase 1: Find websites using FREE methods (DuckDuckGo + Grok AI)
 * Searches by business name + country to find the closest match
 *
 * Priority: 1) DuckDuckGo (free) → 2) Grok AI (already paying)
 * Google Places API DISABLED (costs money)
 *
 * Features:
 * - Checkpoint/resume: Saves progress to file, can resume if interrupted
 * - Run with: caffeinate -i npx tsx scripts/enrich-phase1-google-search.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase';

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join('/tmp', 'enrich-websites-checkpoint.json');

interface Checkpoint {
  processedIds: string[];
  lastUpdated: string;
  stats: {
    processed: number;
    found: number;
    emailsFound: number;
    verified: number;
  };
}

function loadCheckpoint(): Checkpoint {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      const checkpoint = JSON.parse(data);
      console.log(`📂 Loaded checkpoint: ${checkpoint.processedIds.length} already processed`);
      return checkpoint;
    }
  } catch (error) {
    console.log('⚠️ Could not load checkpoint, starting fresh');
  }
  return { processedIds: [], lastUpdated: new Date().toISOString(), stats: { processed: 0, found: 0, emailsFound: 0, verified: 0 } };
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  try {
    checkpoint.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  } catch (error) {
    console.error('⚠️ Could not save checkpoint:', error);
  }
}

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY || '';

// Sites to NEVER accept as results (booking aggregators, social media, etc.)
const EXCLUDED_DOMAINS = [
  'booking.com', 'expedia.com', 'tripadvisor.com', 'hotels.com',
  'agoda.com', 'trivago.com', 'kayak.com', 'priceline.com',
  'orbitz.com', 'travelocity.com', 'hotwire.com',
  'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'wikipedia.org', 'yelp.com',
  'google.com', 'maps.google.com',
];

// Known hotel chain domains - ALWAYS accept these
const HOTEL_CHAIN_DOMAINS = [
  'rosewoodhotels.com', 'belmond.com', 'fairmont.com', 'fourseasons.com',
  'ritzcarlton.com', 'marriott.com', 'hyatt.com', 'hilton.com',
  'ihg.com', 'accor.com', 'radisson.com', 'wyndham.com',
  'aubergeresorts.com', 'sixsenses.com', 'aman.com', 'oetker.com',
  'jumeirah.com', 'mandarinoriental.com', 'peninsula.com',
  'kempinski.com', 'raffles.com', 'shangri-la.com', 'anantara.com',
  'sandals.com', 'royalton.com', 'sonesta.com', 'melia.com',
  'nh-hotels.com', 'lux-resorts.com', 'constancehotels.com',
];

interface PlaceResult {
  website: string | null;
  placeName: string | null;
  address: string | null;
}

/**
 * Check if website domain is valid (not a booking site)
 */
function isValidWebsite(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return !EXCLUDED_DOMAINS.some(excluded => hostname.includes(excluded));
  } catch {
    return false;
  }
}

/**
 * Check if website is a known hotel chain domain
 */
function isKnownHotelChain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return HOTEL_CHAIN_DOMAINS.some(chain => hostname.includes(chain.replace('.com', '')));
  } catch {
    return false;
  }
}

/**
 * Check if business name is clearly a hotel/resort
 */
function isObviousHotel(businessName: string): boolean {
  const hotelKeywords = /hotel|resort|inn|lodge|villa|palace|beach house|spa|suites|club|house$/i;
  return hotelKeywords.test(businessName);
}

/**
 * Check if website domain is relevant (VERY relaxed check)
 * Since Google Places matched by location, we trust it heavily
 */
function isRelevantWebsite(url: string, businessName: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');

    // ALWAYS accept known hotel chain domains
    if (isKnownHotelChain(url)) {
      return true;
    }

    // If business name is obviously a hotel, accept ANY valid website from Google
    // (Google Places already matched by name + location, so trust it)
    if (isObviousHotel(businessName)) {
      return true;
    }

    // Accept if domain contains hotel-related keywords
    if (hostname.includes('hotel') || hostname.includes('resort') ||
        hostname.includes('inn') || hostname.includes('lodge') ||
        hostname.includes('villa') || hostname.includes('palace') ||
        hostname.includes('bay') || hostname.includes('beach') ||
        hostname.includes('club') || hostname.includes('house')) {
      return true;
    }

    const domain = hostname.split('.')[0];

    // Clean business name - remove common words and normalize
    const cleanName = businessName.toLowerCase()
      .replace(/hotel|resort|spa|inn|lodge|suites|boutique|&|and|the|a|an/gi, '')
      .replace(/[^a-z0-9]/g, '');

    // Clean domain
    const cleanDomain = domain.replace(/hotel|resort|spa|inn|lodge/gi, '').replace(/[^a-z0-9]/g, '');

    // Check if any significant word (3+ chars) appears in both
    const nameWords = cleanName.match(/[a-z]{3,}/g) || [];
    const hasNameMatch = nameWords.some(word => cleanDomain.includes(word));

    const domainWords = cleanDomain.match(/[a-z]{3,}/g) || [];
    const hasDomainMatch = domainWords.some(word => cleanName.includes(word));

    return hasNameMatch || hasDomainMatch;
  } catch {
    return false;
  }
}

/**
 * Search Google Places Text Search (New API) for a business
 * Returns website and matched place info
 * Gets multiple results and finds the best valid one
 */
async function searchGooglePlaces(businessName: string, country: string): Promise<PlaceResult> {
  try {
    // Build search query - add "hotel" for better results
    // Check if name already contains hotel/resort keywords
    const hasHotelKeyword = /hotel|resort|inn|lodge|villa/i.test(businessName);
    const query = hasHotelKeyword
      ? `${businessName} ${country}`
      : `${businessName} hotel ${country}`;

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,  // Get top 5 to find best valid match
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`  API Error: ${error}`);
      return { website: null, placeName: null, address: null };
    }

    const data = await response.json();

    if (data.places && data.places.length > 0) {
      // Check each result and find first valid one
      for (const place of data.places) {
        let website = place.websiteUri || null;

        if (!website) continue;

        // Check it's not a booking site
        if (!isValidWebsite(website)) {
          continue;  // Skip booking.com, expedia, etc.
        }

        // Check the website is relevant to the business name
        if (!isRelevantWebsite(website, businessName)) {
          continue;  // Skip unrelated websites
        }

        // Clean up the website URL (remove tracking params)
        try {
          const url = new URL(website);
          // Remove common tracking parameters
          url.searchParams.delete('utm_campaign');
          url.searchParams.delete('utm_medium');
          url.searchParams.delete('utm_source');
          url.searchParams.delete('utm_content');
          website = url.origin + url.pathname;
          // Remove trailing slash
          if (website.endsWith('/')) {
            website = website.slice(0, -1);
          }
        } catch {
          // Keep original if URL parsing fails
        }

        return {
          website,
          placeName: place.displayName?.text || null,
          address: place.formattedAddress || null,
        };
      }
    }

    return { website: null, placeName: null, address: null };
  } catch (error) {
    console.error(`  Search error:`, error);
    return { website: null, placeName: null, address: null };
  }
}

interface ScrapedData {
  isHotel: boolean;
  emails: string[];
  phones: string[];
  description: string | null;
  teamMembers: Array<{ name: string; title: string; email?: string }>;
}

/**
 * Scrape and verify a URL - checks if it's a hotel AND extracts useful data
 */
async function scrapeAndVerify(url: string, businessName: string): Promise<ScrapedData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    // Check for hotel-related keywords
    const hotelKeywords = [
      'book now', 'rooms', 'suites', 'check-in', 'check-out', 'reservation',
      'accommodation', 'guest', 'amenities', 'spa', 'restaurant', 'concierge',
      'hotel', 'resort', 'lodge', 'villa', 'stay with us', 'our rooms',
    ];
    const keywordMatches = hotelKeywords.filter(kw => lowerHtml.includes(kw)).length;

    // Check if business name appears on the page
    const cleanName = businessName.toLowerCase().replace(/hotel|resort|spa|inn|lodge/gi, '').trim();
    const nameWords = cleanName.split(/\s+/).filter(w => w.length > 3);
    const nameMatches = nameWords.filter(word => lowerHtml.includes(word)).length;

    const isHotel = keywordMatches >= 3 && nameMatches >= 1;

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];
    const excludePatterns = /example\.com|test\.com|email\.com|domain\.com|wixpress|sentry|cloudflare|noreply|no-reply|unsubscribe|privacy@|gdpr@/i;
    const emails = [...new Set(rawEmails.filter(e => !excludePatterns.test(e)))];

    // Extract phone numbers
    const phoneRegex = /(?:\+|00)?[1-9]\d{0,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const rawPhones = html.match(phoneRegex) || [];
    const phones = [...new Set(rawPhones.map(p => p.replace(/[-.\s()]/g, '')).filter(p => p.length >= 10 && p.length <= 15))].slice(0, 5);

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].substring(0, 300) : null;

    // Extract team members (look for common title patterns)
    const teamMembers: Array<{ name: string; title: string; email?: string }> = [];
    const titlePatterns = [
      'General Manager', 'GM', 'Hotel Manager', 'Managing Director',
      'Director', 'Owner', 'Founder', 'President', 'CEO',
    ];

    for (const title of titlePatterns) {
      const patterns = [
        new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)\\s*[,–-]\\s*${title}`, 'gi'),
        new RegExp(`${title}\\s*[,–:-]\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)`, 'gi'),
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const name = match[1]?.trim();
          if (name && name.length > 3 && name.length < 50 && !name.match(/hotel|resort|spa|restaurant/i)) {
            // Try to find their email
            const emailMatch = emails.find(e => e.toLowerCase().includes(name.split(' ').pop()?.toLowerCase() || ''));
            teamMembers.push({ name, title, email: emailMatch });
          }
        }
      }
    }

    return { isHotel, emails, phones, description, teamMembers };
  } catch {
    return null;
  }
}

/**
 * Grok AI fallback - ask AI for multiple website options, then verify each
 * Only used if both Google Places and DuckDuckGo fail
 */
async function searchWithGrok(businessName: string, country: string): Promise<{ website: string; scraped: ScrapedData } | null> {
  if (!GROK_API_KEY) return null;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        messages: [
          {
            role: 'system',
            content: `You are a hotel website finder. Return up to 3 possible official website URLs, one per line.
If the hotel is part of a chain (like Rosewood, Belmond, Four Seasons), include both the property-specific URL and the chain URL.
If unknown, respond with just "UNKNOWN".
Never return booking sites like booking.com, expedia, tripadvisor, hotels.com, agoda.
Format: one URL per line, nothing else.`,
          },
          {
            role: 'user',
            content: `What are the possible official website URLs for "${businessName}" hotel/resort in ${country}?`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer || answer === 'UNKNOWN') {
      return null;
    }

    // Parse multiple URLs from response
    const urls = answer
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.startsWith('http'))
      .filter((url: string) => isValidWebsite(url));

    if (urls.length === 0) return null;

    // Scrape and verify each URL - return first verified hotel with scraped data
    for (const url of urls) {
      const scraped = await scrapeAndVerify(url, businessName);
      if (scraped && scraped.isHotel) {
        return { website: url, scraped };
      }
    }

    // If none verified as hotel, scrape first URL anyway (Grok's best guess)
    const firstScraped = await scrapeAndVerify(urls[0], businessName);
    if (firstScraped) {
      return { website: urls[0], scraped: firstScraped };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * DuckDuckGo fallback search for hotel website
 */
async function searchDuckDuckGo(businessName: string, country: string): Promise<string | null> {
  try {
    const query = `${businessName} hotel ${country} official website`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const urlMatches = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];

    for (const match of urlMatches) {
      const url = match.replace(/href="|"/g, '');

      // Skip excluded domains
      if (!isValidWebsite(url)) continue;
      if (url.includes('duckduckgo')) continue;

      // Check relevance
      if (isRelevantWebsite(url, businessName)) {
        return url;
      }
    }

    return null;
  } catch {
    return null;
  }
}

interface ProcessResult {
  found: boolean;
  website?: string;
  source?: string;
  emails?: number;
  verified?: boolean;
}

/**
 * Process a single prospect - find website, scrape, and save all data
 * ORDER: DuckDuckGo (free) → Grok AI (already paying) → skip Google Places (paid)
 */
async function processProspect(prospect: {
  id: string;
  name: string;
  country: string | null;
}): Promise<ProcessResult> {
  // Country is optional - Grok can often find hotels by name alone
  const countryHint = prospect.country || 'Europe'; // Default to Europe for Greek/Italian/Portuguese hotels

  // DISABLED: Google Places API costs money even with "free tier" fields
  // Use free alternatives instead: DuckDuckGo + Grok (already paying for email gen)

  // Try DuckDuckGo first (FREE - web scraping) - only if we have country
  const ddgWebsite = prospect.country ? await searchDuckDuckGo(prospect.name, prospect.country) : null;

  if (ddgWebsite) {
    // Scrape to verify and extract data
    const scraped = await scrapeAndVerify(ddgWebsite, prospect.name);

    const updateData: Record<string, unknown> = { website: ddgWebsite };

    if (scraped) {
      if (scraped.emails.length > 0) {
        updateData.email = scraped.emails[0];
      }
      if (scraped.phones.length > 0) {
        updateData.phone = scraped.phones[0];
      }
      if (scraped.description) {
        updateData.notes = scraped.description;
      }
    }

    await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospect.id);

    return {
      found: true,
      website: ddgWebsite,
      source: 'duckduckgo',
      emails: scraped?.emails.length || 0,
      verified: scraped?.isHotel || false,
    };
  }

  // Final fallback: Ask Grok AI (already returns scraped data)
  if (GROK_API_KEY) {
    const grokResult = await searchWithGrok(prospect.name, countryHint);

    if (grokResult) {
      const { website, scraped } = grokResult;

      const updateData: Record<string, unknown> = { website };

      if (scraped.emails.length > 0) {
        updateData.email = scraped.emails[0];
      }
      if (scraped.phones.length > 0) {
        updateData.phone = scraped.phones[0];
      }
      if (scraped.description) {
        updateData.notes = scraped.description;
      }

      await supabase
        .from('prospects')
        .update(updateData)
        .eq('id', prospect.id);

      return {
        found: true,
        website,
        source: 'grok',
        emails: scraped.emails.length,
        verified: scraped.isHotel,
      };
    }
  }

  return { found: false };
}

async function main() {
  console.log('=== Phase 1: Website Discovery (FREE methods only) ===\n');
  console.log('Priority: 1) DuckDuckGo (free) → 2) Grok AI (already paying)');
  console.log('Google Places API DISABLED (costs money)');
  console.log('TIP: Run with "caffeinate -i" to prevent sleep\n');

  // Load checkpoint for resume capability
  const checkpoint = loadCheckpoint();
  const processedSet = new Set(checkpoint.processedIds);

  // Get count first - include prospects with OR without country
  const { count } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'sales_navigator')
    .is('website', null);

  console.log(`Found ${count} prospects without websites\n`);

  if (!count || count === 0) {
    console.log('No prospects need websites!');
    return;
  }

  // Fetch all prospects using pagination (Supabase limits to 1000 per request)
  const allProspects: Array<{ id: string; name: string; country: string | null }> = [];
  const PAGE_SIZE = 1000;

  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('prospects')
      .select('id, name, country')
      .eq('source', 'sales_navigator')
      .is('website', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (page) {
      allProspects.push(...page);
    }
    console.log(`Fetched ${allProspects.length}/${count} prospects...`);
  }

  // Filter out already processed prospects
  const prospects = allProspects.filter(p => !processedSet.has(p.id));
  const skipped = allProspects.length - prospects.length;

  if (skipped > 0) {
    console.log(`\n⏭️ Skipping ${skipped} already processed (from checkpoint)`);
  }

  console.log(`\nReady to process ${prospects.length} prospects\n`);

  if (prospects.length === 0) {
    console.log('All prospects already processed!');
    return;
  }

  const CONCURRENCY = 5;  // Run 5 parallel API calls for faster processing
  const BATCH_SIZE = 50;  // Process 50 at a time, with 5 concurrent

  let processed = checkpoint.stats.processed;
  let found = checkpoint.stats.found;
  let emailsFound = checkpoint.stats.emailsFound;
  let verified = checkpoint.stats.verified;

  // Process in batches with parallel execution
  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);

    // Process batch in chunks of CONCURRENCY
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const chunk = batch.slice(j, j + CONCURRENCY);

      // Process chunk in parallel
      const results = await Promise.all(
        chunk.map(async (prospect, idx) => {
          const prospectNum = skipped + i + j + idx + 1;
          try {
            const result = await processProspect(prospect);
            return { prospect, prospectNum, result };
          } catch (error) {
            return { prospect, prospectNum, result: { found: false, website: null, source: null, verified: false, emails: 0 } };
          }
        })
      );

      // Log results and update checkpoint
      for (const { prospect, prospectNum, result } of results) {
        processed++;
        checkpoint.processedIds.push(prospect.id);

        if (result.found) {
          found++;
          if (result.emails && result.emails > 0) emailsFound++;
          if (result.verified) verified++;
          const srcTag = result.source === 'duckduckgo' ? ' [DDG]' : result.source === 'grok' ? ' [GROK]' : '';
          const emailTag = result.emails && result.emails > 0 ? ` 📧${result.emails}` : '';
          const verifyTag = result.verified ? ' ✅' : '';
          console.log(`[${prospectNum}/${allProspects.length}] ${prospect.name}... ✓${srcTag}${verifyTag}${emailTag} ${result.website}`);
        } else {
          console.log(`[${prospectNum}/${allProspects.length}] ${prospect.name}... ✗ no website`);
        }
      }

      // Save checkpoint after each chunk (every 5 prospects)
      checkpoint.stats = { processed, found, emailsFound, verified };
      saveCheckpoint(checkpoint);
    }

    // Progress summary every batch
    const pct = Math.round((processed / allProspects.length) * 100);
    const successRate = Math.round((found / processed) * 100);
    console.log(`\n--- Progress: ${pct}% | Found: ${found}/${processed} (${successRate}%) | Emails: ${emailsFound} | Verified: ${verified} ---\n`);
  }

  console.log('\n=== Phase 1 Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Websites found: ${found} (${Math.round(found/processed*100)}%)`);
  console.log(`Emails extracted: ${emailsFound}`);
  console.log(`Verified as hotels: ${verified}`);

  // Clean up checkpoint on completion
  try {
    fs.unlinkSync(CHECKPOINT_FILE);
    console.log('\n✅ Checkpoint file cleaned up');
  } catch {}
}

main().catch(console.error);
