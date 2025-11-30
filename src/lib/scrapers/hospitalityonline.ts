import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class HospitalityOnlineScraper extends BaseScraper {
  id = 'hospitalityonline';
  name = 'Hospitality Online';
  baseUrl = 'https://www.hospitalityonline.com';

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
          errors.push(`HospitalityOnline: ${jobTitle} in ${location} - ${error}`);
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

    // Try different URL patterns
    const urls = [
      `${this.baseUrl}/jobs?q=${searchQuery}&location=${locationQuery}`,
      `${this.baseUrl}/search?keywords=${searchQuery}&location=${locationQuery}`,
    ];

    for (const url of urls) {
      try {
        const html = await this.fetchPage(url);
        const properties = this.parseJobListings(html, url, jobTitle, location, seenCompanies);
        if (properties.length > 0) {
          allProperties.push(...properties);
          break;
        }
      } catch {
        continue;
      }
    }

    return allProperties;
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string, seenCompanies: Set<string>): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Try JSON-LD structured data first
    const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'JobPosting' && data.hiringOrganization?.name) {
          const companyName = data.hiringOrganization.name;
          const key = companyName.toLowerCase();
          if (seenCompanies.has(key)) continue;
          seenCompanies.add(key);

          let city = defaultLocation.split(',')[0]?.trim() || defaultLocation;
          let country = defaultLocation.split(',')[1]?.trim() || '';

          if (data.jobLocation?.address) {
            const addr = data.jobLocation.address;
            city = addr.addressLocality || city;
            country = addr.addressCountry || country;
          }

          properties.push({
            name: companyName,
            city,
            country,
            job_title: data.title || jobTitle,
            source: this.id,
            source_url: data.url || sourceUrl,
            website: data.hiringOrganization.sameAs || data.hiringOrganization.url,
            property_type: 'hotel',
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Fallback: regex patterns for company names
    if (properties.length === 0) {
      const patterns = [
        /data-company="([^"]+)"/gi,
        /class="company[^"]*"[^>]*>([^<]+)</gi,
        /class="employer[^"]*"[^>]*>([^<]+)</gi,
        /"companyName":\s*"([^"]+)"/gi,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const companyName = match[1].trim();
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
    }

    return properties;
  }
}
