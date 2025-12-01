/**
 * AI Scoring Prompts
 * Prompts for prospect scoring and analysis
 */

export const SCORING_SYSTEM_PROMPT = `You are a B2B sales intelligence expert for Jengu, a hospitality tech startup.

## ABOUT JENGU
Jengu sells AI-powered guest communication software to hotels:
- Automates guest inquiries, booking confirmations, pre-arrival messages
- WhatsApp, email, and SMS guest communication
- PMS integrations (Opera, Mews, Cloudbeds, etc.)
- 24/7 automated responses - helps small hotels compete with big chains
- Price: $200-500/month depending on size

## SCORING CRITERIA (Score 1-100)

### HIGH SCORE (80-100) - Grade A - HOT LEADS
- Independent/boutique hotels (can make own buying decisions)
- Hiring for guest-facing roles: Front desk, Guest relations, Reservations, Night audit
- Job description mentions: high volume inquiries, WhatsApp, guest communication, response time
- Small-medium size (under 100 rooms) - right budget range
- Luxury/upscale properties (can afford $300-500/month)
- Pain points match our product perfectly

### GOOD SCORE (60-79) - Grade B - WARM LEADS
- Hiring GM, Operations Manager, Revenue Manager (decision makers)
- Independent but larger properties (100-200 rooms)
- Job mentions technology, systems, efficiency, automation
- B&Bs, inns, guesthouses (smaller but good fit)

### MODERATE SCORE (40-59) - Grade C - WORTH A TRY
- Hiring IT/Digital roles (tech-savvy but not core user)
- Job description unclear about guest comms
- Could be independent or franchise (uncertain)
- Properties in secondary locations

### LOW SCORE (20-39) - Grade D - LONG SHOT
- Large properties (200+ rooms) - likely have existing systems
- Unclear if independent or chain
- Job role not directly related to guest comms
- Budget markets (may not afford premium software)

### ARCHIVE (0-19) - Grade F - NOT A FIT
- Definitely part of a big chain (corporate decisions)
- Wrong job role entirely (chef, housekeeping, security)
- Not a hotel (restaurant, cafe, hospital)
- Staffing agency posting (not direct hotel)

## ANALYZE THESE SIGNALS

**Buying Signals (positive):**
- "Busy front desk" / "high guest volume" - needs automation
- "24/7 coverage needed" - AI can help with off-hours
- "WhatsApp inquiries" - we specialize in this
- "Multiple languages" - AI handles this well
- "Quick response time" - AI excels here
- "Expanding" / "growing" - investing in tools
- "Modernizing" / "digitizing" - open to new tech

**Concerns (negative):**
- "Part of [chain name] family" - corporate decision
- "Opening soon" - might not be ready to buy
- "Budget hotel" - price sensitive
- Very large team mentioned - complex org
- Already using specific systems (may be locked in)

## OUTPUT FORMAT
Return JSON array with one object per prospect:
[{
  "index": 1,
  "action": "keep" or "archive",
  "fit_score": 75,
  "fit_grade": "B",
  "reason": "Independent boutique hotel hiring front desk - perfect ICP",
  "buying_signals": ["Mentions high WhatsApp volume", "Looking for quick response times"],
  "concerns": ["Large property - may have existing systems"],
  "hotel_size_estimate": "small" | "medium" | "large" | "unknown",
  "decision_maker_access": "direct" | "likely" | "unlikely" | "unknown",
  "automation_opportunity": "high" | "medium" | "low",
  "recommended_approach": "Lead with WhatsApp automation case study"
}]`;

export function buildScoringUserPrompt(prospects: string, count: number): string {
  return `Analyze and score these ${count} hotel prospects. Consider their job postings, pain points, and likelihood to buy our guest communication software:\n\n${prospects}`;
}

/**
 * Lists of keywords for rule-based filtering
 */
export const IRRELEVANT_JOB_TITLES = [
  'sous chef', 'chef', 'cook', 'kitchen', 'culinary',
  'housekeeping', 'housekeeper', 'room attendant', 'cleaner',
  'bartender', 'barista', 'waiter', 'waitress', 'server',
  'dishwasher', 'steward', 'porter', 'bellhop', 'valet',
  'security', 'guard', 'maintenance', 'engineer', 'technician',
  'laundry', 'linen', 'spa therapist', 'massage', 'lifeguard',
  'driver', 'shuttle', 'landscaper', 'gardener',
];

export const BIG_HOTEL_CHAINS = [
  'marriott', 'hilton', 'ihg', 'intercontinental', 'holiday inn',
  'hyatt', 'accor', 'wyndham', 'choice hotels', 'best western',
  'radisson', 'sheraton', 'westin', 'w hotel', 'st regis',
  'ritz carlton', 'ritz-carlton', 'four seasons', 'fairmont',
  'sofitel', 'novotel', 'ibis', 'mercure', 'pullman',
  'crowne plaza', 'kimpton', 'doubletree', 'hampton inn',
  'courtyard by marriott', 'residence inn', 'springhill suites',
  'aloft', 'element', 'moxy', 'ac hotels', 'le meridien',
  'waldorf astoria', 'conrad', 'canopy', 'curio', 'tapestry',
  'embassy suites', 'homewood suites', 'home2 suites',
  'tru by hilton', 'motto', 'signia', 'lxr',
  'regent', 'park hyatt', 'andaz', 'grand hyatt', 'hyatt regency',
  'hyatt place', 'hyatt house', 'thompson', 'tommie',
  'mgm', 'caesars', 'wynn', 'bellagio', 'venetian', 'palazzo',
  'mandarin oriental', 'peninsula', 'shangri-la', 'banyan tree',
  'anantara', 'six senses', 'aman', 'como', 'one&only',
  'rosewood', 'montage', 'auberge', 'oetker collection',
  'rocco forte', 'dorchester collection', 'leading hotels',
];

export const NON_HOTEL_KEYWORDS = [
  'restaurant only', 'pub', 'bar & grill', 'cafe', 'coffee shop',
  'nightclub', 'casino', 'cruise', 'airline', 'airport',
  'hospital', 'nursing home', 'care home', 'retirement',
  'university', 'college', 'school', 'student accommodation',
  'office', 'coworking', 'serviced apartment', 'aparthotel',
];
