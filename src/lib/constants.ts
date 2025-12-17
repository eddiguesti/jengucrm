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
  /** EMERGENCY STOP - Disable all email sending */
  EMERGENCY_STOP: false,
} as const;

// ============================================
// EMAIL WARMUP SCHEDULE (2025 best practices)
// Gradual ramp-up to protect domain reputation
// Sources: Mailreach, Warmup Inbox, Reply.io
// ============================================
export const WARMUP_SCHEDULE = {
  /** Start date for warmup (ISO string, set when first email sent) */
  START_DATE: "2025-12-06",
  /** Warmup stages - 3 SMTP inboxes × 20/day = 60/day total capacity */
  STAGES: [
    { maxDay: Infinity, limit: 60 }, // 60/day max (3 SMTP × 20 each)
  ],
  /** Never exceed this regardless of warmup stage */
  ABSOLUTE_MAX: 60,
  /** Per-inbox daily limit (enforced in inbox-tracker) */
  PER_INBOX_LIMIT: 20,
} as const;

/**
 * Calculate days since warmup started (handles timezone properly)
 */
function getDaysSinceWarmupStart(): number {
  // Parse start date as local date (YYYY-MM-DD at midnight local time)
  const [year, month, day] = WARMUP_SCHEDULE.START_DATE.split("-").map(Number);
  const startDate = new Date(year, month - 1, day);
  startDate.setHours(0, 0, 0, 0);

  // Get today at midnight local time
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate days difference
  const diffMs = today.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Day 1 is the start day, not day 0
  return Math.max(1, diffDays + 1);
}

/**
 * Get the current daily email limit based on warmup schedule
 */
export function getWarmupDailyLimit(): number {
  const daysSinceStart = getDaysSinceWarmupStart();

  for (const stage of WARMUP_SCHEDULE.STAGES) {
    if (daysSinceStart <= stage.maxDay) {
      return stage.limit;
    }
  }

  return WARMUP_SCHEDULE.ABSOLUTE_MAX;
}

/**
 * Get warmup status info for monitoring
 */
