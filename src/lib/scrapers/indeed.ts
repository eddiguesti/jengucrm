import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

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
  };

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(3000); // Indeed is stricter with rate limits
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
    for (const [country, domain] of Object.entries(this.domains)) {
      if (location.toLowerCase().includes(country.toLowerCase())) {
        return domain;
      }
    }
    return this.baseUrl;
  }

  private async scrapeSearch(location: string, jobTitle: string): Promise<ScrapedProperty[]> {
    const domain = this.getDomain(location);
    const searchQuery = encodeURIComponent(`${jobTitle} hotel`);
    const locationQuery = encodeURIComponent(location.split(',')[0]);
    const url = `${domain}/jobs?q=${searchQuery}&l=${locationQuery}`;

    const html = await this.fetchPage(url);
    return this.parseJobListings(html, url, jobTitle, location);
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Indeed patterns - company names in data attributes and spans
    const companyRegex = /data-company-name="([^"]+)"/gi;
    const companySpanRegex = /class="[^"]*companyName[^"]*"[^>]*>([^<]+)</gi;
    const locationRegex = /class="[^"]*companyLocation[^"]*"[^>]*>([^<]+)</gi;

    const companies: string[] = [];
    const locations: string[] = [];

    let match;
    while ((match = companyRegex.exec(html)) !== null) {
      companies.push(match[1].trim());
    }
    while ((match = companySpanRegex.exec(html)) !== null) {
      const company = match[1].replace(/<[^>]+>/g, '').trim();
      if (company && !companies.includes(company)) {
        companies.push(company);
      }
    }
    while ((match = locationRegex.exec(html)) !== null) {
      locations.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    // Filter for hospitality-related companies
    const hospitalityKeywords = ['hotel', 'resort', 'inn', 'suites', 'marriott', 'hilton', 'hyatt', 'intercontinental', 'accor', 'four seasons', 'ritz', 'mandarin', 'peninsula', 'aman', 'raffles'];

    for (let i = 0; i < companies.length; i++) {
      const companyLower = companies[i].toLowerCase();
      const isHospitality = hospitalityKeywords.some(kw => companyLower.includes(kw));

      // Include all companies from hospitality job searches
      const { city, country } = this.parseLocation(locations[i] || defaultLocation);
      properties.push({
        name: companies[i],
        city,
        country,
        job_title: jobTitle,
        source: this.id,
        source_url: sourceUrl,
        property_type: isHospitality ? 'hotel' : undefined,
      });
    }

    return properties;
  }
}
