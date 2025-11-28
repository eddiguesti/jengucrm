import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class LinkedInScraper extends BaseScraper {
  id = 'linkedin';
  name = 'LinkedIn Jobs';
  baseUrl = 'https://www.linkedin.com';

  // LinkedIn location IDs for major cities
  private locationIds: Record<string, string> = {
    'London': '102257491',
    'Paris': '105015875',
    'Dubai': '104305776',
    'New York': '102571732',
    'Miami': '102982884',
    'Barcelona': '100994331',
    'Rome': '103819130',
    'Singapore': '102454443',
    'Hong Kong': '102890719',
    'Tokyo': '102257491',
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
          await this.delay(4000); // LinkedIn is very strict
        } catch (error) {
          errors.push(`LinkedIn: ${jobTitle} in ${location} - ${error}`);
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

  private getLocationId(location: string): string | null {
    for (const [city, id] of Object.entries(this.locationIds)) {
      if (location.toLowerCase().includes(city.toLowerCase())) {
        return id;
      }
    }
    return null;
  }

  private async scrapeSearch(location: string, jobTitle: string): Promise<ScrapedProperty[]> {
    // LinkedIn guest job search endpoint
    const searchQuery = encodeURIComponent(`${jobTitle} hotel`);
    const locationQuery = encodeURIComponent(location.split(',')[0]);

    // Use the public jobs API endpoint
    const url = `${this.baseUrl}/jobs/search?keywords=${searchQuery}&location=${locationQuery}`;

    try {
      const html = await this.fetchPage(url);
      return this.parseJobListings(html, url, jobTitle, location);
    } catch {
      // LinkedIn often blocks scrapers - return empty
      return [];
    }
  }

  private parseJobListings(html: string, sourceUrl: string, jobTitle: string, defaultLocation: string): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // LinkedIn patterns
    const companyRegex = /class="[^"]*company[^"]*"[^>]*>([^<]+)</gi;
    const subtitleRegex = /class="[^"]*subtitle[^"]*"[^>]*>([^<]+)</gi;
    const locationRegex = /class="[^"]*location[^"]*"[^>]*>([^<]+)</gi;

    // Try JSON-LD first (more reliable)
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const jsonBlock of jsonLdMatches) {
        try {
          const jsonStr = jsonBlock.replace(/<\/?script[^>]*>/gi, '');
          const data = JSON.parse(jsonStr);

          if (data['@type'] === 'JobPosting' && data.hiringOrganization) {
            const { city, country } = this.parseLocation(
              data.jobLocation?.address?.addressLocality
                ? `${data.jobLocation.address.addressLocality}, ${data.jobLocation.address.addressCountry}`
                : defaultLocation
            );

            properties.push({
              name: data.hiringOrganization.name,
              city,
              country,
              job_title: jobTitle,
              source: this.id,
              source_url: sourceUrl,
              website: data.hiringOrganization.sameAs || undefined,
              property_type: 'hotel',
            });
          }

          // Handle array of job postings
          if (Array.isArray(data['@graph'])) {
            for (const item of data['@graph']) {
              if (item['@type'] === 'JobPosting' && item.hiringOrganization) {
                const { city, country } = this.parseLocation(defaultLocation);
                properties.push({
                  name: item.hiringOrganization.name,
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
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // Fallback to regex
    if (properties.length === 0) {
      const companies: string[] = [];
      const locations: string[] = [];

      let match;
      while ((match = companyRegex.exec(html)) !== null) {
        companies.push(match[1].trim());
      }
      while ((match = subtitleRegex.exec(html)) !== null) {
        const company = match[1].replace(/<[^>]+>/g, '').trim();
        if (company && !companies.includes(company)) {
          companies.push(company);
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
    }

    return properties;
  }
}
