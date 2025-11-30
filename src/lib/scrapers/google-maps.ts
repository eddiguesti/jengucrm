/**
 * Google Maps Bulk Scraper
 *
 * Scrapes hotels from Google Places API by location.
 * These are "cold" leads - high volume, lower conversion.
 * Used as Tier 2 backup when hot leads run low.
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Extended result for Google Maps (different from job board scrapers)
export interface GoogleMapsResult {
  success: boolean;
  source: string;
  listings: GoogleMapsListing[];
  totalFound: number;
  errors?: string[];
}

export interface GoogleMapsListing {
  title: string;
  company: string;
  location: string;
  source: string;
  sourceUrl: string;
  postedDate: string;
  description: string;
  metadata?: {
    google_place_id?: string;
    website?: string;
    phone?: string;
    rating?: number;
    review_count?: number;
    city?: string;
    country?: string;
    types?: string[];
    lead_quality?: string;
  };
}

interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
}

interface GoogleMapsConfig {
  location: string;       // e.g., "London, UK"
  radius?: number;        // meters, max 50000
  propertyTypes?: string[]; // e.g., ['hotel', 'resort', 'boutique_hotel']
  minRating?: number;     // e.g., 3.5
  maxResults?: number;    // max 60 per search (API limit is 20 per page, 3 pages)
}

const DEFAULT_PROPERTY_TYPES = [
  'hotel',
  'resort',
  'lodging',
  'boutique hotel',
  'bed and breakfast',
];

/**
 * Search for hotels in a location using Google Places Text Search
 */
async function searchHotels(
  query: string,
  pageToken?: string
): Promise<{ places: PlaceResult[]; nextPageToken?: string }> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places API key not configured');
  }

  const searchUrl = 'https://places.googleapis.com/v1/places:searchText';

  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      // Using ESSENTIALS tier fields (10,000 free/month)
      // Plus some PRO tier for phone/rating (costs $0.004/request)
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.types,nextPageToken',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 20, // Max per request
      pageToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Places API error: ${error}`);
  }

  const data = await response.json();
  return {
    places: data.places || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Convert Google Place to listing format
 */
function placeToListing(place: PlaceResult, location: string): GoogleMapsListing {
  const name = place.displayName?.text || 'Unknown Hotel';

  // Extract city and country from location string
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || '';
  const country = locationParts[1] || locationParts[0] || '';

  return {
    title: 'Hotel/Accommodation', // Generic since not from job board
    company: name,
    location: place.formattedAddress || location,
    source: 'google_maps',
    sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    postedDate: new Date().toISOString(),
    description: `${name} - ${place.rating ? `${place.rating}★ (${place.userRatingCount} reviews)` : 'No rating'} - Found via Google Maps search`,
    metadata: {
      google_place_id: place.id,
      website: place.websiteUri,
      phone: place.nationalPhoneNumber,
      rating: place.rating,
      review_count: place.userRatingCount,
      city,
      country,
      types: place.types,
      lead_quality: 'cold', // Mark as cold lead
    },
  };
}

/**
 * Main scraper function - bulk scrape hotels from a location
 */
export async function scrapeGoogleMaps(config: GoogleMapsConfig): Promise<GoogleMapsResult> {
  const results: GoogleMapsListing[] = [];
  const errors: string[] = [];

  const propertyTypes = config.propertyTypes || DEFAULT_PROPERTY_TYPES;
  const maxResults = config.maxResults || 60;
  const minRating = config.minRating || 0;

  console.log(`[Google Maps] Searching for hotels in ${config.location}`);

  try {
    // Search for each property type
    for (const propertyType of propertyTypes) {
      if (results.length >= maxResults) break;

      const query = `${propertyType} in ${config.location}`;
      let pageToken: string | undefined;
      let pageCount = 0;
      const maxPages = 3; // Google allows max 3 pages (60 results)

      do {
        try {
          const { places, nextPageToken } = await searchHotels(query, pageToken);

          for (const place of places) {
            // Skip if below min rating
            if (minRating && place.rating && place.rating < minRating) {
              continue;
            }

            // Skip if we already have this place (by ID)
            if (results.some(r => r.metadata?.google_place_id === place.id)) {
              continue;
            }

            // Skip if no website (hard to contact)
            if (!place.websiteUri) {
              continue;
            }

            results.push(placeToListing(place, config.location));

            if (results.length >= maxResults) break;
          }

          pageToken = nextPageToken;
          pageCount++;

          // Small delay between pages to avoid rate limits
          if (pageToken && pageCount < maxPages) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          errors.push(`Error searching "${query}": ${error}`);
          break;
        }
      } while (pageToken && pageCount < maxPages && results.length < maxResults);

      // Delay between property type searches
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[Google Maps] Found ${results.length} hotels in ${config.location}`);

    return {
      success: true,
      source: 'google_maps',
      listings: results,
      totalFound: results.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      source: 'google_maps',
      listings: results,
      totalFound: results.length,
      errors: [String(error)],
    };
  }
}

/**
 * Bulk scrape multiple locations
 */
export async function scrapeMultipleLocations(
  locations: string[],
  maxPerLocation: number = 50
): Promise<GoogleMapsResult> {
  const allResults: GoogleMapsListing[] = [];
  const allErrors: string[] = [];

  for (const location of locations) {
    const result = await scrapeGoogleMaps({
      location,
      maxResults: maxPerLocation,
      minRating: 3.0, // Skip really low-rated places
    });

    allResults.push(...result.listings);
    if (result.errors) {
      allErrors.push(...result.errors);
    }

    // Delay between locations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return {
    success: allErrors.length === 0,
    source: 'google_maps',
    listings: allResults,
    totalFound: allResults.length,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Get UK cities for bulk scraping
 */
export function getUKCities(): string[] {
  return [
    'London, UK',
    'Manchester, UK',
    'Birmingham, UK',
    'Edinburgh, UK',
    'Glasgow, UK',
    'Liverpool, UK',
    'Bristol, UK',
    'Leeds, UK',
    'Sheffield, UK',
    'Newcastle, UK',
    'Brighton, UK',
    'Oxford, UK',
    'Cambridge, UK',
    'Bath, UK',
    'York, UK',
    'Cardiff, UK',
    'Belfast, UK',
    'Nottingham, UK',
    'Southampton, UK',
    'Leicester, UK',
  ];
}

/**
 * Get European cities for bulk scraping
 */
export function getEuropeanCities(): string[] {
  return [
    'Paris, France',
    'Barcelona, Spain',
    'Madrid, Spain',
    'Rome, Italy',
    'Milan, Italy',
    'Amsterdam, Netherlands',
    'Berlin, Germany',
    'Munich, Germany',
    'Vienna, Austria',
    'Prague, Czech Republic',
    'Dublin, Ireland',
    'Lisbon, Portugal',
    'Brussels, Belgium',
    'Zurich, Switzerland',
    'Copenhagen, Denmark',
    'Stockholm, Sweden',
    'Oslo, Norway',
    'Athens, Greece',
    'Budapest, Hungary',
    'Warsaw, Poland',
  ];
}
