import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

/**
 * eHotelier - Global hospitality industry job board
 * Major industry site with luxury hotel postings
 */
export class EHotelierScraper extends BaseScraper {
  id = 'ehotelier';
  name = 'eHotelier';
  baseUrl = 'https://www.ehotelier.com';

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(500);
        } catch (error) {
          errors.push(`eHotelier: ${jobTitle} in ${location} - ${error}`);
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

  private async scrapeSearch(location: string, jobTitle: string): Promise<ScrapedProperty[]> {
    const searchQuery = encodeURIComponent(jobTitle);
    const locationQuery = encodeURIComponent(location);
    const allProperties: ScrapedProperty[] = [];
    const seenCompanies = new Set<string>();

    const url = `${this.baseUrl}/jobs/?search_keywords=${searchQuery}&search_location=${locationQuery}`;

    try {
      const html = await this.fetchPage(url);
      const props = this.parseJobListings(html, url, jobTitle, location, seenCompanies);
      allProperties.push(...props);
    } catch {
      // Ignore errors
    }

    return allProperties;
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string, seenCompanies: Set<string>): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Look for job listings with company names
    const patterns = [
      /<li[^>]*class="[^"]*job_listing[^"]*"[^>]*>[\s\S]*?<a[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)</gi,
      /class="company"[^>]*>([^<]+)</gi,
      /data-company="([^"]+)"/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const companyName = match[1].trim();
        if (!companyName || companyName.length < 3 || companyName.length > 100) continue;
        if (companyName.match(/hotel|resort|inn|suites/i) === null) continue; // Filter for hotels only

        const key = companyName.toLowerCase();
        if (seenCompanies.has(key)) continue;
        seenCompanies.add(key);

        const { city, country } = this.parseLocation(defaultLocation);
        properties.push({
          name: companyName,
          city,
          country,
          job_title: jobTitle,
          source: this.id,
          source_url: sourceUrl,
          property_type: 'hotel',
        });
      }
    }

    return properties;
  }
}
