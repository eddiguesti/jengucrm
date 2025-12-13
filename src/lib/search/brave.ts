export interface BraveSearchResult {
  url: string;
  title: string;
}

export async function searchBraveWeb(
  query: string,
  apiKey: string
): Promise<BraveSearchResult[]> {
  const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);

  if (!response || !response.ok) return [];

  const data = await response.json() as {
    web?: { results?: Array<{ url: string; title: string }> };
  };

  const results = data.web?.results || [];
  return results
    .filter(r => typeof r.url === 'string' && typeof r.title === 'string')
    .map(r => ({ url: r.url, title: r.title }))
    .slice(0, 10);
}
