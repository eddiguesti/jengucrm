import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export class JournalDesPalacesScraper extends BaseScraper {
  id = 'journaldespalaces';
  name = 'Journal des Palaces';
  baseUrl = 'https://www.journaldespalaces.com';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];
    const seenCompanies = new Set<string>();

    try {
      // Journal des Palaces has a page listing all hotels with job offers
      const url = `${this.baseUrl}/carriere/offres-par-etablissement.html`;
      const html = await this.fetchPage(url);

      // Extract hotels from the JavaScript array on the page
      // Format: "Hotel Name (City - Country)"
      const hotelArrayMatch = html.match(/\["([^"]+)"(?:,"([^"]+)")*\]/);
      if (hotelArrayMatch) {
        // Parse all hotel entries from the page
        const hotelRegex = /"([^"]+)"/g;
        let match;
        while ((match = hotelRegex.exec(html)) !== null) {
          const entry = match[1];
          // Check if this looks like a hotel entry with location: "Hotel Name (City - Country)"
          const hotelMatch = entry.match(/^(.+?)\s*\(([^)]+)\)$/);
          if (hotelMatch) {
            const hotelName = hotelMatch[1].trim();
            const locationStr = hotelMatch[2];

            // Skip duplicates
            const key = hotelName.toLowerCase();
            if (seenCompanies.has(key)) continue;
            seenCompanies.add(key);

            // Parse "City - Country" format
            const locationParts = locationStr.split(' - ');
            const city = locationParts[0]?.trim() || '';
            const country = locationParts[1]?.trim() || '';

            // Filter by requested locations (case-insensitive partial match)
            const matchesLocation = locations.some(loc => {
              const locLower = loc.toLowerCase();
              return city.toLowerCase().includes(locLower) ||
                     country.toLowerCase().includes(locLower) ||
                     locLower.includes(city.toLowerCase()) ||
                     locLower.includes(country.toLowerCase());
            });

            if (matchesLocation || locations.length === 0) {
              properties.push({
                name: hotelName,
                city,
                country,
                job_title: 'Various positions', // JDP doesn't specify job in listing
                source: this.id,
                source_url: url,
                property_type: 'hotel',
              });
            }
          }
        }
      }

      // Also try to extract from plain text hotel names without location format
      // This catches entries like just "Hotel Name" without parentheses
      const plainHotelRegex = /"((?:H[oô]tel|Palace|Maison|La R[eé]serve|Le |The |Four Seasons|Mandarin|Ritz|Shangri)[^"]{3,80})"/gi;
      let plainMatch;
      while ((plainMatch = plainHotelRegex.exec(html)) !== null) {
        const hotelName = plainMatch[1].trim();
        // Skip if it has parentheses (already handled above)
        if (hotelName.includes('(')) continue;

        const key = hotelName.toLowerCase();
        if (seenCompanies.has(key)) continue;
        seenCompanies.add(key);

        // For entries without location, we'll add them but with empty location
        // They can still be enriched later with Google Places
        properties.push({
          name: hotelName,
          city: '',
          country: 'France', // Default to France as JDP is French-focused
          job_title: 'Various positions',
          source: this.id,
          source_url: url,
          property_type: 'hotel',
        });
      }

    } catch (error) {
      errors.push(`Journal des Palaces: Error fetching listings - ${error}`);
    }

    return {
      source: this.id,
      properties,
      errors,
      duration: Date.now() - startTime,
    };
  }
}
