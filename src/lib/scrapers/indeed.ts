import { BaseScraper, ScrapedProperty, ScraperResult, setProxyConfig } from './types';

export class IndeedScraper extends BaseScraper {
  id = 'indeed';
  name = 'Indeed';
  baseUrl = 'https://www.indeed.com';

  // Country-specific Indeed domains
  private domains: Record<string, string> = {
    'UK': 'https://uk.indeed.com',
    'France': 'https://fr.indeed.com',
    'UAE': 'https://ae.indeed.com',
    'USA': 'https://www.indeed.com',
    'Spain': 'https://es.indeed.com',
    'Italy': 'https://it.indeed.com',
    'Singapore': 'https://sg.indeed.com',
    'Hong Kong': 'https://hk.indeed.com',
    'Japan': 'https://jp.indeed.com',
    'Germany': 'https://de.indeed.com',
    'Switzerland': 'https://ch.indeed.com',
    'Netherlands': 'https://nl.indeed.com',
    'Austria': 'https://at.indeed.com',
    'Thailand': 'https://th.indeed.com',
    'Indonesia': 'https://id.indeed.com',
    'Qatar': 'https://qa.indeed.com',
  };

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];
    const seenCompanies = new Set<string>();

    // Configure ScraperAPI for proxy rotation to avoid blocking
    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    if (scraperApiKey) {
      setProxyConfig({
        type: 'scraperapi',
        apiKey: scraperApiKey,
      });
    } else {
      errors.push('Indeed: SCRAPERAPI_KEY not configured - may be blocked');
    }

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle, seenCompanies);
          properties.push(...results);
          // Use shorter delay with proxy, longer without
          await this.delay(scraperApiKey ? 1500 : 4000);
        } catch (error) {
          errors.push(`Indeed: ${jobTitle} in ${location} - ${error}`);
        }
      }
    }

    return {
      source: this.id,
      properties,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private getDomain(location: string): string {
    const locationLower = location.toLowerCase();
    for (const [country, domain] of Object.entries(this.domains)) {
      if (locationLower.includes(country.toLowerCase())) {
        return domain;
      }
    }
    return this.baseUrl;
  }

  private async scrapeSearch(location: string, jobTitle: string, seenCompanies: Set<string>): Promise<ScrapedProperty[]> {
    const domain = this.getDomain(location);
    const searchQuery = encodeURIComponent(`${jobTitle} hotel`);
    const locationQuery = encodeURIComponent(location.split(',')[0].trim());
    const allProperties: ScrapedProperty[] = [];

    // Scrape first 2 pages for more results
    for (let start = 0; start <= 10; start += 10) {
      const url = `${domain}/jobs?q=${searchQuery}&l=${locationQuery}&start=${start}`;

      try {
        const html = await this.fetchPage(url);

        // Check if blocked
        if (html.includes('unusual traffic') || html.includes('captcha') || html.length < 1000) {
          break;
        }

        const pageProps = this.parseJobListings(html, url, jobTitle, location, seenCompanies);
        allProperties.push(...pageProps);

        if (pageProps.length === 0) break;
        await this.delay(1000);
      } catch {
        break;
      }
    }

    return allProperties;
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string, seenCompanies: Set<string>): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Multiple patterns for Indeed's various HTML structures
    const patterns = [
      /data-company-name="([^"]+)"/gi,
      /<span[^>]*class="[^"]*(?:companyName|company)[^"]*"[^>]*>(?:<[^>]+>)*([^<]+)/gi,
      /<span[^>]*data-testid="company-name"[^>]*>([^<]+)/gi,
      /"companyName":\s*"([^"]+)"/gi,
    ];

    const hospitalityKeywords = [
      'hotel', 'resort', 'inn', 'suites', 'marriott', 'hilton', 'hyatt',
      'intercontinental', 'accor', 'four seasons', 'ritz', 'mandarin',
      'peninsula', 'aman', 'raffles', 'fairmont', 'kempinski', 'sofitel',
      'sheraton', 'westin', 'radisson', 'best western', 'wyndham', 'ihg',
      'holiday inn', 'crowne plaza', 'palace', 'spa', 'hospitality'
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const name = match[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
          .trim();

        if (!name || name.length < 3 || name.length > 100) continue;

        const key = name.toLowerCase().replace(/\s+/g, '');
        if (seenCompanies.has(key)) continue;
        seenCompanies.add(key);

        const nameLower = name.toLowerCase();
        const isHospitality = hospitalityKeywords.some(kw => nameLower.includes(kw));

        const { city, country } = this.parseLocation(defaultLocation);
        properties.push({
          name,
          city,
          country,
          job_title: jobTitle,
          source: this.id,
          source_url: sourceUrl,
          property_type: isHospitality ? 'hotel' : 'hospitality',
        });
      }
    }

    return properties;
  }
}
