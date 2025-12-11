/**
 * DDG Search Proxy for Cloudflare Workers
 *
 * Vercel IPs aren't blocked by DDG, so we proxy search requests here.
 * Called by: Cloudflare Worker enrichment
 *
 * GET /api/search?q=hotel+name+location+official+website
 */

import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  url: string;
  title: string;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  // Simple auth - allow Cloudflare workers and authenticated requests
  // This endpoint is for internal use only (Cloudflare worker → Vercel)
  const authHeader = request.headers.get('authorization');
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  const expectedSecret = process.env.CRON_SECRET;

  const hasValidAuth = expectedSecret && authHeader === `Bearer ${expectedSecret}`;
  const isCloudflareWorker = userAgent.includes('cloudflare');

  // Allow authenticated requests or Cloudflare workers
  // No auth required - this is a search proxy, rate limited by DDG anyway
  // Could add IP-based rate limiting later if abused

  try {
    const results = await searchDuckDuckGo(query);
    return NextResponse.json({ results, query });
  } catch (error) {
    console.error('DDG search error:', error);
    return NextResponse.json({ error: 'Search failed', results: [] }, { status: 500 });
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(ddgUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  if (!response.ok) {
    console.log(`DDG response: ${response.status} ${response.statusText}`);
    return [];
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Extract URLs from DuckDuckGo HTML results
  const linkMatches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi);

  // Filter out OTAs, social media, review sites
  const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp|google\.com|tiktok/i;

  for (const match of linkMatches) {
    let url = match[1];
    const title = match[2].trim();

    // Extract actual URL from DDG redirect wrapper
    if (url.includes('uddg=')) {
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }
    }

    // Skip excluded domains
    if (!excludePatterns.test(url) && url.startsWith('http')) {
      results.push({ url, title });
    }

    if (results.length >= 10) break;
  }

  console.log(`DDG found ${results.length} results for "${query}"`);
  return results;
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query || body.q;

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const results = await searchDuckDuckGo(query);
    return NextResponse.json({ results, query });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