export function getWarmupStatus(): {
  day: number;
  limit: number;
  stage: string;
} {
  const daysSinceStart = getDaysSinceWarmupStart();
  const limit = getWarmupDailyLimit();

  let stage = "Unknown";
  if (daysSinceStart <= 3) stage = "Initial (days 1-3)";
  else if (daysSinceStart <= 7) stage = "Early (days 4-7)";
  else if (daysSinceStart <= 14) stage = "Building (days 8-14)";
  else if (daysSinceStart <= 21) stage = "Growing (days 15-21)";
  else stage = "Mature (day 22+)";

  return { day: daysSinceStart, limit, stage };
}

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
  "sous chef",
  "chef",
  "cook",
  "kitchen",
  "culinary",
  "dishwasher",
  "busboy",
  "busser",
  "server",
  "waiter",
  "waitress",
  "bartender",
  "barista",
  "host",
  "hostess",
  "bellhop",
  "bell staff",
  "valet",
  "parking",
  "security",
  "guard",
  "cleaner",
  "housekeeper",
  "laundry",
  "groundskeeper",
  "maintenance",
  "engineer",
  "lifeguard",
  "pool",
  "spa therapist",
  "massage",
  "esthetician",
  "nail tech",
  "fitness",
  "yoga",
  "trainer",
  "instructor",
  "driver",
  "shuttle",
  "intern",
  "trainee",
  "apprentice",
  "entry level",
  "part time",
  "seasonal",
  "temporary",
  "contract",
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
// GENERIC EMAIL PREFIXES (skip these - want personal emails)
// Patterns match: exact prefix OR prefix followed by dot/hyphen/underscore
// e.g., info@, info.uk@, info-sales@, info_team@
// ============================================
export const GENERIC_EMAIL_PREFIXES = [
  // Core generic prefixes (allow for suffixes like .uk, -sales, _team)
  /^info[.\-_]?[^@]*@/i,
  /^n?info[.\-_]?[^@]*@/i, // Catches typos like ninfo@
  /^contact[.\-_]?[^@]*@/i,
  /^reception[.\-_]?[^@]*@/i,
  /^n?reception[.\-_]?[^@]*@/i, // Catches typos like nreception@
  /^reservation[s]?[.\-_]?[^@]*@/i,
  /^reserva(s|cione?s)?[.\-_]?[^@]*@/i, // Spanish: reservas, reservacion, reservaciones
  /^resa[.\-_]?[^@]*@/i, // French abbreviation for reservation
  /^booking[s]?[.\-_]?[^@]*@/i,
  /^sales[.\-_]?[^@]*@/i,
  /^hello[.\-_]?[^@]*@/i,
  /^enquir(y|ies)[.\-_]?[^@]*@/i,
  /^front\.?desk[.\-_]?[^@]*@/i,
  /^guest\.?service[s]?[.\-_]?[^@]*@/i,
  /^hotel[.\-_]?[^@]*@/i,
  /^mail[.\-_]?[^@]*@/i,
  /^admin[.\-_]?[^@]*@/i,
  /^office[.\-_]?[^@]*@/i,
  /^support[.\-_]?[^@]*@/i,
  /^marketing[.\-_]?[^@]*@/i,
  /^team[.\-_]?[^@]*@/i,
  /^rsvp[.\-_]?[^@]*@/i,
  /^stay[.\-_]?[^@]*@/i,
  /^events?[.\-_]?[^@]*@/i, // Event inquiries
  /^message[s]?[^@]*@/i, // Generic message inbox
  /^la[\-\.]?poste[.\-_]?[^@]*@/i, // French: the post/mail
  /^correo[.\-_]?[^@]*@/i, // Spanish: mail
  // Italian generics
  /^ricevimento[.\-_]?[^@]*@/i, // Italian: reception
  /^prenotazioni[.\-_]?[^@]*@/i, // Italian: reservations
  /^risorseumane[.\-_]?[^@]*@/i, // Italian: HR (human resources)
  /^risorse[.\-_]?[^@]*@/i, // Italian: resources
  /^ufficio[.\-_]?[^@]*@/i, // Italian: office
  /^amministrazione[.\-_]?[^@]*@/i, // Italian: administration
  /^commerciale[.\-_]?[^@]*@/i, // Italian: commercial/sales
  /^segreteria[.\-_]?[^@]*@/i, // Italian: secretary
  // Portuguese generics
  /^geral[.\-_]?[^@]*@/i, // Portuguese: general
  /^recepcao[.\-_]?[^@]*@/i, // Portuguese: reception
  /^contacto[.\-_]?[^@]*@/i, // Portuguese: contact
  // German generics
  /^zentrale[.\-_]?[^@]*@/i, // German: central/main
  /^empfang[.\-_]?[^@]*@/i, // German: reception
  /^reservierung(en)?[.\-_]?[^@]*@/i, // German: reservations
  /^buchung(en)?[.\-_]?[^@]*@/i, // German: bookings
  // French generics
  /^accueil[.\-_]?[^@]*@/i, // French: reception
  /^cadeaux[.\-_]?[^@]*@/i, // French: gifts
  /^bienvenue[.\-_]?[^@]*@/i, // French: welcome
  /^bonjour[.\-_]?[^@]*@/i, // French: hello
  // Romanian generics
  /^rezervari[.\-_]?[^@]*@/i, // Romanian: reservations
  /^receptie[.\-_]?[^@]*@/i, // Romanian: reception
  // HR/recruitment (international)
  /^curriculum[.\-_]?[^@]*@/i, // CV/resume inbox
  /^hr[.\-_]?[^@]*@/i, // Human resources
  /^rh[.\-_]?[^@]*@/i, // Spanish/Portuguese: HR
  /^recrutement[.\-_]?[^@]*@/i, // French: recruitment
  /^carriere[s]?[.\-_]?[^@]*@/i, // French: careers
  /^emploi[s]?[.\-_]?[^@]*@/i, // French: jobs
  /^lavoro[.\-_]?[^@]*@/i, // Italian: work/jobs
  // Accessibility/special services
  /^accessibility[.\-_]?[^@]*@/i, // Accessibility inbox
  /^spa[.\-_]?[^@]*@/i, // Spa services
  /^restaurant[.\-_]?[^@]*@/i, // Restaurant
  /^restauration[.\-_]?[^@]*@/i, // French: restaurant/catering
  /^concierge[.\-_]?[^@]*@/i, // Concierge
  // Multilingual greetings
  /^welcome[.\-_]?[^@]*@/i,
  /^hola[.\-_]?[^@]*@/i, // Spanish: hello
  /^ciao[.\-_]?[^@]*@/i, // Italian: hello
  // Property-type generics
  /^villas?[.\-_]?[^@]*@/i,
  /^rooms?[.\-_]?[^@]*@/i,
  /^suites?[.\-_]?[^@]*@/i,
  /^apartments?[.\-_]?[^@]*@/i,
  // Other common generics
  /^comunicacion(es)?[.\-_]?[^@]*@/i, // Spanish: communication
  /^general[.\-_]?[^@]*@/i,
  /^service[s]?[.\-_]?[^@]*@/i,
  // Hotel codes (e.g., H1234@accor.com)
  /^[A-Z]\d{3,5}[\-_]?[^@]*@/i, // Property codes like H1284@, H5628-re@
] as const;

