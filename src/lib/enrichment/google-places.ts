import { PlaceResult, EnrichmentData } from './types';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export async function enrichWithGooglePlaces(
  name: string,
  city: string,
  country: string
): Promise<EnrichmentData> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn('Google Places API key not configured');
    return {};
  }

  try {
    // Use Places API (New) - Text Search endpoint
    // ESSENTIALS TIER ONLY - 10,000 FREE requests/month
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';

    // First: FREE essentials search to get Place ID and basic info
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        // ESSENTIALS FIELDS ONLY (10,000 free/month)
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri',
      },
      body: JSON.stringify({
        textQuery: `${name} hotel ${city} ${country}`,
        maxResultCount: 1,
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchData.places || searchData.places.length === 0) {
      return {};
    }

    const place: PlaceResult = searchData.places[0];

    return {
      google_place_id: place.id,
      full_address: place.formattedAddress || null,
      website: place.websiteUri || null,
    };
  } catch (error) {
    console.error('Google Places API error:', error);
    return {};
  }
}
