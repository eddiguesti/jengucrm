import { EnrichmentData } from './types';
import { logger } from '@/lib/logger';

/**
 * DISABLED: Google Places API has been disabled to avoid unexpected charges.
 * Even the "Essentials" tier can incur costs.
 *
 * Use Grok AI for hotel research instead - see src/lib/hotel-research.ts
 * Or use the enrichment script: npx ts-node scripts/enrich-phase1-google-search.ts
 */
export async function enrichWithGooglePlaces(
  _name: string,
  _city: string,
  _country: string
): Promise<EnrichmentData> {
  // DISABLED: Google Places API costs money
  // Use Grok AI (hotel-research.ts) or DuckDuckGo instead
  logger.info('Google Places API disabled - use Grok for hotel research instead');
  return {};
}