// ============================================
// FAKE EMAIL PATTERNS (skip these)
// ============================================
export const FAKE_EMAIL_PATTERNS = [
  /johndoe|janedoe|john\.doe|jane\.doe/i,
  /@website\.com|@domain\.com|@example\.com|@test\.com/i,
  /placeholder|sample|demo|test@/i,
  // File extensions (scraper bugs)
  /\.(png|jpg|jpeg|gif|svg|webp|pdf|doc|docx)$/i,
  // Missing @ symbol
  /^[^@]+$/,
  // Invalid email format (no domain)
  /@$/,
  // Double @@ or spaces
  /@@|\s/,
] as const;

// ============================================
// CHAIN HOTEL BRANDS (auto-filter on import)
// These are large chains - we focus on independents
// ============================================
export const CHAIN_HOTEL_BRANDS = [
  // Marriott International
  "marriott",
  "sheraton",
  "westin",
  "w hotels",
  "st. regis",
  "st regis",
  "ritz-carlton",
  "ritz carlton",
  "jw marriott",
  "renaissance",
  "courtyard",
  "residence inn",
  "fairfield",
  "springhill",
  "towneplace",
  "aloft",
  "element",
  "ac hotels",
  "moxy",
  "autograph",
  "tribute",
  "le meridien",
  "edition",
  "luxury collection",
  "four points",
  // Hilton
  "hilton",
  "conrad",
  "waldorf astoria",
  "doubletree",
  "embassy suites",
  "hampton",
  "homewood suites",
  "home2 suites",
  "hilton garden inn",
  "tru by hilton",
  "curio",
  "canopy",
  "tapestry",
  "lxr",
  "tempo",
  "signia",
  // Hyatt
  "hyatt",
  "grand hyatt",
  "park hyatt",
  "andaz",
  "hyatt regency",
  "hyatt place",
  "hyatt house",
  "thompson hotels",
  "alila",
  "miraval",
  "caption",
  // IHG
  "ihg",
  "intercontinental",
  "crowne plaza",
  "holiday inn",
  "holiday inn express",
  "kimpton",
  "hotel indigo",
  "even hotels",
  "staybridge",
  "candlewood",
  "regent hotels",
  "six senses",
  "vignette",
  // Accor
  "accor",
  "sofitel",
  "pullman",
  "mgallery",
  "novotel",
  "mercure",
  "ibis",
  "ibis styles",
  "ibis budget",
  "fairmont",
  "raffles",
  "swissotel",
  "banyan tree",
  "movenpick",
  "mantis",
  "25hours",
  "sls hotels",
  "delano",
  "mondrian",
  // Wyndham
  "wyndham",
  "ramada",
  "days inn",
  "super 8",
  "microtel",
  "la quinta",
  "baymont",
  "wingate",
  "hawthorn",
  "tryp",
  // Best Western
  "best western",
  "best western plus",
  "best western premier",
  "vib",
  "glo",
  "aiden",
  "sadie",
  // Choice Hotels
  "choice hotels",
  "comfort inn",
  "comfort suites",
  "quality inn",
  "sleep inn",
  "clarion",
  "econo lodge",
  "rodeway inn",
  "cambria",
  "ascend",
  // Radisson
  "radisson",
  "radisson blu",
  "radisson red",
  "radisson collection",
  "park inn by radisson",
  "park plaza",
  "country inn",
  // Luxury chains
  "four seasons",
  "mandarin oriental",
  "peninsula",
  "shangri-la",
  "aman",
  "one&only",
  "belmond",
  "rosewood",
  "langham",
  "kempinski",
  "jumeirah",
  // Others
  "loews",
  "omni hotels",
  "premier inn",
  "travelodge",
  "motel 6",
  "red roof",
  "drury",
  "oyo",
  "citizenm",
  "hoxton",
  "gleneagles",
  "mama shelter",
  "nh hotels",
  "nh collection",
  "anantara",
  "avani",
  "oaks",
  "tivoli",
] as const;

