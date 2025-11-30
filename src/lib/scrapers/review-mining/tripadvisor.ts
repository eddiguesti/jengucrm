import {
  ReviewMiningResult,
  ReviewMinedProperty,
  DetectedPainSignal,
  detectPainKeywords,
  extractSnippet,
  getRandomUserAgent,
  delay,
} from './types';

// TripAdvisor location IDs for target destinations
// These are used in TripAdvisor URLs
const LOCATION_IDS: Record<string, string> = {
  // French Overseas
  'French Polynesia': 'g294332',
  'Bora Bora': 'g311415',
  'Tahiti': 'g294331',
  'Moorea': 'g311417',
  'Martinique': 'g147327',
  'Guadeloupe': 'g147326',
  'La Réunion': 'g616149',
  'Saint-Barthélemy': 'g147330',
  'Saint-Martin': 'g147331',
  // Indian Ocean
  'Maldives': 'g293953',
  'Mauritius': 'g293816',
  'Seychelles': 'g293813',
  'Zanzibar': 'g325636',
  // Caribbean
  'Turks and Caicos': 'g147396',
  'Bahamas': 'g147414',
  'Barbados': 'g147262',
  'St Lucia': 'g147345',
  'Antigua': 'g147244',
  'Anguilla': 'g147241',
  'British Virgin Islands': 'g147356',
  'Cayman Islands': 'g147366',
  // Mediterranean
  'Santorini': 'g189433',
  'Mykonos': 'g189430',
  'Ibiza': 'g187460',
  'Mallorca': 'g187463',
  'Amalfi Coast': 'g187776',
  'Sardinia': 'g187879',
  'Corsica': 'g187121',
  'Croatian Coast': 'g294452',
  // Alps
  'Courchevel': 'g187259',
  'Megève': 'g187262',
  'Chamonix': 'g187260',
  'Zermatt': 'g188098',
  'Verbier': 'g188100',
  'Gstaad': 'g188076',
  'St Moritz': 'g188068',
  // Other Luxury
  'Dubai': 'g295424',
  'Bali': 'g294226',
  'Phuket': 'g293920',
  'Koh Samui': 'g293918',
  'Cabo San Lucas': 'g152515',
};

interface TripAdvisorReview {
  text: string;
  rating: number;
  date: string;
  reviewer_name: string;
  review_url: string;
}

interface TripAdvisorProperty {
  name: string;
  url: string;
  rating: number;
  review_count: number;
  price_level: string;
  location: string;
}

export class TripAdvisorScraper {
  private baseUrl = 'https://www.tripadvisor.com';

