import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class HotelcareerScraper extends BaseScraper {
  id = 'hotelcareer';
  name = 'Hotelcareer';
  baseUrl = 'https://www.hotelcareer.com';

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
          errors.push(`Hotelcareer: ${jobTitle} in ${location} - ${error}`);
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

    // Scrape multiple pages (up to 3 pages)
    for (let page = 1; page <= 3; page++) {
      const url = `${this.baseUrl}/jobs/job-offers?search=${searchQuery}&location=${locationQuery}&page=${page}`;

      try {
        const html = await this.fetchPage(url);
        const properties = this.parseJobListings(html, url, jobTitle, location, seenCompanies);

        if (properties.length === 0) break; // No more results
        allProperties.push(...properties);

        if (page < 3) await this.delay(300); // Small delay between pages
      } catch {
        break; // Stop on error
      }
    }

    return allProperties;
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string, seenCompanies: Set<string>): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Primary method: Extract hotel names from job URLs
    // Format: href="/jobs/beau-rivage-hotel-665/chef-de-rang-2950437"
    const jobUrlRegex = /href="\/jobs\/([^\/]+)-\d+\/[^"]+"/gi;
    let match;

    while ((match = jobUrlRegex.exec(html)) !== null) {
      // Convert slug to proper name: "beau-rivage-hotel" -> "Beau Rivage Hotel"
      const slug = match[1];
      const companyName = this.slugToName(slug);
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
        source_url: `${this.baseUrl}/jobs/${slug}`,
        property_type: 'hotel',
      });
    }

    // Fallback: Try other patterns
    if (properties.length === 0) {
      const companyRegex = /class="[^"]*employer[^"]*"[^>]*>([^<]+)</gi;
      const hotelRegex = /class="[^"]*hotel-name[^"]*"[^>]*>([^<]+)</gi;

      while ((match = companyRegex.exec(html)) !== null) {
        const name = match[1].trim();
        const key = name.toLowerCase();
        if (!seenCompanies.has(key)) {
          seenCompanies.add(key);
          const { city, country } = this.parseLocation(defaultLocation);
          properties.push({
            name,
            city,
            country,
            job_title: jobTitle,
            source: this.id,
            source_url: sourceUrl,
            property_type: 'hotel',
          });
        }
      }

      while ((match = hotelRegex.exec(html)) !== null) {
        const name = match[1].trim();
        const key = name.toLowerCase();
        if (!seenCompanies.has(key)) {
          seenCompanies.add(key);
          const { city, country } = this.parseLocation(defaultLocation);
          properties.push({
            name,
            city,
            country,
            job_title: jobTitle,
            source: this.id,
            source_url: sourceUrl,
            property_type: 'hotel',
          });
        }
      }
    }

    return properties;
  }

  private slugToName(slug: string): string {
    // Convert "beau-rivage-hotel" to "Beau Rivage Hotel"
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
