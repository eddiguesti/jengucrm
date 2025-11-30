import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

/**
 * Adzuna - Global job aggregator with a public API
 * Uses their free API (requires ADZUNA_APP_ID and ADZUNA_API_KEY)
 * Get API keys at: https://developer.adzuna.com/
 *
 * API is free with generous limits - can be aggressive
 */

interface AdzunaJob {
  id: string;
  title: string;
  company: {
    display_name: string;
  };
  location: {
    display_name: string;
    area?: string[];
  };
  redirect_url: string;
  description?: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
}

export class AdzunaScraper extends BaseScraper {
  id = 'adzuna';
  name = 'Adzuna';
  baseUrl = 'https://api.adzuna.com';

  // Country codes for Adzuna API
  private countryCodes: Record<string, string> = {
    'UK': 'gb',
    'France': 'fr',
    'Germany': 'de',
    'USA': 'us',
    'Netherlands': 'nl',
    'Italy': 'it',
    'Spain': 'es',
    'Austria': 'at',
    'Switzerland': 'ch',
    'Singapore': 'sg',
    'India': 'in',
    'Australia': 'au',
    'New Zealand': 'nz',
    'Canada': 'ca',
    'South Africa': 'za',
    'Brazil': 'br',
    'Poland': 'pl',
    'Belgium': 'be',
  };

  async scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult> {
    const startTime = Date.now();
    const properties: ScrapedProperty[] = [];
    const errors: string[] = [];
    const seenCompanies = new Set<string>();

    const appId = process.env.ADZUNA_APP_ID;
    const apiKey = process.env.ADZUNA_API_KEY;

    if (!appId || !apiKey) {
      // Fallback to web scraping if API not configured
      errors.push('Adzuna: API credentials not configured (ADZUNA_APP_ID, ADZUNA_API_KEY)');
      return {
        source: this.id,
        properties: [],
        errors,
        duration: Date.now() - startTime,
      };
    }

    // Adzuna API is very fast - can be aggressive
    for (const location of locations) {
      for (const jobTitle of jobTitles) {
        try {
          const results = await this.searchAPI(location, jobTitle, appId, apiKey, seenCompanies);
          properties.push(...results);
          // Very short delay - API is fast and allows high rate
          await this.delay(200);
        } catch (error) {
          errors.push(`Adzuna: ${jobTitle} in ${location} - ${error}`);
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

  private getCountryCode(location: string): string {
    const locationLower = location.toLowerCase();
    for (const [country, code] of Object.entries(this.countryCodes)) {
      if (locationLower.includes(country.toLowerCase())) {
        return code;
      }
    }
    // Default to GB
    return 'gb';
  }

  private async searchAPI(
    location: string,
    jobTitle: string,
    appId: string,
    apiKey: string,
    seenCompanies: Set<string>
  ): Promise<ScrapedProperty[]> {
    const countryCode = this.getCountryCode(location);
    const query = encodeURIComponent(`${jobTitle} hotel`);
    const where = encodeURIComponent(location.split(',')[0].trim());

    const allProperties: ScrapedProperty[] = [];

    // Get first 2 pages (50 results per page)
    for (let page = 1; page <= 2; page++) {
      const url = `${this.baseUrl}/api/version1/api/jobs/${countryCode}/search/${page}?app_id=${appId}&app_key=${apiKey}&results_per_page=50&what=${query}&where=${where}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data: AdzunaResponse = await response.json();

        if (!data.results || data.results.length === 0) break;

        for (const job of data.results) {
          const companyName = job.company?.display_name;
          if (!companyName || companyName.length < 3) continue;

          const key = companyName.toLowerCase().replace(/\s+/g, '');
          if (seenCompanies.has(key)) continue;
          seenCompanies.add(key);

          const hospitalityKeywords = [
            'hotel', 'resort', 'inn', 'suites', 'marriott', 'hilton', 'hyatt',
            'intercontinental', 'accor', 'four seasons', 'ritz', 'mandarin',
            'peninsula', 'aman', 'raffles', 'fairmont', 'kempinski', 'sofitel',
            'sheraton', 'westin', 'radisson', 'best western', 'wyndham', 'ihg',
            'holiday inn', 'crowne plaza', 'palace', 'spa', 'hospitality'
          ];

          const nameLower = companyName.toLowerCase();
          const isHospitality = hospitalityKeywords.some(kw => nameLower.includes(kw));

          // Parse location from API response
          let city = location.split(',')[0].trim();
          let country = location.split(',')[1]?.trim() || '';

          if (job.location?.area && job.location.area.length > 0) {
            city = job.location.area[0] || city;
            country = job.location.area[job.location.area.length - 1] || country;
          }

          allProperties.push({
            name: companyName,
            city,
            country,
            job_title: job.title || jobTitle,
            source: this.id,
            source_url: job.redirect_url || `https://www.adzuna.co.uk/jobs`,
            property_type: isHospitality ? 'hotel' : 'hospitality',
          });
        }

        if (data.results.length < 50) break; // Less than full page = last page
        await this.delay(100); // Very short delay between pages
      } catch {
        break;
      }
    }

    return allProperties;
  }
}
