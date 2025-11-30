export interface ScrapedProperty {
  name: string;
  city: string;
  country: string;
  region?: string;
  job_title: string;
  job_description?: string;
  source: string;
  source_url: string;
  website?: string;
  property_type?: string;
}

// Priority tiers for job roles - higher = more likely to need Jengu
// HOT (100 points): IT/Tech/Digital/Innovation roles - DEFINITELY need automation
// WARM (70 points): Front office, reservations, guest services - deal with guest communication daily
// MEDIUM (40 points): Revenue, marketing, operations - influence tech decisions
// COLD (20 points): GM, F&B, HR, spa - general decision makers but not primary target

export const ROLE_PRIORITY_SCORES: Record<string, number> = {
  // HOT - Technology & Innovation (100 points) - Primary targets!
  'it manager': 100,
  'it director': 100,
  'cto': 100,
  'chief technology officer': 100,
  'technology director': 100,
  'technology manager': 100,
  'digital director': 100,
  'digital manager': 100,
  'innovation manager': 100,
  'innovation director': 100,
  'ai manager': 100,
  'automation manager': 100,
  'systems manager': 100,
  'digital transformation': 100,
  'cio': 100,

  // WARM - Front Office & Guest Communication (70 points) - Direct beneficiaries
  'front office manager': 70,
  'guest services manager': 70,
  'guest relations manager': 70,
  'guest experience manager': 70,
  'rooms division manager': 70,
  'reservations manager': 70,
  'reservations director': 70,
  'e-commerce manager': 70,
  'online manager': 70,

  // MEDIUM - Revenue & Marketing (40 points) - Influence decisions
  'revenue manager': 40,
  'revenue director': 40,
  'commercial director': 40,
  'sales director': 40,
  'marketing director': 40,
  'marketing manager': 40,
  'digital marketing manager': 40,
  'operations manager': 40,
  'hotel manager': 40,
  'resort manager': 40,

  // COLD - General Leadership (20 points) - Decision makers but not primary
  'general manager': 20,
  'gm': 20,
  'managing director': 20,
  'ceo': 20,
  'coo': 20,
  'cfo': 20,
  'owner': 20,
  'director': 20,
  'f&b director': 20,
  'f&b manager': 20,
  'hr director': 20,
  'hr manager': 20,
  'spa director': 20,
  'spa manager': 20,
  'training manager': 20,
};

/**
 * Get priority score for a job title (0-100)
 * Higher = more likely to need/want Jengu
 */
export function getJobPriorityScore(jobTitle: string): number {
  const titleLower = jobTitle.toLowerCase();

  // Check exact matches first
  for (const [role, score] of Object.entries(ROLE_PRIORITY_SCORES)) {
    if (titleLower.includes(role)) {
      return score;
    }
  }

  // Check for tech-related keywords (high priority)
  const techKeywords = ['it ', 'tech', 'digital', 'innovation', 'automation', 'ai ', 'system'];
  if (techKeywords.some(kw => titleLower.includes(kw))) {
    return 100;
  }

  // Check for front office keywords (medium-high priority)
  const frontOfficeKeywords = ['front office', 'guest', 'reservation', 'rooms division'];
  if (frontOfficeKeywords.some(kw => titleLower.includes(kw))) {
    return 70;
  }

  // Check for revenue/marketing keywords (medium priority)
  const revenueKeywords = ['revenue', 'marketing', 'commercial', 'sales', 'e-commerce'];
  if (revenueKeywords.some(kw => titleLower.includes(kw))) {
    return 40;
  }

  // Default for other management roles
  if (titleLower.includes('manager') || titleLower.includes('director')) {
    return 20;
  }

  return 0; // Not a relevant role
}

/**
 * Get tier based on priority score
 */
