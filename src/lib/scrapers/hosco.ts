import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

interface HoscoJobResult {
  owner?: { name: string; slug: string };
  company?: { name: string; slug: string };
  displayed_location?: { address_display: string };
  title: string;
  slug: string;
  id: number;
}

interface HoscoNextData {
  props?: {
    pageProps?: {
      initialState?: {
        jobDirectory?: {
          search?: {
            results?: HoscoJobResult[];
          };
        };
      };
    };
  };
}

export class HoscoScraper extends BaseScraper {
  id = 'hosco';
  name = 'Hosco';
  baseUrl = 'https://www.hosco.com';

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];

    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.scrapeSearch(location, jobTitle);
          properties.push(...results);
          await this.delay(500); // Reduced delay - running in parallel
        } catch (error) {
          errors.push(`Hosco: ${jobTitle} in ${location} - ${error}`);
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

    // Scrape multiple pages (up to 3 pages = ~30 results)
    for (let page = 1; page <= 3; page++) {
      const url = `${this.baseUrl}/en/jobs?query=${searchQuery}&location=${locationQuery}&page=${page}`;

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

    // Extract __NEXT_DATA__ JSON from the page
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData: HoscoNextData = JSON.parse(nextDataMatch[1]);
        const results = nextData.props?.pageProps?.initialState?.jobDirectory?.search?.results || [];

        for (const job of results) {
          const companyName = job.owner?.name || job.company?.name;
          if (!companyName) continue;

          // Skip duplicates
          const key = companyName.toLowerCase();
          if (seenCompanies.has(key)) continue;
          seenCompanies.add(key);

          // Parse location from job listing or use default
          const locationStr = job.displayed_location?.address_display || defaultLocation;
          const { city, country } = this.parseLocation(locationStr);

          properties.push({
            name: companyName,
            city,
            country,
            job_title: job.title || jobTitle,
            source: this.id,
            source_url: `${this.baseUrl}/en/job/${job.slug}`,
            property_type: 'hotel',
          });
        }
      } catch {
        // Fall back to regex parsing if JSON fails
      }
    }

    // Fallback: try JSON-LD structured data
    if (properties.length === 0) {
      const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
      for (const match of jsonLdMatches) {
        try {
          const data = JSON.parse(match[1]);
          if (data['@type'] === 'JobPosting' && data.hiringOrganization?.name) {
            const companyName = data.hiringOrganization.name;
            const key = companyName.toLowerCase();
            if (seenCompanies.has(key)) continue;
            seenCompanies.add(key);

            let locationStr = defaultLocation;
            if (data.jobLocation?.address) {
              const addr = data.jobLocation.address;
              locationStr = [addr.addressLocality, addr.addressCountry].filter(Boolean).join(', ');
            }

            const { city, country } = this.parseLocation(locationStr);
            properties.push({
              name: companyName,
              city,
              country,
              job_title: data.title || jobTitle,
              source: this.id,
              source_url: sourceUrl,
              property_type: 'hotel',
            });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return properties;
  }
}
