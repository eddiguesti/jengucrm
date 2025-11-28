import { ReviewPlatform, PAIN_KEYWORDS } from '@/types';

// A detected pain signal from a review
export interface DetectedPainSignal {
  keyword_matched: string;
  review_snippet: string;
  review_rating: number | null;
  review_date: string | null;
  reviewer_name: string | null;
  review_url: string | null;
}

// A property found through review mining
export interface ReviewMinedProperty {
  name: string;
  city: string;
  country: string;
  region?: string;
  property_type: string;
  website?: string;
  google_place_id?: string;
  google_rating?: number;
  google_review_count?: number;
  tripadvisor_url?: string;
  pain_signals: DetectedPainSignal[];
  source_platform: ReviewPlatform;
}

// Result from a review mining scrape
export interface ReviewMiningResult {
  platform: ReviewPlatform;
  location: string;
  properties_scanned: number;
  reviews_scanned: number;
  properties: ReviewMinedProperty[];
  errors: string[];
  duration: number;
}

// Helper to flatten all pain keywords
export function getAllPainKeywords(): string[] {
  return [
    ...PAIN_KEYWORDS.response,
    ...PAIN_KEYWORDS.communication,
    ...PAIN_KEYWORDS.booking,
    ...PAIN_KEYWORDS.email,
  ];
}

// Helper to find which keyword category a match belongs to
export function getPainKeywordCategory(keyword: string): string {
  for (const [category, keywords] of Object.entries(PAIN_KEYWORDS)) {
    if ((keywords as readonly string[]).includes(keyword.toLowerCase())) {
      return category;
    }
  }
  return 'unknown';
}

// Extract a snippet around the matched keyword
export function extractSnippet(text: string, keyword: string, contextChars = 100): string {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);

  if (index === -1) return text.slice(0, contextChars * 2);

  const start = Math.max(0, index - contextChars);
  const end = Math.min(text.length, index + keyword.length + contextChars);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

// Check if review text contains any pain keywords
export function detectPainKeywords(text: string): { keyword: string; category: string }[] {
  const matches: { keyword: string; category: string }[] = [];
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(PAIN_KEYWORDS)) {
    for (const keyword of keywords as readonly string[]) {
      if (lowerText.includes(keyword)) {
        matches.push({ keyword, category });
      }
    }
  }

  return matches;
}

// User agents for scraping
export const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