export function getTierFromScore(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

// Roles that indicate decision-makers we want to target
export const RELEVANT_ROLE_KEYWORDS = [
  // C-Suite & Directors
  'general manager', 'gm', 'director', 'ceo', 'coo', 'cfo', 'cto', 'cio',
  'managing director', 'vice president', 'vp', 'president', 'owner',

  // Operations & Management
  'hotel manager', 'resort manager', 'operations manager', 'cluster manager',
  'area manager', 'regional manager', 'assistant manager', 'deputy manager',

  // Revenue & Commercial
  'revenue manager', 'revenue director', 'commercial director', 'sales director',
  'marketing director', 'marketing manager', 'digital marketing', 'e-commerce',

  // Front Office & Guest Services
  'front office manager', 'guest services manager', 'guest relations',
  'rooms division', 'reservations manager',

  // F&B Leadership (not kitchen staff)
  'f&b director', 'food and beverage director', 'f&b manager',
  'restaurant manager', 'outlet manager', 'banquet manager',

  // Technology & Innovation
  'it manager', 'it director', 'technology', 'digital', 'innovation',
  'ai', 'automation', 'systems manager', 'tech',

  // HR & Training
  'hr director', 'hr manager', 'human resources', 'talent', 'training manager',
  'learning and development', 'l&d',

  // Spa & Wellness Leadership
  'spa director', 'spa manager', 'wellness director',
];

// Roles to exclude - operational staff, not decision-makers
export const EXCLUDED_ROLE_KEYWORDS = [
  // Kitchen staff
  'chef', 'cook', 'sous chef', 'pastry', 'baker', 'kitchen', 'culinary',
  'commis', 'demi chef', 'chef de partie', 'line cook', 'prep cook',

  // Housekeeping staff
  'housekeeper', 'housekeeping', 'room attendant', 'cleaner', 'laundry',
  'linen', 'turndown',

  // Service staff
  'waiter', 'waitress', 'server', 'bartender', 'barista', 'host', 'hostess',
  'sommelier', 'busser', 'runner', 'steward', 'dishwasher',

  // Front desk staff (not managers)
  'receptionist', 'front desk agent', 'night auditor', 'bellman', 'concierge',
  'doorman', 'valet', 'porter',

  // Maintenance & Engineering staff
  'engineer', 'maintenance', 'technician', 'handyman', 'plumber', 'electrician',

  // Security & Other
  'security', 'guard', 'lifeguard', 'driver', 'chauffeur',

  // Spa staff (not managers)
  'therapist', 'masseuse', 'aesthetician', 'nail tech', 'hair stylist',

  // Other operational
  'intern', 'trainee', 'apprentice', 'assistant', 'coordinator', 'agent',
];

// Large hotel chains/corporations to exclude - they have their own tech departments
export const EXCLUDED_CHAINS = [
  // Major international chains
  'marriott', 'hilton', 'hyatt', 'ihg', 'intercontinental', 'accor',
  'wyndham', 'choice hotels', 'best western', 'radisson', 'carlson',
  'starwood', 'sheraton', 'westin', 'w hotels', 'le meridien', 'aloft',
  'four points', 'courtyard', 'residence inn', 'springhill', 'fairfield',
  'hampton inn', 'homewood suites', 'embassy suites', 'doubletree', 'conrad',
  'waldorf astoria', 'canopy', 'curio', 'tapestry', 'lxr', 'signia',
  'park hyatt', 'andaz', 'grand hyatt', 'hyatt regency', 'hyatt place',
  'hyatt house', 'thompson', 'joie de vivre', 'destination', 'alila',
  'crowne plaza', 'holiday inn', 'indigo', 'even hotels', 'avid', 'staybridge',
  'candlewood', 'kimpton', 'regent', 'voco', 'vignette',
  'novotel', 'sofitel', 'pullman', 'mgallery', 'mercure', 'ibis',
  'adagio', 'jo&joe', 'tribe', 'movenpick', 'swissotel', 'fairmont',
  'raffles', 'banyan tree', 'angsana', 'cassia', 'dhawa', 'garrya',
  'days inn', 'super 8', 'ramada', 'wingate', 'microtel', 'la quinta',
  'baymont', 'travelodge', 'howard johnson', 'hawthorn',
  // Luxury chains (still corporate)
  'four seasons', 'ritz carlton', 'ritz-carlton', 'mandarin oriental', 'peninsula',
  'rosewood', 'aman', 'one&only', 'belmond', 'como', 'six senses',
  'st regis', 'luxury collection', 'edition', 'jw marriott', 'bvlgari',
  'capella', 'oetker', 'rocco forte', 'dorchester', 'langham',
  'shangri-la', 'shangri la', 'kempinski', 'jumeirah', 'anantara',
  'oberoi', 'taj', 'leela', 'itc', 'park', 'peninsula',
  // Casino/resort chains
  'mgm', 'caesars', 'wynn', 'venetian', 'bellagio', 'aria',
  'mandalay', 'mirage', 'luxor', 'excalibur', 'flamingo',
  // Cruise & vacation
  'club med', 'sandals', 'beaches', 'all inclusive', 'barcelo',
  'riu', 'melia', 'iberostar', 'palladium', 'hard rock hotel',
  // OTAs and travel companies (not hotels)
  'booking.com', 'expedia', 'hotels.com', 'trivago', 'kayak',
  'tripadvisor', 'airbnb', 'vrbo', 'agoda',
  // Recruitment/staffing agencies
  'caterer.com', 'hcareers', 'hosco', 'hospitalityonline',
  'recruitment', 'staffing', 'agency', 'headhunter', 'talent acquisition',
];

/**
 * Check if a company name belongs to a large chain/corporation
 */
export function isLargeChain(companyName: string): boolean {
  const nameLower = companyName.toLowerCase();
  return EXCLUDED_CHAINS.some(chain => nameLower.includes(chain));
}

/**
 * Check if a job title indicates a relevant decision-maker role
 */
export function isRelevantRole(jobTitle: string, jobDescription?: string): boolean {
  const titleLower = jobTitle.toLowerCase();
  const descLower = (jobDescription || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // First check if it's an excluded role
  for (const excluded of EXCLUDED_ROLE_KEYWORDS) {
    // Check title strictly
    if (titleLower.includes(excluded)) {
      // Exception: if title also has manager/director, it might be relevant
      const hasManagement = titleLower.includes('manager') ||
                           titleLower.includes('director') ||
                           titleLower.includes('head of');
      if (!hasManagement) {
        return false;
      }
    }
  }

  // Check if it matches relevant keywords
  for (const relevant of RELEVANT_ROLE_KEYWORDS) {
    if (titleLower.includes(relevant)) {
      return true;
    }
  }

  // Check description for management indicators
  const managementIndicators = [
    'manage team', 'lead team', 'oversee', 'responsible for', 'reporting to',
    'p&l', 'budget', 'strategy', 'leadership', 'decision making',
    'kpi', 'performance management', 'department head'
  ];

  for (const indicator of managementIndicators) {
    if (combined.includes(indicator)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter properties to only include relevant management roles AND exclude large chains
 */
export function filterRelevantProperties(properties: ScrapedProperty[]): {
  relevant: ScrapedProperty[];
  filtered: number;
  filteredRoles: string[];
  filteredChains: string[];
} {
  const relevant: ScrapedProperty[] = [];
  const filteredRoles: string[] = [];
  const filteredChains: string[] = [];

  for (const property of properties) {
    // First check if it's a large chain - skip entirely
    if (isLargeChain(property.name)) {
      filteredChains.push(property.name);
      continue;
    }

    // Then check if role is relevant
    if (isRelevantRole(property.job_title, property.job_description)) {
      relevant.push(property);
    } else {
      filteredRoles.push(property.job_title);
    }
  }

  return {
    relevant,
    filtered: properties.length - relevant.length,
    filteredRoles: [...new Set(filteredRoles)], // unique roles filtered
    filteredChains: [...new Set(filteredChains)], // unique chains filtered
  };
}

export interface ScraperConfig {
  name: string;
  id: string;
  enabled: boolean;
  baseUrl: string;
  locations: string[];
  jobTitles: string[];
}

export interface ScraperResult {
  source: string;
  properties: ScrapedProperty[];
  errors: string[];
  duration: number;
}

// Proxy configuration for IP rotation
export interface ProxyConfig {
  type: 'none' | 'scraperapi' | 'brightdata' | 'custom';
  apiKey?: string;
  endpoint?: string;
  // For custom proxy lists
  proxies?: string[];
}

// Global proxy settings - can be configured via env or settings
let proxyConfig: ProxyConfig = { type: 'none' };
let proxyIndex = 0;

export function setProxyConfig(config: ProxyConfig) {
  proxyConfig = config;
  proxyIndex = 0;
}

export function getProxyConfig(): ProxyConfig {
  return proxyConfig;
}

// User agents to rotate
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getNextProxy(): string | null {
  if (proxyConfig.type === 'none') return null;
  if (proxyConfig.type === 'custom' && proxyConfig.proxies?.length) {
    const proxy = proxyConfig.proxies[proxyIndex % proxyConfig.proxies.length];
    proxyIndex++;
    return proxy;
  }
  return null;
}

export abstract class BaseScraper {
  abstract id: string;
  abstract name: string;
  abstract baseUrl: string;

  protected async fetchPage(url: string, retries = 2): Promise<string> {
    const userAgent = getRandomUserAgent();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let fetchUrl = url;
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        };

        // Apply proxy based on config
        if (proxyConfig.type === 'scraperapi' && proxyConfig.apiKey) {
          // ScraperAPI - prepend their API URL
          fetchUrl = `http://api.scraperapi.com?api_key=${proxyConfig.apiKey}&url=${encodeURIComponent(url)}`;
        } else if (proxyConfig.type === 'brightdata' && proxyConfig.apiKey) {
          // BrightData/Luminati style
          fetchUrl = `${proxyConfig.endpoint || 'http://brd.superproxy.io:22225'}`;
          headers['Proxy-Authorization'] = `Basic ${Buffer.from(proxyConfig.apiKey).toString('base64')}`;
        } else if (proxyConfig.type === 'custom') {
          const proxy = getNextProxy();
          if (proxy) {
            // For custom proxies, we'd need a proxy agent library
            // For now, just rotate user agents
            console.log(`Would use proxy: ${proxy}`);
          }
        }

        const response = await fetch(fetchUrl, { headers });

        if (!response.ok) {
          // If blocked (403/429), retry with different settings
          if ((response.status === 403 || response.status === 429) && attempt < retries) {
            await this.delay(2000 * (attempt + 1)); // Exponential backoff
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.text();
      } catch (error) {
        if (attempt === retries) throw error;
        await this.delay(1000 * (attempt + 1));
      }
    }

    throw new Error('All retry attempts failed');
  }

  protected parseLocation(locationStr: string): { city: string; country: string } {
    const parts = locationStr.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return { city: parts[0], country: parts[parts.length - 1] };
    }
    return { city: parts[0] || '', country: '' };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  abstract scrape(locations: string[], jobTitles: string[]): Promise<ScraperResult>;
}
