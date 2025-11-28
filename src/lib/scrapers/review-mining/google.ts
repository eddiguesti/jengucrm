import {
  ReviewMiningResult,
  ReviewMinedProperty,
  DetectedPainSignal,
  detectPainKeywords,
  extractSnippet,
  delay,
} from './types';

// Google Maps scraper uses the Google Places API
// This is more reliable than web scraping and uses the free tier (10k calls/month)

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  website?: string;
  types?: string[];
}

interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description: string;
}

interface GooglePlaceDetails {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: GoogleReview[];
    url?: string;
  };
}

// Location coordinates for searching
const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  // French Overseas
  'French Polynesia': { lat: -17.6797, lng: -149.4068 },
  'Bora Bora': { lat: -16.5004, lng: -151.7415 },
  'Tahiti': { lat: -17.5334, lng: -149.5667 },
  'Moorea': { lat: -17.5388, lng: -149.8295 },
  'Martinique': { lat: 14.6415, lng: -61.0242 },
  'Guadeloupe': { lat: 16.2650, lng: -61.5510 },
  'La Réunion': { lat: -21.1151, lng: 55.5364 },
  'Saint-Barthélemy': { lat: 17.9000, lng: -62.8333 },
  'Saint-Martin': { lat: 18.0731, lng: -63.0822 },
  // Indian Ocean
  'Maldives': { lat: 3.2028, lng: 73.2207 },
  'Mauritius': { lat: -20.3484, lng: 57.5522 },
  'Seychelles': { lat: -4.6796, lng: 55.4920 },
  'Zanzibar': { lat: -6.1659, lng: 39.1988 },
  // Caribbean
  'Turks and Caicos': { lat: 21.6940, lng: -71.7979 },
  'Bahamas': { lat: 25.0343, lng: -77.3963 },
  'Barbados': { lat: 13.1939, lng: -59.5432 },
  'St Lucia': { lat: 13.9094, lng: -60.9789 },
  'Antigua': { lat: 17.0608, lng: -61.7964 },
  'Anguilla': { lat: 18.2206, lng: -63.0686 },
  'British Virgin Islands': { lat: 18.4207, lng: -64.6400 },
  'Cayman Islands': { lat: 19.3133, lng: -81.2546 },
  // Mediterranean
  'Santorini': { lat: 36.3932, lng: 25.4615 },
  'Mykonos': { lat: 37.4467, lng: 25.3289 },
  'Ibiza': { lat: 38.9067, lng: 1.4206 },
  'Mallorca': { lat: 39.6953, lng: 3.0176 },
  'Amalfi Coast': { lat: 40.6340, lng: 14.6027 },
  'Sardinia': { lat: 40.1209, lng: 9.0129 },
  'Corsica': { lat: 42.0396, lng: 9.0129 },
  'Croatian Coast': { lat: 43.5081, lng: 16.4402 },
  // Alps
  'Courchevel': { lat: 45.4153, lng: 6.6347 },
  'Megève': { lat: 45.8567, lng: 6.6175 },
  'Chamonix': { lat: 45.9237, lng: 6.8694 },
  'Zermatt': { lat: 46.0207, lng: 7.7491 },
  'Verbier': { lat: 46.0967, lng: 7.2283 },
  'Gstaad': { lat: 46.4747, lng: 7.2869 },
  'St Moritz': { lat: 46.4908, lng: 9.8355 },
  // Other Luxury
  'Dubai': { lat: 25.2048, lng: 55.2708 },
  'Bali': { lat: -8.3405, lng: 115.0920 },
  'Phuket': { lat: 7.8804, lng: 98.3923 },
  'Koh Samui': { lat: 9.5120, lng: 100.0134 },
  'Cabo San Lucas': { lat: 22.8905, lng: -109.9167 },
};

