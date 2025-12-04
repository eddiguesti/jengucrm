/**
 * Centralized constants
 * Eliminates magic numbers and strings throughout the codebase
 */

// ============================================
// TIMEOUTS (in milliseconds)
// ============================================
export const TIMEOUTS = {
  /** IMAP connection timeout */
  IMAP_CONNECTION: 10000,
  /** IMAP authentication timeout */
  IMAP_AUTH: 5000,
  /** IMAP overall operation timeout */
  IMAP_OPERATION: 30000,
  /** Email send operation */
  EMAIL_SEND: 15000,
  /** AI model generation */
  AI_GENERATION: 30000,
  /** External API calls */
  EXTERNAL_API: 15000,
  /** Website scraping */
  SCRAPE: 30000,
  /** Standard fetch timeout */
  FETCH_DEFAULT: 10000,
} as const;

// ============================================
// RATE LIMITS
// ============================================
export const RATE_LIMITS = {
  /** Google Places API daily limit (free tier) */
  GOOGLE_PLACES_DAILY: 300,
  /** X.AI/Anthropic emails per day */
  AI_EMAILS_DAILY: 100,
  /** Scrape runs per day */
  SCRAPE_RUNS_DAILY: 10,
  /** Emails per inbox per day (warmup) */
  SMTP_INBOX_DAILY: 20,
  /** Login attempts per IP per hour */
  LOGIN_ATTEMPTS_HOURLY: 5,
} as const;

// ============================================
// EMAIL CONFIGURATION
// ============================================
export const EMAIL = {
  /** Preview length for email body */
  PREVIEW_CHARS: 500,
  /** Max follow-up emails per prospect */
  MAX_FOLLOW_UPS: 3,
  /** Days between follow-ups */
  FOLLOW_UP_DAYS: [3, 5] as const,
  /** Stagger delay range (ms) - random between these */
  STAGGER_DELAY_MIN: 30000,
  STAGGER_DELAY_MAX: 90000,
  /** Minimum delay between emails (ms) */
  MIN_DELAY: 1000,
} as const;

// ============================================
// SCORING
// ============================================
export const SCORING = {
  /** Maximum lead score */
  MAX_SCORE: 100,
  /** Hot tier threshold */
  HOT_THRESHOLD: 70,
  /** Warm tier threshold */
  WARM_THRESHOLD: 40,
  /** Minimum score for auto-email */
  AUTO_EMAIL_MIN_SCORE: 50,
} as const;

// ============================================
// PAGINATION
// ============================================
export const PAGINATION = {
  /** Default page size */
  DEFAULT_LIMIT: 50,
  /** Maximum allowed page size */
  MAX_LIMIT: 1000,
} as const;

// ============================================
// IRRELEVANT JOB TITLES (for filtering)
// ============================================
export const IRRELEVANT_JOB_TITLES = [
  'sous chef', 'chef', 'cook', 'kitchen', 'culinary',
  'dishwasher', 'busboy', 'busser', 'server', 'waiter', 'waitress',
  'bartender', 'barista', 'host', 'hostess', 'bellhop', 'bell staff',
  'valet', 'parking', 'security', 'guard', 'cleaner', 'housekeeper',
  'laundry', 'groundskeeper', 'maintenance', 'engineer', 'lifeguard',
  'pool', 'spa therapist', 'massage', 'esthetician', 'nail tech',
  'fitness', 'yoga', 'trainer', 'instructor', 'driver', 'shuttle',
  'intern', 'trainee', 'apprentice', 'entry level', 'part time',
  'seasonal', 'temporary', 'contract',
] as const;

// ============================================
// GENERIC CORPORATE EMAILS (skip these)
// ============================================
export const GENERIC_CORPORATE_EMAILS = [
  /^info@marriott\.com$/i,
  /^info@hilton\.com$/i,
  /^info@hyatt\.com$/i,
  /^info@ihg\.com$/i,
  /^info@accor\.com$/i,
] as const;

// ============================================
// FAKE EMAIL PATTERNS (skip these)
// ============================================
export const FAKE_EMAIL_PATTERNS = [
  /johndoe|janedoe|john\.doe|jane\.doe/i,
  /@website\.com|@domain\.com|@example\.com|@test\.com/i,
  /placeholder|sample|demo|test@/i,
] as const;

// ============================================
// HTTP HEADERS
// ============================================
export const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
} as const;

// ============================================
// SESSION
// ============================================
export const SESSION = {
  /** Cookie name for auth token */
  COOKIE_NAME: 'auth_token',
  /** Session duration in seconds (7 days instead of 30) */
  DURATION_SECONDS: 60 * 60 * 24 * 7,
  /** Secure session token value (better than 'authenticated') */
  TOKEN_PREFIX: 'session_',
} as const;

const constants = {
  TIMEOUTS,
  RATE_LIMITS,
  EMAIL,
  SCORING,
  PAGINATION,
  IRRELEVANT_JOB_TITLES,
  GENERIC_CORPORATE_EMAILS,
  FAKE_EMAIL_PATTERNS,
  FETCH_HEADERS,
  SESSION,
};
export default constants;
