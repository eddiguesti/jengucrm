import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class CatererScraper extends BaseScraper {
  id = 'caterer';
  name = 'Caterer.com';
  baseUrl = 'https://www.caterer.com';

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(2500);
        } catch (error) {
          errors.push(`Caterer: ${jobTitle} in ${location} - ${error}`);
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
    // Caterer.com URL structure
    const searchQuery = encodeURIComponent(jobTitle);
    const locationQuery = encodeURIComponent(location.split(',')[0]); // Just city name
    const url = `${this.baseUrl}/jobs/${locationQuery}?Keywords=${searchQuery}`;

    const html = await this.fetchPage(url);
    return this.parseJobListings(html, url, jobTitle, location);
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Look for job listing patterns in Caterer.com
    // Company names often in spans or divs with employer/company class
    const employerRegex = /class="[^"]*employer[^"]*"[^>]*>([^<]+)</gi;
    const companyRegex = /class="[^"]*company[^"]*"[^>]*>([^<]+)</gi;
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
      locations.push(match[1].trim());
    }

    // Try JSON-LD
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const jsonBlock of jsonLdMatches) {
        try {
          const jsonStr = jsonBlock.replace(/<\/?script[^>]*>/gi, '');
          const data = JSON.parse(jsonStr);

          if (Array.isArray(data)) {
            for (const item of data) {
              if (item['@type'] === 'JobPosting' && item.hiringOrganization) {
                companies.push(item.hiringOrganization.name);
                if (item.jobLocation?.address) {
                  locations.push(`${item.jobLocation.address.addressLocality}, ${item.jobLocation.address.addressCountry}`);
                }
              }
            }
          } else if (data['@type'] === 'JobPosting' && data.hiringOrganization) {
            companies.push(data.hiringOrganization.name);
          }
        } catch {
          // Skip
        }
      }
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
