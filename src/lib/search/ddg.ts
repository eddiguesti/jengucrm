export interface SearchResult {
  url: string;
  title: string;
}

const EXCLUDE_PATTERNS =
  /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|x\.com|instagram|linkedin|youtube|wikipedia|yelp|google\.com|tiktok/i;

function decodeDdgRedirect(url: string): string {
  if (!url.includes('uddg=')) return url;
  const match = url.match(/uddg=([^&]+)/);
  if (!match) return url;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return url;
  }
}

export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(ddgUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);

  if (!response || !response.ok) return [];

  const html = await response.text();
  const results: SearchResult[] = [];

  const linkMatches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi);

  for (const match of linkMatches) {
    const rawUrl = match[1];
    const title = match[2].trim();

    const url = decodeDdgRedirect(rawUrl);

    if (url.startsWith('http') && !EXCLUDE_PATTERNS.test(url)) {
      results.push({ url, title });
    }

    if (results.length >= 10) break;
  }

  return results;
}
