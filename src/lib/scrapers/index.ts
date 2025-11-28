import { HoscoScraper } from './hosco';
import { CatererScraper } from './caterer';
import { HcareersScraper } from './hcareers';
import { HotelcareerScraper } from './hotelcareer';
import { IndeedScraper } from './indeed';
import { LinkedInScraper } from './linkedin';
import { GlassdoorScraper } from './glassdoor';
import { TalentsHotelsScraper } from './talentshotels';
import { JournalDesPalacesScraper } from './journaldespalaces';
import { BaseScraper, ScrapedProperty, ScraperResult } from './types';

export * from './types';

// Scraper status:
// ✅ hosco - Working (extracts from __NEXT_DATA__ JSON)
// ✅ hcareers - Working (extracts from logo alt tags)
// ✅ hotelcareer - Working (extracts from job URLs)
// ✅ talentshotels - Working (extracts from __NEXT_DATA__ JSON)
// ✅ journaldespalaces - Working (extracts from hotel listing page)
// ⚠️ caterer - Often blocked/timeout
// ⚠️ indeed - Returns HTTP 403 (blocked)
// ⚠️ linkedin - Requires authentication
// ⚠️ glassdoor - Requires authentication

// All available scrapers
export const scrapers: Record<string, BaseScraper> = {
  hosco: new HoscoScraper(),
  caterer: new CatererScraper(),
  hcareers: new HcareersScraper(),
  hotelcareer: new HotelcareerScraper(),
  talentshotels: new TalentsHotelsScraper(),
  journaldespalaces: new JournalDesPalacesScraper(),
  indeed: new IndeedScraper(),
  linkedin: new LinkedInScraper(),
  glassdoor: new GlassdoorScraper(),
};

// Recommended scrapers that reliably work
export const recommendedScrapers = ['hosco', 'hcareers', 'hotelcareer', 'talentshotels', 'journaldespalaces'];

export const scraperList = Object.values(scrapers).map(s => ({
  id: s.id,
  name: s.name,
  baseUrl: s.baseUrl,
}));

// Deduplication utilities
export function normalizePropertyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(hotel|resort|inn|suites|spa|the)\b/g, '')
    .trim();
}

export function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

export function generateDedupeKey(property: ScrapedProperty): string {
  const normName = normalizePropertyName(property.name);
  const normCity = normalizeCity(property.city);
  return `${normName}|${normCity}`;
}

export function deduplicateProperties(properties: ScrapedProperty[]): ScrapedProperty[] {
  const seen = new Map<string, ScrapedProperty>();

  for (const property of properties) {
    const key = generateDedupeKey(property);

    if (!seen.has(key)) {
      seen.set(key, property);
    } else {
      // Keep the one with more data
      const existing = seen.get(key)!;
      if ((property.website && !existing.website) || (property.property_type && !existing.property_type)) {
        seen.set(key, { ...existing, ...property, source: `${existing.source},${property.source}` });
      }
    }
  }

  return Array.from(seen.values());
}

// Check against existing database entries
export async function filterNewProperties(
  properties: ScrapedProperty[],
  existingNames: Set<string>
): Promise<{ new: ScrapedProperty[]; duplicates: number }> {
  const newProperties: ScrapedProperty[] = [];
  let duplicates = 0;

  for (const property of properties) {
    const key = generateDedupeKey(property);
    if (!existingNames.has(key)) {
      newProperties.push(property);
      existingNames.add(key); // Prevent duplicates within batch
    } else {
      duplicates++;
    }
  }

  return { new: newProperties, duplicates };
}

// Run multiple scrapers - now in PARALLEL for speed
export async function runScrapers(
  scraperIds: string[],
  locations: string[],
  jobTitles: string[],
  onProgress?: (source: string, status: string) => void
): Promise<{
  results: ScraperResult[];
  allProperties: ScrapedProperty[];
  uniqueProperties: ScrapedProperty[];
  totalErrors: string[];
}> {
  const totalErrors: string[] = [];

  // Run all scrapers in parallel
  const scraperPromises = scraperIds.map(async (scraperId) => {
    const scraper = scrapers[scraperId];
    if (!scraper) {
      totalErrors.push(`Unknown scraper: ${scraperId}`);
      return null;
    }

    onProgress?.(scraper.name, 'running');

    try {
      const result = await scraper.scrape(locations, jobTitles);
      onProgress?.(scraper.name, `completed - ${result.properties.length} found`);
      return result;
    } catch (error) {
      const errorMsg = `${scraper.name} failed: ${error}`;
      totalErrors.push(errorMsg);
      onProgress?.(scraper.name, 'failed');
      return null;
    }
  });

  const settledResults = await Promise.all(scraperPromises);
  const results = settledResults.filter((r): r is ScraperResult => r !== null);

  const allProperties = results.flatMap(r => r.properties);
  results.forEach(r => totalErrors.push(...r.errors));

  const uniqueProperties = deduplicateProperties(allProperties);

  return {
    results,
    allProperties,
    uniqueProperties,
    totalErrors,
  };
}
