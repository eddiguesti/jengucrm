import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

/**
 * HotelJobs.co - European hotel job board
 * Covers UK, France, Germany, Spain, Italy, Switzerland
 */
export class HotelJobsScraper extends BaseScraper {
  id = 'hoteljobs';
  name = 'HotelJobs.co';
  baseUrl = 'https://www.hoteljobs.co';

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(400);
        } catch (error) {
          errors.push(`HotelJobs: ${jobTitle} in ${location} - ${error}`);
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
    const locationQuery = encodeURIComponent(location.split(',')[0].trim());
    const allProperties: ScrapedProperty[] = [];
    const seenCompanies = new Set<string>();

    const url = `${this.baseUrl}/jobs?q=${searchQuery}&l=${locationQuery}`;

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

    // Look for job cards with hotel/employer info
    const patterns = [
      /<div[^>]*class="[^"]*job-card[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)</gi,
      /data-employer-name="([^"]+)"/gi,
      /"employer":\s*{\s*"name":\s*"([^"]+)"/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const companyName = (match[2] || match[1]).trim();
        if (!companyName || companyName.length < 3 || companyName.length > 100) continue;

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
