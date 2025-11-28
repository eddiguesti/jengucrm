export interface ScrapedProperty {
  name: string;
  city: string;
  country: string;
  region?: string;
  job_title: string;
  source: string;
  source_url: string;
  website?: string;
  property_type?: string;
}

export interface ScraperConfig {
  name: string;
  id: string;
  enabled: boolean;
  baseUrl: string;
  locations: string[];
  jobTitles: string[];
}

export interface ScraperResult {
  source: string;
  properties: ScrapedProperty[];
  errors: string[];
  duration: number;
}

// Proxy configuration for IP rotation
export interface ProxyConfig {
  type: 'none' | 'scraperapi' | 'brightdata' | 'custom';
  apiKey?: string;
  endpoint?: string;
  // For custom proxy lists
  proxies?: string[];
}

// Global proxy settings - can be configured via env or settings
let proxyConfig: ProxyConfig = { type: 'none' };
let proxyIndex = 0;

export function setProxyConfig(config: ProxyConfig) {
  proxyConfig = config;
  proxyIndex = 0;
}

export function getProxyConfig(): ProxyConfig {
  return proxyConfig;
}

// User agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getNextProxy(): string | null {
  if (proxyConfig.type === 'none') return null;
  if (proxyConfig.type === 'custom' && proxyConfig.proxies?.length) {
    const proxy = proxyConfig.proxies[proxyIndex % proxyConfig.proxies.length];
    proxyIndex++;
    return proxy;
  }
  return null;
}

export abstract class BaseScraper {
  abstract id: string;
  abstract name: string;
  abstract baseUrl: string;

  protected async fetchPage(url: string, retries = 2): Promise<string> {
    const userAgent = getRandomUserAgent();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let fetchUrl = url;
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        };

        // Apply proxy based on config
        if (proxyConfig.type === 'scraperapi' && proxyConfig.apiKey) {
          // ScraperAPI - prepend their API URL
          fetchUrl = `http://api.scraperapi.com?api_key=${proxyConfig.apiKey}&url=${encodeURIComponent(url)}`;
        } else if (proxyConfig.type === 'brightdata' && proxyConfig.apiKey) {
          // BrightData/Luminati style
          fetchUrl = `${proxyConfig.endpoint || 'http://brd.superproxy.io:22225'}`;
          headers['Proxy-Authorization'] = `Basic ${Buffer.from(proxyConfig.apiKey).toString('base64')}`;
        } else if (proxyConfig.type === 'custom') {
          const proxy = getNextProxy();
          if (proxy) {
            // For custom proxies, we'd need a proxy agent library
            // For now, just rotate user agents
            console.log(`Would use proxy: ${proxy}`);
          }
        }

        const response = await fetch(fetchUrl, { headers });

        if (!response.ok) {
          // If blocked (403/429), retry with different settings
          if ((response.status === 403 || response.status === 429) && attempt < retries) {
            await this.delay(2000 * (attempt + 1)); // Exponential backoff
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.text();
      } catch (error) {
        if (attempt === retries) throw error;
        await this.delay(1000 * (attempt + 1));
      }
    }

    throw new Error('All retry attempts failed');
  }

  protected parseLocation(locationStr: string): { city: string; country: string } {
    const parts = locationStr.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0], country: parts[parts.length - 1] };
    }
    return { city: parts[0] || '', country: '' };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  abstract scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult>;
}
