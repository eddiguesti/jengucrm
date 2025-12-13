import { config } from '@/lib/config';
import { searchDuckDuckGo, type SearchResult } from '@/lib/search/ddg';
import { searchBraveWeb } from '@/lib/search/brave';
import { logger } from '@/lib/logger';

export interface OfficialWebsiteResult {
  website: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
  candidates: SearchResult[];
}

const EXCLUDE_PATTERNS =
  /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|x\.com|instagram|linkedin|youtube|wikipedia|yelp|google\.com|tiktok|hotelmix|hotelmix|hoursmap|opentable/i;

export function isExcludedWebsite(url: string): boolean {
  const normalized = normalizeUrl(url) || url.trim();
  return EXCLUDE_PATTERNS.test(normalized);
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
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

async function verifyWebsiteUrl(url: string): Promise<boolean> {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  if (isExcludedWebsite(normalized)) return false;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  };

  const head = await fetchWithTimeout(normalized, { method: 'HEAD', headers }, 8000);
  if (head && (head.ok || [403, 405].includes(head.status))) return true;

  const get = await fetchWithTimeout(
    normalized,
    { method: 'GET', headers: { ...headers, Range: 'bytes=0-2048' } },
    12000
  );
  return !!get && (get.ok || [403, 405].includes(get.status));
}

function looksLikeHospitalitySite(htmlSnippet: string): boolean {
  const text = htmlSnippet.toLowerCase();

  const positive = [
    'hotel',
    'resort',
    'inn',
    'lodge',
    'accommodation',
    'rooms',
    'suites',
    'book now',
    'booking',
    'availability',
    'check-in',
    'check in',
    'check-out',
    'check out',
    'campsite',
    'campground',
    'camping',
    'glamping',
    'holiday park',
    'caravan',
    'pitch',
  ];

  const negative = [
    'software',
    'saas',
    'equipment',
    'corporation',
    'manufacturing',
    'wholesale',
    'logistics',
    'industrial',
  ];

  const hasPositive = positive.some(k => text.includes(k));
  const hasNegative = negative.some(k => text.includes(k));

  if (!hasPositive && hasNegative) return false;
  return hasPositive;
}

export async function verifyAccommodationWebsite(url: string): Promise<boolean> {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  if (isExcludedWebsite(normalized)) return false;

  const ok = await verifyWebsiteUrl(normalized);
  if (!ok) return false;

  const response = await fetchWithTimeout(
    normalized,
    { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html', Range: 'bytes=0-8192' } },
    12000
  );
  if (!response || !response.ok) return true; // don't false-negative on blocks/timeouts

  const snippet = (await response.text()).slice(0, 8000);
  return looksLikeHospitalitySite(snippet);
}

function mergeAndFilterCandidates(
  a: SearchResult[],
  b: SearchResult[]
): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();

  for (const r of [...a, ...b]) {
    const normalized = normalizeUrl(r.url);
    if (!normalized) continue;
    if (EXCLUDE_PATTERNS.test(normalized)) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: normalized, title: r.title });
    if (out.length >= 10) break;
  }

  return out;
}

async function chooseWithGrok(
  companyName: string,
  location: string | null,
  candidates: SearchResult[]
): Promise<{ website: string | null; confidence: OfficialWebsiteResult['confidence']; reasoning: string }> {
  if (!config.ai.xaiApiKey) {
    return { website: null, confidence: 'none', reasoning: 'No AI API key configured' };
  }

  const candidateText = candidates.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}`).join('\n');

  const prompt = `You are selecting the OFFICIAL website for an accommodation property.

BUSINESS: ${companyName}
LOCATION: ${location || 'Unknown'}

CANDIDATES:
${candidateText}

Rules:
- We ONLY want hotels, resorts, campsites/campgrounds/holiday parks/glamping. If this is not an accommodation property, return null.
- Only pick the property's own official website.
- Never pick OTAs (booking.com, expedia, hotels.com, agoda, trivago), review/directory sites, or social media.
- If uncertain, return null.

Return JSON only:
{"website": "https://..." or null, "confidence": "high"|"medium"|"low"|"none", "reasoning": "one sentence"}`;

  const response = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.xaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 220,
    }),
  }, 15000);

  if (!response) {
    return { website: null, confidence: 'none', reasoning: 'AI error: timeout' };
  }

  if (!response.ok) {
    return { website: null, confidence: 'none', reasoning: `AI error: HTTP ${response.status}` };
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return { website: null, confidence: 'none', reasoning: 'AI parse error' };

  try {
    const parsed = JSON.parse(match[0]) as { website?: string | null; confidence?: OfficialWebsiteResult['confidence']; reasoning?: string };
    return {
      website: parsed.website ? String(parsed.website) : null,
      confidence: parsed.confidence || 'none',
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return { website: null, confidence: 'none', reasoning: 'AI parse error' };
  }
}

export async function findOfficialWebsite(
  companyName: string,
  location?: string | null
): Promise<OfficialWebsiteResult> {
  const query = `${companyName} ${location || ''} official website`.trim();

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const [ddgResults, braveResults] = await Promise.all([
    searchDuckDuckGo(query),
    braveKey ? searchBraveWeb(query, braveKey) : Promise.resolve([]),
  ]);

  const candidates = mergeAndFilterCandidates(
    ddgResults,
    braveResults.map(r => ({ url: r.url, title: r.title }))
  );

  if (candidates.length === 0) {
    return { website: null, confidence: 'none', reasoning: 'No search results', candidates: [] };
  }

  const chosen = await chooseWithGrok(companyName, location || null, candidates);
  if (!chosen.website) {
    return { website: null, confidence: chosen.confidence, reasoning: chosen.reasoning || 'No website selected', candidates };
  }

  const ok = await verifyWebsiteUrl(chosen.website);
  if (!ok) {
    logger.info({ companyName, chosen: chosen.website }, 'Official website failed verification');
    return { website: null, confidence: 'none', reasoning: 'Chosen website did not verify', candidates };
  }

  // Extra safeguard: sanity-check that the homepage looks like accommodation.
  const homepage = normalizeUrl(chosen.website);
  if (homepage) {
    const response = await fetchWithTimeout(
      homepage,
      { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } },
      12000
    );
    if (response && response.ok) {
      const snippet = (await response.text()).slice(0, 8000);
      if (!looksLikeHospitalitySite(snippet)) {
        return { website: null, confidence: 'none', reasoning: 'Website does not look like a hotel/resort/campsite', candidates };
      }
    }
  }

  return {
    website: chosen.website,
    confidence: chosen.confidence,
    reasoning: chosen.reasoning || 'Selected by analysis',
    candidates,
  };
}
