export interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: Array<{ name: string }>;
}

export interface WebsiteData {
  emails: string[];
  phones: string[];
  socialLinks: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
    tripadvisor?: string;
    booking?: string;
  };
  contactPageUrl?: string;
  propertyInfo: {
    starRating?: number;
    roomCount?: string;
    amenities?: string[];
    chainBrand?: string;
    description?: string;
  };
  teamMembers: Array<{
    name: string;
    title: string;
    email?: string;
    linkedin?: string;
  }>;
}

export interface EnrichmentData {
  google_place_id?: string;
  full_address?: string | null;
  website?: string | null;
}