/**
 * Check if a company name matches a chain hotel brand
 */
export function isChainHotel(companyName: string): boolean {
  if (!companyName) return false;
  const lower = companyName.toLowerCase();
  return CHAIN_HOTEL_BRANDS.some((brand) => lower.includes(brand));
}

// ============================================
// COUNTRY TIMEZONE MAPPING (for time-zone aware sending)
// ============================================
export const COUNTRY_TIMEZONES: Record<
  string,
  { timezone: string; utcOffset: number }
> = {
  // Europe
  "united kingdom": { timezone: "Europe/London", utcOffset: 0 },
  uk: { timezone: "Europe/London", utcOffset: 0 },
  france: { timezone: "Europe/Paris", utcOffset: 1 },
  germany: { timezone: "Europe/Berlin", utcOffset: 1 },
  italy: { timezone: "Europe/Rome", utcOffset: 1 },
  spain: { timezone: "Europe/Madrid", utcOffset: 1 },
  netherlands: { timezone: "Europe/Amsterdam", utcOffset: 1 },
  belgium: { timezone: "Europe/Brussels", utcOffset: 1 },
  switzerland: { timezone: "Europe/Zurich", utcOffset: 1 },
  austria: { timezone: "Europe/Vienna", utcOffset: 1 },
  portugal: { timezone: "Europe/Lisbon", utcOffset: 0 },
  ireland: { timezone: "Europe/Dublin", utcOffset: 0 },
  greece: { timezone: "Europe/Athens", utcOffset: 2 },
  poland: { timezone: "Europe/Warsaw", utcOffset: 1 },
  sweden: { timezone: "Europe/Stockholm", utcOffset: 1 },
  norway: { timezone: "Europe/Oslo", utcOffset: 1 },
  denmark: { timezone: "Europe/Copenhagen", utcOffset: 1 },
  finland: { timezone: "Europe/Helsinki", utcOffset: 2 },
  "czech republic": { timezone: "Europe/Prague", utcOffset: 1 },
  hungary: { timezone: "Europe/Budapest", utcOffset: 1 },
  romania: { timezone: "Europe/Bucharest", utcOffset: 2 },
  turkey: { timezone: "Europe/Istanbul", utcOffset: 3 },
  // Middle East
  "united arab emirates": { timezone: "Asia/Dubai", utcOffset: 4 },
  uae: { timezone: "Asia/Dubai", utcOffset: 4 },
  dubai: { timezone: "Asia/Dubai", utcOffset: 4 },
  "saudi arabia": { timezone: "Asia/Riyadh", utcOffset: 3 },
  qatar: { timezone: "Asia/Qatar", utcOffset: 3 },
  israel: { timezone: "Asia/Jerusalem", utcOffset: 2 },
  // Asia Pacific
  singapore: { timezone: "Asia/Singapore", utcOffset: 8 },
  "hong kong": { timezone: "Asia/Hong_Kong", utcOffset: 8 },
  japan: { timezone: "Asia/Tokyo", utcOffset: 9 },
  "south korea": { timezone: "Asia/Seoul", utcOffset: 9 },
  china: { timezone: "Asia/Shanghai", utcOffset: 8 },
  thailand: { timezone: "Asia/Bangkok", utcOffset: 7 },
  malaysia: { timezone: "Asia/Kuala_Lumpur", utcOffset: 8 },
  indonesia: { timezone: "Asia/Jakarta", utcOffset: 7 },
  philippines: { timezone: "Asia/Manila", utcOffset: 8 },
  india: { timezone: "Asia/Kolkata", utcOffset: 5 },
  australia: { timezone: "Australia/Sydney", utcOffset: 10 },
  "new zealand": { timezone: "Pacific/Auckland", utcOffset: 12 },
  // Americas
  "united states": { timezone: "America/New_York", utcOffset: -5 },
  usa: { timezone: "America/New_York", utcOffset: -5 },
  canada: { timezone: "America/Toronto", utcOffset: -5 },
  mexico: { timezone: "America/Mexico_City", utcOffset: -6 },
  brazil: { timezone: "America/Sao_Paulo", utcOffset: -3 },
  // Africa
  "south africa": { timezone: "Africa/Johannesburg", utcOffset: 2 },
  egypt: { timezone: "Africa/Cairo", utcOffset: 2 },
  morocco: { timezone: "Africa/Casablanca", utcOffset: 0 },
};

