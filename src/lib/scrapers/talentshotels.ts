import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

interface TalentsHotelsJob {
  Id: number;
  slug_url: string;
  Intitule: string;
  Ville: string;
  Pays: string;
  etablissement_nom?: string;
  Nom_Entreprise?: string;
}

interface TalentsHotelsNextData {
  props?: {
    pageProps?: {
      postes?: TalentsHotelsJob[];
    };
  };
}

export class TalentsHotelsScraper extends BaseScraper {
  id = 'talentshotels';
  name = 'TalentsHotels';
  baseUrl = 'https://www.talentshotels.com';

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
          errors.push(`TalentsHotels: ${jobTitle} in ${location} - ${error}`);
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

    // Scrape multiple pages
    for (let page = 1; page <= 3; page++) {
      const url = `${this.baseUrl}/emplois-hotellerie?search=${searchQuery}&location=${locationQuery}&page=${page}`;

      try {
        const html = await this.fetchPage(url);
        const properties = this.parseJobListings(html, jobTitle, location, seenCompanies);

        if (properties.length === 0) break;
        allProperties.push(...properties);

        if (page < 3) await this.delay(300);
      } catch {
        break;
      }
    }

    return allProperties;
  }

  private parseJobListings(html: string, jobTitle: string, defaultLocation: string, seenCompanies: Set<string>): ScrapedProperty[] {
    const properties: ScrapedProperty[] = [];

    // Extract __NEXT_DATA__ JSON from the page
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData: TalentsHotelsNextData = JSON.parse(nextDataMatch[1]);
        const jobs = nextData.props?.pageProps?.postes || [];

        for (const job of jobs) {
          // Get hotel/establishment name
          const companyName = job.etablissement_nom || job.Nom_Entreprise;
          if (!companyName || companyName === 'Établissement') continue;

          // Skip duplicates
          const key = companyName.toLowerCase();
          if (seenCompanies.has(key)) continue;
          seenCompanies.add(key);

          // Get location from job or use default
          const city = job.Ville || defaultLocation.split(',')[0]?.trim() || defaultLocation;
          const country = job.Pays || defaultLocation.split(',')[1]?.trim() || '';

          properties.push({
            name: companyName,
            city,
            country,
            job_title: job.Intitule || jobTitle,
            source: this.id,
            source_url: `${this.baseUrl}/emploi/${job.slug_url}`,
            property_type: 'hotel',
          });
        }
      } catch {
        // Fall back to regex if JSON fails
      }
    }

    // Fallback: try regex patterns if JSON parsing fails
    if (properties.length === 0) {
      // Look for hotel names in card patterns
      const hotelRegex = /etablissement_nom"?:\s*"([^"]+)"/gi;
      let match;
      while ((match = hotelRegex.exec(html)) !== null) {
        const hotelName = match[1];
        if (!hotelName || hotelName === 'Établissement') continue;

        const key = hotelName.toLowerCase();
        if (seenCompanies.has(key)) continue;
        seenCompanies.add(key);

        const { city, country } = this.parseLocation(defaultLocation);
        properties.push({
          name: hotelName,
          city,
          country,
          job_title: jobTitle,
          source: this.id,
          source_url: this.baseUrl,
          property_type: 'hotel',
        });
      }
    }

    return properties;
  }
}