  async scrape(location: string): Promise<ReviewMiningResult> {
    const startTime = Date.now();
    const properties: ReviewMinedProperty[] = [];
    const errors: string[] = [];
    let propertiesScanned = 0;
    let reviewsScanned = 0;

    const locationId = LOCATION_IDS[location];
    if (!locationId) {
      return {
        platform: 'tripadvisor',
        location,
        properties_scanned: 0,
        reviews_scanned: 0,
        properties: [],
        errors: [`Unknown location: ${location}. Add location ID to LOCATION_IDS.`],
        duration: Date.now() - startTime,
      };
    }

    try {
      // Step 1: Get list of luxury hotels in the location
      const hotelList = await this.getHotelList(locationId, location);
      propertiesScanned = hotelList.length;

      // Step 2: For each hotel, get reviews and scan for pain signals
      for (const hotel of hotelList) {
        try {
          const { reviews, total } = await this.getHotelReviews(hotel.url, hotel.name);
          reviewsScanned += total;

          // Scan reviews for pain keywords
          const painSignals: DetectedPainSignal[] = [];
          for (const review of reviews) {
            const matches = detectPainKeywords(review.text);
            if (matches.length > 0) {
              // Only care about low-rated reviews with pain signals
              if (review.rating <= 3) {
                painSignals.push({
                  keyword_matched: matches[0].keyword,
                  review_snippet: extractSnippet(review.text, matches[0].keyword),
                  review_rating: review.rating,
                  review_date: review.date,
                  reviewer_name: review.reviewer_name,
                  review_url: review.review_url,
                });
              }
            }
          }

          // Only include properties with pain signals
          if (painSignals.length > 0) {
            const { city, country } = this.parseLocation(hotel.location, location);
            properties.push({
              name: hotel.name,
              city,
              country,
              property_type: 'hotel',
              tripadvisor_url: `${this.baseUrl}${hotel.url}`,
              google_rating: hotel.rating,
              google_review_count: hotel.review_count,
              pain_signals: painSignals,
              source_platform: 'tripadvisor',
            });
          }

          // Rate limit - be respectful
          await delay(2000 + Math.random() * 1000);
        } catch (err) {
          errors.push(`Error scraping ${hotel.name}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Error fetching hotel list for ${location}: ${err}`);
    }

    return {
      platform: 'tripadvisor',
      location,
      properties_scanned: propertiesScanned,
      reviews_scanned: reviewsScanned,
      properties,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private async getHotelList(locationId: string, locationName: string): Promise<TripAdvisorProperty[]> {
    // TripAdvisor uses a dynamic structure, we'll parse the search results page
    // Filter for luxury hotels (5-star, high-end)
    const url = `${this.baseUrl}/Hotels-${locationId}-Hotels-${encodeURIComponent(locationName.replace(/\s+/g, '_'))}.html`;

    try {
      const html = await this.fetchPage(url);
      return this.parseHotelList(html);
    } catch (err) {
      console.error('Failed to get hotel list:', err);
      return [];
    }
  }

  private parseHotelList(html: string): TripAdvisorProperty[] {
    const hotels: TripAdvisorProperty[] = [];

    // TripAdvisor embeds data in script tags as JSON
    // Look for the hotel data in __WEB_CONTEXT__ or similar
    const jsonMatch = html.match(/window\.__WEB_CONTEXT__\s*=\s*(\{[\s\S]*?\});/);
    if (jsonMatch) {
      try {
        // Parse the complex nested structure
        // This is simplified - real implementation would need to navigate the structure
        JSON.parse(jsonMatch[1]);
        // Extract hotels from the data structure
        // Structure varies by page type - would need further parsing
      } catch {
        // Fall back to regex parsing
      }
    }

    // Regex fallback for hotel cards
    const hotelCardRegex = /<div[^>]*class="[^"]*listing[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(\/Hotel_Review[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = hotelCardRegex.exec(html)) !== null) {
      const url = match[1];
      const nameMatch = match[2].match(/<span[^>]*>(.*?)<\/span>/);
      const name = nameMatch ? this.cleanText(nameMatch[1]) : '';

      if (name) {
        // Extract rating
        const ratingMatch = match[0].match(/(\d+\.?\d*)\s*of\s*5\s*bubbles/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        // Extract review count
        const reviewMatch = match[0].match(/([\d,]+)\s*reviews?/i);
        const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

        hotels.push({
          name,
          url,
          rating,
          review_count: reviewCount,
          price_level: '',
          location: '',
        });
      }
    }

    // Limit to top 20 luxury hotels (highest rated with most reviews)
    return hotels
      .filter(h => h.rating >= 4.0)
      .sort((a, b) => b.review_count - a.review_count)
      .slice(0, 20);
  }

  private async getHotelReviews(hotelUrl: string, hotelName: string): Promise<{ reviews: TripAdvisorReview[]; total: number }> {
    // TripAdvisor reviews can be filtered by rating
    // We want 1-3 star reviews only (where pain signals are)
    const lowRatingUrl = `${this.baseUrl}${hotelUrl}`.replace('.html', '-or10-low_rating.html');

    try {
      const html = await this.fetchPage(lowRatingUrl);
      return this.parseReviews(html, hotelUrl);
    } catch {
      return { reviews: [], total: 0 };
    }
  }

  private parseReviews(html: string, hotelUrl: string): { reviews: TripAdvisorReview[]; total: number } {
    const reviews: TripAdvisorReview[] = [];

    // Look for review data in page
    // TripAdvisor uses React hydration with JSON data
    const reviewDataMatch = html.match(/"reviewListPage":\s*(\{[\s\S]*?\})\s*,\s*"/);
    if (reviewDataMatch) {
      try {
        JSON.parse(reviewDataMatch[1]);
        // Parse reviews from data structure - would need further parsing
      } catch {
        // Fall back to regex
      }
    }

    // Regex fallback for review text
    const reviewRegex = /<div[^>]*class="[^"]*review-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const ratingRegex = /<span[^>]*class="[^"]*ui_bubble_rating[^"]*bubble_(\d+)[^"]*"/i;
    const textRegex = /<p[^>]*class="[^"]*partial_entry[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
    const dateRegex = /<span[^>]*class="[^"]*ratingDate[^"]*"[^>]*title="([^"]+)"/i;
    const userRegex = /<a[^>]*class="[^"]*ui_header_link[^"]*"[^>]*>([\s\S]*?)<\/a>/i;

    let match;
    let total = 0;
    while ((match = reviewRegex.exec(html)) !== null) {
      total++;
      const reviewHtml = match[1];

      const ratingMatch = reviewHtml.match(ratingRegex);
      const textMatch = reviewHtml.match(textRegex);
      const dateMatch = reviewHtml.match(dateRegex);
      const userMatch = reviewHtml.match(userRegex);

      if (textMatch) {
        const rating = ratingMatch ? parseInt(ratingMatch[1]) / 10 : 0;

        // Only include low ratings (1-3 stars)
        if (rating <= 3) {
          reviews.push({
            text: this.cleanText(textMatch[1]),
            rating,
            date: dateMatch ? dateMatch[1] : '',
            reviewer_name: userMatch ? this.cleanText(userMatch[1]) : 'Anonymous',
            review_url: `${this.baseUrl}${hotelUrl}`,
          });
        }
      }
    }

    return { reviews, total };
  }

  private async fetchPage(url: string): Promise<string> {
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseLocation(locationStr: string, defaultLocation: string): { city: string; country: string } {
    if (!locationStr) {
      // Use the search location as fallback
      return { city: defaultLocation, country: '' };
    }
    const parts = locationStr.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0], country: parts[parts.length - 1] };
    }
    return { city: parts[0] || defaultLocation, country: '' };
  }
}

// Export singleton instance
export const tripadvisorScraper = new TripAdvisorScraper();