/**
 * Check if it's currently business hours (9am-5pm) in the prospect's country
 */
export function isBusinessHours(country: string | null): boolean {
  if (!country) return true; // Default to allowing if no country

  const countryLower = country.toLowerCase();
  const tzInfo = COUNTRY_TIMEZONES[countryLower];

  if (!tzInfo) return true; // Default to allowing if timezone unknown

  // Get current UTC hour and add offset
  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + tzInfo.utcOffset + 24) % 24;

  // Business hours: 9am to 5pm local time
  return localHour >= 9 && localHour < 17;
}

/**
 * Get the local hour in prospect's timezone
 */
export function getLocalHour(country: string | null): number {
  if (!country) return new Date().getHours();

  const countryLower = country.toLowerCase();
  const tzInfo = COUNTRY_TIMEZONES[countryLower];

  if (!tzInfo) return new Date().getHours();

  const utcHour = new Date().getUTCHours();
  return (utcHour + tzInfo.utcOffset + 24) % 24;
}

// ============================================
// HTTP HEADERS
// ============================================
export const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
} as const;

// ============================================
// SESSION
// ============================================
export const SESSION = {
  /** Cookie name for auth token */
  COOKIE_NAME: "auth_token",
  /** Session duration in seconds (7 days instead of 30) */
  DURATION_SECONDS: 60 * 60 * 24 * 7,
  /** Secure session token value (better than 'authenticated') */
  TOKEN_PREFIX: "session_",
} as const;

const constants = {
  TIMEOUTS,
  RATE_LIMITS,
  EMAIL,
  WARMUP_SCHEDULE,
  SCORING,
  PAGINATION,
  IRRELEVANT_JOB_TITLES,
  GENERIC_CORPORATE_EMAILS,
  GENERIC_EMAIL_PREFIXES,
  FAKE_EMAIL_PATTERNS,
  CHAIN_HOTEL_BRANDS,
  COUNTRY_TIMEZONES,
  FETCH_HEADERS,
  SESSION,
  getWarmupDailyLimit,
  getWarmupStatus,
  isChainHotel,
  isBusinessHours,
  getLocalHour,
};
export default constants;