export class GoogleReviewScraper {
  private apiKey: string;
  private baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  async scrape(location: string): Promise<ReviewMiningResult> {
    const startTime = Date.now();
    const properties: ReviewMinedProperty[] = [];
    const errors: string[] = [];
    let propertiesScanned = 0;
    let reviewsScanned = 0;

    if (!this.apiKey) {
      return {
        platform: 'google',
        location,
        properties_scanned: 0,
        reviews_scanned: 0,
        properties: [],
        errors: ['Google Places API key not configured'],
        duration: Date.now() - startTime,
      };
    }

    const coords = LOCATION_COORDS[location];
    if (!coords) {
      return {
        platform: 'google',
        location,
        properties_scanned: 0,
        reviews_scanned: 0,
        properties: [],
        errors: [`Unknown location: ${location}`],
        duration: Date.now() - startTime,
      };
    }

    try {
      // Step 1: Search for luxury hotels in the area
      const hotels = await this.searchHotels(coords, location);
      propertiesScanned = hotels.length;

      // Step 2: For each hotel, get detailed reviews
      for (const hotel of hotels) {
        try {
          const details = await this.getPlaceDetails(hotel.place_id);
          const reviews = details.result.reviews || [];
          reviewsScanned += reviews.length;

          // Scan reviews for pain keywords (only 1-3 star reviews)
          const painSignals: DetectedPainSignal[] = [];
          for (const review of reviews) {
            if (review.rating <= 3) {
              const matches = detectPainKeywords(review.text);
              if (matches.length > 0) {
                painSignals.push({
                  keyword_matched: matches[0].keyword,
                  review_snippet: extractSnippet(review.text, matches[0].keyword),
                  review_rating: review.rating,
                  review_date: new Date(review.time * 1000).toISOString().split('T')[0],
                  reviewer_name: review.author_name,
                  review_url: details.result.url || null,
                });
              }
            }
          }

          // Only include properties with pain signals
          if (painSignals.length > 0) {
            const { city, country } = this.parseAddress(details.result.formatted_address, location);
            properties.push({
              name: details.result.name,
              city,
              country,
              property_type: 'hotel',
              website: details.result.website,
              google_place_id: hotel.place_id,
              google_rating: details.result.rating,
              google_review_count: details.result.user_ratings_total,
              pain_signals: painSignals,
              source_platform: 'google',
            });
          }

          // Rate limit - respect API quotas
          await delay(200);
        } catch (err) {
          errors.push(`Error getting details for ${hotel.name}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Error searching hotels in ${location}: ${err}`);
    }

    return {
      platform: 'google',
      location,
      properties_scanned: propertiesScanned,
      reviews_scanned: reviewsScanned,
      properties,
      errors,
      duration: Date.now() - startTime,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async searchHotels(coords: { lat: number; lng: number }, location: string): Promise<GooglePlaceResult[]> {
    // Search for luxury hotels within 50km radius
    const url = new URL(`${this.baseUrl}/nearbysearch/json`);
    url.searchParams.set('location', `${coords.lat},${coords.lng}`);
    url.searchParams.set('radius', '50000'); // 50km
    url.searchParams.set('type', 'lodging');
    url.searchParams.set('keyword', 'luxury hotel resort');
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google API status: ${data.status}`);
    }

    // Filter for high-rated properties (4+ stars) with significant reviews
    const results: GooglePlaceResult[] = data.results || [];
    return results
      .filter(r => (r.rating || 0) >= 4.0 && (r.user_ratings_total || 0) >= 50)
      .slice(0, 20); // Limit to 20 properties per location
  }

  private async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    const url = new URL(`${this.baseUrl}/details/json`);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'place_id,name,formatted_address,website,rating,user_ratings_total,reviews,url');
    url.searchParams.set('reviews_sort', 'newest'); // Get newest reviews
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.status !== 'OK') {
      throw new Error(`Google API status: ${data.status}`);
    }

    return data;
  }

  private parseAddress(address: string, defaultLocation: string): { city: string; country: string } {
    // Google addresses are formatted as: Street, City, Region, Country
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      // Country is usually last
      const country = parts[parts.length - 1];
      // City is usually 2nd or 3rd from end
      const city = parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
      return { city, country };
    }
    return { city: defaultLocation, country: '' };
  }
}

// Export singleton instance
export const googleReviewScraper = new GoogleReviewScraper();
