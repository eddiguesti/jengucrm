import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class GlassdoorScraper extends BaseScraper {
  id = 'glassdoor';
  name = 'Glassdoor';
  baseUrl = 'https://www.glassdoor.com';

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(3000);
        } catch (error) {
          errors.push(`Glassdoor: ${jobTitle} in ${location} - ${error}`);
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
    const searchQuery = encodeURIComponent(`${jobTitle} hotel`);
    const locationQuery = encodeURIComponent(location.split(',')[0]);
    const url = `${this.baseUrl}/Job/jobs.htm?sc.keyword=${searchQuery}&locT=C&locKeyword=${locationQuery}`;

    try {
      const html = await this.fetchPage(url);
      return this.parseJobListings(html, url, jobTitle, location);
    } catch {
      return [];
    }
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    const employerRegex = /class="[^"]*employer[^"]*"[^>]*>([^<]+)</gi;
    const companyRegex = /data-employer-name="([^"]+)"/gi;
    const locationRegex = /class="[^"]*location[^"]*"[^>]*>([^<]+)</gi;

    const companies: string[] = [];
    const locations: string[] = [];

    let match;
    while ((match = employerRegex.exec(html)) !== null) {
      companies.push(match[1].trim());
    }
    while ((match = companyRegex.exec(html)) !== null) {
      if (!companies.includes(match[1].trim())) {
        companies.push(match[1].trim());
      }
    }
    while ((match = locationRegex.exec(html)) !== null) {
      locations.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < companies.length; i++) {
      const { city, country } = this.parseLocation(locations[i] || defaultLocation);
      properties.push({
        name: companies[i],
        city,
        country,
        job_title: jobTitle,
        source: this.id,
        source_url: sourceUrl,
        property_type: 'hotel',
      });
    }

    return properties;
  }
}
