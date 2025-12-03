/**
 * Advanced Lead Scoring Engine
 *
 * Multi-signal scoring with:
 * - Contact & property quality
 * - Engagement signals (opens, replies, clicks)
 * - Pain point detection from job descriptions
 * - Time decay (recency weighting)
 * - Google review analysis
 * - Dynamic tier adjustments
 */

import { createServerClient } from '@/lib/supabase';
import { logger } from '../logger';

export interface ScoreBreakdown {
  // Base scores
  contactQuality: number;
  onlinePresence: number;
  propertyQuality: number;
  marketTier: number;
  hiringSignals: number;

  // Engagement scores (new)
  engagementScore: number;
  replyBonus: number;
  openBonus: number;

  // Pain point scores (new)
  painPointScore: number;

  // Review signals (new)
  reviewSignals: number;

  // Time decay (new)
  recencyFactor: number;

  // Detailed breakdown
  details: Record<string, number>;
}

export interface ScoringResult {
  total: number;
  tier: 'hot' | 'warm' | 'cold' | 'ice';
  breakdown: ScoreBreakdown;
  recommendations: string[];
  lastCalculated: Date;
}

// Scoring weights (can be adjusted based on conversion data)
const WEIGHTS = {
  // Contact Quality (max 35)
  HAS_PERSONAL_EMAIL: 15,
  HAS_GENERIC_EMAIL: 5,
  HAS_CONTACT_NAME: 12,
  HAS_PHONE: 5,
  HAS_LINKEDIN_CONTACT: 8,

  // Online Presence (max 25)
  HAS_WEBSITE: 5,
  HAS_LINKEDIN_COMPANY: 8,
  HAS_INSTAGRAM: 4,
  HAS_GOOGLE_PLACE: 5,
  HAS_BOOKING_LINKS: 3,

  // Property Quality (max 30)
  FIVE_STAR: 15,
  FOUR_STAR: 10,
  THREE_STAR: 5,
  LUXURY_CHAIN: 15,
  MAJOR_CHAIN: 8,
  BOUTIQUE: 10,
  INDEPENDENT: 5,

  // Market Tier (max 15)
  TIER_1_MARKET: 15,
  TIER_2_MARKET: 10,
  TIER_3_MARKET: 5,

  // Hiring Signals (max 20)
  SENIOR_ROLE: 15,
  GROWTH_ROLE: 10,
  OPS_ROLE: 5,
  JOB_PAIN_POINTS: 10,

  // Engagement Signals (max 30) - NEW
  EMAIL_OPENED: 5,
  EMAIL_REPLIED: 20,
  MULTIPLE_OPENS: 10,
  CLICKED_LINK: 8,
  VISITED_CALENDLY: 15,

  // Review Signals (max 15) - NEW
  HIGH_RATING: 8,
  MANY_REVIEWS: 5,
  RECENT_REVIEWS: 5,
  RESPONSE_TO_REVIEWS: 7,

  // Pain Point Signals (max 20) - NEW
  COMMUNICATION_PAIN: 10,
  SPEED_PAIN: 10,
  ADMIN_PAIN: 8,
  HIRING_DIFFICULTY: 8,
};

// Market tiers
const TIER_1_MARKETS = [
  'london', 'paris', 'dubai', 'new york', 'miami', 'singapore',
  'hong kong', 'tokyo', 'maldives', 'monaco', 'zurich', 'geneva',
  'los angeles', 'san francisco', 'sydney', 'melbourne',
];

const TIER_2_MARKETS = [
  'barcelona', 'madrid', 'rome', 'milan', 'amsterdam', 'berlin',
  'vienna', 'prague', 'lisbon', 'copenhagen', 'stockholm',
  'chicago', 'boston', 'seattle', 'washington', 'toronto',
  'bangkok', 'bali', 'phuket', 'seychelles', 'mauritius',
];

// Luxury chains
const LUXURY_CHAINS = [
  'Four Seasons', 'Ritz-Carlton', 'St. Regis', 'Mandarin Oriental',
  'Peninsula', 'Aman', 'Six Senses', 'Rosewood', 'Belmond',
  'Raffles', 'Waldorf Astoria', 'Park Hyatt', 'Bulgari',
  'One&Only', 'Cheval Blanc', 'Edition', 'Faena',
];

const MAJOR_CHAINS = [
  'Marriott', 'Hilton', 'Hyatt', 'IHG', 'Accor', 'Wyndham',
  'Best Western', 'Choice Hotels', 'Radisson', 'NH Hotels',
];

/**
 * Calculate engagement score from email interactions
 */
async function calculateEngagementScore(
  supabase: ReturnType<typeof createServerClient>,
  prospectId: string
): Promise<{ score: number; details: Record<string, number> }> {
  const details: Record<string, number> = {};
  let score = 0;

  // Get email stats
  const { data: emails } = await supabase
    .from('emails')
    .select('status, opened_at, replied_at, clicked_at, direction')
    .eq('prospect_id', prospectId);

  if (!emails || emails.length === 0) {
    return { score: 0, details };
  }

  const outboundEmails = emails.filter(e => e.direction === 'outbound');
  const openedCount = outboundEmails.filter(e => e.opened_at).length;
  const repliedCount = emails.filter(e => e.direction === 'inbound').length;
  const clickedCount = outboundEmails.filter(e => e.clicked_at).length;

  // Scoring
  if (repliedCount > 0) {
    details.replied = WEIGHTS.EMAIL_REPLIED;
    score += WEIGHTS.EMAIL_REPLIED;
  }

  if (openedCount > 0) {
    details.opened = WEIGHTS.EMAIL_OPENED;
    score += WEIGHTS.EMAIL_OPENED;

    if (openedCount >= 3) {
      details.multiple_opens = WEIGHTS.MULTIPLE_OPENS;
      score += WEIGHTS.MULTIPLE_OPENS;
    }
  }

  if (clickedCount > 0) {
    details.clicked = WEIGHTS.CLICKED_LINK;
    score += WEIGHTS.CLICKED_LINK;
  }

  return { score, details };
}

/**
 * Calculate pain point score from job description
 */
function calculatePainPointScore(
  jobPainPoints: Record<string, unknown> | null
): { score: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let score = 0;

  if (!jobPainPoints) {
    return { score: 0, details };
  }

  const communicationTasks = jobPainPoints.communicationTasks as string[] | undefined;
  const adminTasks = jobPainPoints.adminTasks as string[] | undefined;
  const speedRequirements = jobPainPoints.speedRequirements as string[] | undefined;

  if (communicationTasks && communicationTasks.length > 0) {
    details.communication_pain = Math.min(communicationTasks.length * 3, WEIGHTS.COMMUNICATION_PAIN);
    score += details.communication_pain;
  }

  if (speedRequirements && speedRequirements.length > 0) {
    details.speed_pain = Math.min(speedRequirements.length * 3, WEIGHTS.SPEED_PAIN);
    score += details.speed_pain;
  }

  if (adminTasks && adminTasks.length > 0) {
    details.admin_pain = Math.min(adminTasks.length * 2, WEIGHTS.ADMIN_PAIN);
    score += details.admin_pain;
  }

  return { score, details };
}

/**
 * Calculate review-based signals
 */
function calculateReviewScore(prospect: Record<string, unknown>): { score: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let score = 0;

  const rating = prospect.google_rating as number | null;
  const reviewCount = prospect.google_review_count as number | null;

  if (rating && rating >= 4.5) {
    details.high_rating = WEIGHTS.HIGH_RATING;
    score += WEIGHTS.HIGH_RATING;
  } else if (rating && rating >= 4.0) {
    details.good_rating = Math.floor(WEIGHTS.HIGH_RATING / 2);
    score += details.good_rating;
  }

  if (reviewCount && reviewCount >= 100) {
    details.many_reviews = WEIGHTS.MANY_REVIEWS;
    score += WEIGHTS.MANY_REVIEWS;
  } else if (reviewCount && reviewCount >= 50) {
    details.some_reviews = Math.floor(WEIGHTS.MANY_REVIEWS / 2);
    score += details.some_reviews;
  }

  return { score, details };
}

/**
 * Calculate time decay factor
 * Leads lose value over time if not engaged
 */
function calculateRecencyFactor(prospect: Record<string, unknown>): number {
  const lastContacted = prospect.last_contacted_at as string | null;
  const createdAt = prospect.created_at as string;

  const referenceDate = lastContacted || createdAt;
  if (!referenceDate) return 1.0;

  const daysSince = Math.floor((Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24));

  // No decay for first 14 days
  if (daysSince <= 14) return 1.0;

  // Gradual decay after 14 days
  // 30 days = 0.9, 60 days = 0.75, 90 days = 0.6, 180 days = 0.4
  const decayRate = 0.005;
  const factor = Math.max(1.0 - (daysSince - 14) * decayRate, 0.3);

  return factor;
}

/**
 * Calculate base score (contact, property, market)
 */
function calculateBaseScore(prospect: Record<string, unknown>): { score: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let score = 0;

  // === CONTACT QUALITY ===
  const email = prospect.email as string | null;
  if (email) {
    const isPersonal = !email.startsWith('info@') &&
                       !email.startsWith('contact@') &&
                       !email.startsWith('reservations@') &&
                       !email.startsWith('hello@');
    if (isPersonal) {
      details.personal_email = WEIGHTS.HAS_PERSONAL_EMAIL;
      score += WEIGHTS.HAS_PERSONAL_EMAIL;
    } else {
      details.generic_email = WEIGHTS.HAS_GENERIC_EMAIL;
      score += WEIGHTS.HAS_GENERIC_EMAIL;
    }
  }

  if (prospect.contact_name) {
    details.contact_name = WEIGHTS.HAS_CONTACT_NAME;
    score += WEIGHTS.HAS_CONTACT_NAME;
  }

  if (prospect.phone) {
    details.phone = WEIGHTS.HAS_PHONE;
    score += WEIGHTS.HAS_PHONE;
  }

  // === ONLINE PRESENCE ===
  if (prospect.website) {
    details.website = WEIGHTS.HAS_WEBSITE;
    score += WEIGHTS.HAS_WEBSITE;
  }

  if (prospect.linkedin_url) {
    details.linkedin = WEIGHTS.HAS_LINKEDIN_COMPANY;
    score += WEIGHTS.HAS_LINKEDIN_COMPANY;
  }

  if (prospect.instagram_handle) {
    details.instagram = WEIGHTS.HAS_INSTAGRAM;
    score += WEIGHTS.HAS_INSTAGRAM;
  }

  if (prospect.google_place_id) {
    details.google_place = WEIGHTS.HAS_GOOGLE_PLACE;
    score += WEIGHTS.HAS_GOOGLE_PLACE;
  }

  // === PROPERTY QUALITY ===
  const starRating = prospect.star_rating as number | null;
  if (starRating) {
    if (starRating >= 5) {
      details.five_star = WEIGHTS.FIVE_STAR;
      score += WEIGHTS.FIVE_STAR;
    } else if (starRating >= 4) {
      details.four_star = WEIGHTS.FOUR_STAR;
      score += WEIGHTS.FOUR_STAR;
    } else if (starRating >= 3) {
      details.three_star = WEIGHTS.THREE_STAR;
      score += WEIGHTS.THREE_STAR;
    }
  }

  const chain = prospect.chain_affiliation as string | null;
  if (chain) {
    if (LUXURY_CHAINS.some(c => chain.toLowerCase().includes(c.toLowerCase()))) {
      details.luxury_chain = WEIGHTS.LUXURY_CHAIN;
      score += WEIGHTS.LUXURY_CHAIN;
    } else if (MAJOR_CHAINS.some(c => chain.toLowerCase().includes(c.toLowerCase()))) {
      details.major_chain = WEIGHTS.MAJOR_CHAIN;
      score += WEIGHTS.MAJOR_CHAIN;
    }
  } else {
    details.independent = WEIGHTS.INDEPENDENT;
    score += WEIGHTS.INDEPENDENT;
  }

  // === MARKET TIER ===
  const city = ((prospect.city as string) || '').toLowerCase();
  if (TIER_1_MARKETS.some(market => city.includes(market))) {
    details.tier_1_market = WEIGHTS.TIER_1_MARKET;
    score += WEIGHTS.TIER_1_MARKET;
  } else if (TIER_2_MARKETS.some(market => city.includes(market))) {
    details.tier_2_market = WEIGHTS.TIER_2_MARKET;
    score += WEIGHTS.TIER_2_MARKET;
  } else if (city) {
    details.tier_3_market = WEIGHTS.TIER_3_MARKET;
    score += WEIGHTS.TIER_3_MARKET;
  }

  // === HIRING SIGNALS ===
  const jobTitle = ((prospect.source_job_title as string) || '').toLowerCase();
  const seniorRoles = ['general manager', 'gm', 'director', 'ceo', 'owner', 'managing director', 'president', 'vp', 'head of'];
  const growthRoles = ['revenue', 'marketing', 'digital', 'sales', 'technology', 'innovation', 'e-commerce'];
  const opsRoles = ['operations', 'f&b', 'food', 'rooms division', 'front office'];

  if (seniorRoles.some(role => jobTitle.includes(role))) {
    details.senior_role = WEIGHTS.SENIOR_ROLE;
    score += WEIGHTS.SENIOR_ROLE;
  }

  if (growthRoles.some(role => jobTitle.includes(role))) {
    details.growth_role = WEIGHTS.GROWTH_ROLE;
    score += WEIGHTS.GROWTH_ROLE;
  }

  if (opsRoles.some(role => jobTitle.includes(role))) {
    details.ops_role = WEIGHTS.OPS_ROLE;
    score += WEIGHTS.OPS_ROLE;
  }

  return { score, details };
}

/**
 * Main scoring function - calculates comprehensive score
 */
export async function calculateAdvancedScore(
  prospect: Record<string, unknown>,
  options: { includeEngagement?: boolean } = {}
): Promise<ScoringResult> {
  const details: Record<string, number> = {};
  const recommendations: string[] = [];

  // Calculate base score
  const baseResult = calculateBaseScore(prospect);
  Object.assign(details, baseResult.details);

  // Calculate review signals
  const reviewResult = calculateReviewScore(prospect);
  Object.assign(details, reviewResult.details);

  // Calculate pain point score
  const painPointResult = calculatePainPointScore(prospect.job_pain_points as Record<string, unknown> | null);
  Object.assign(details, painPointResult.details);

  // Calculate engagement score (if enabled and prospect has ID)
  let engagementResult = { score: 0, details: {} as Record<string, number> };
  if (options.includeEngagement && prospect.id) {
    const supabase = createServerClient();
    engagementResult = await calculateEngagementScore(supabase, prospect.id as string);
    Object.assign(details, engagementResult.details);
  }

  // Calculate time decay
  const recencyFactor = calculateRecencyFactor(prospect);

  // Calculate raw total
  const rawTotal = baseResult.score + reviewResult.score + painPointResult.score + engagementResult.score;

  // Apply time decay
  const adjustedTotal = Math.round(rawTotal * recencyFactor);

  // Cap at 100
  const finalTotal = Math.min(adjustedTotal, 100);

  // Determine tier
  let tier: 'hot' | 'warm' | 'cold' | 'ice';
  if (finalTotal >= 75) {
    tier = 'hot';
  } else if (finalTotal >= 50) {
    tier = 'warm';
  } else if (finalTotal >= 25) {
    tier = 'cold';
  } else {
    tier = 'ice';
  }

  // Generate recommendations
  if (!prospect.email) {
    recommendations.push('Find email address - major boost to score');
  } else if (details.generic_email) {
    recommendations.push('Find personal contact email for better engagement');
  }

  if (!prospect.contact_name) {
    recommendations.push('Identify specific contact person');
  }

  if (recencyFactor < 0.8) {
    recommendations.push('Lead is going stale - prioritize follow-up');
  }

  if (painPointResult.score === 0 && prospect.source_job_description) {
    recommendations.push('Re-analyze job description for pain points');
  }

  if (engagementResult.score === 0 && prospect.email) {
    recommendations.push('No engagement yet - send initial outreach');
  }

  const breakdown: ScoreBreakdown = {
    contactQuality: (details.personal_email || 0) + (details.generic_email || 0) + (details.contact_name || 0) + (details.phone || 0),
    onlinePresence: (details.website || 0) + (details.linkedin || 0) + (details.instagram || 0) + (details.google_place || 0),
    propertyQuality: (details.five_star || 0) + (details.four_star || 0) + (details.three_star || 0) + (details.luxury_chain || 0) + (details.major_chain || 0) + (details.independent || 0),
    marketTier: (details.tier_1_market || 0) + (details.tier_2_market || 0) + (details.tier_3_market || 0),
    hiringSignals: (details.senior_role || 0) + (details.growth_role || 0) + (details.ops_role || 0),
    engagementScore: engagementResult.score,
    replyBonus: details.replied || 0,
    openBonus: details.opened || 0,
    painPointScore: painPointResult.score,
    reviewSignals: reviewResult.score,
    recencyFactor,
    details,
  };

  logger.debug({
    prospectId: prospect.id,
    rawTotal,
    adjustedTotal: finalTotal,
    tier,
    recencyFactor,
  }, 'Advanced score calculated');

  return {
    total: finalTotal,
    tier,
    breakdown,
    recommendations,
    lastCalculated: new Date(),
  };
}

/**
 * Batch score multiple prospects
 */
export async function scoreProspectsBatch(
  prospects: Array<Record<string, unknown>>,
  options: { includeEngagement?: boolean } = {}
): Promise<Map<string, ScoringResult>> {
  const results = new Map<string, ScoringResult>();

  for (const prospect of prospects) {
    const id = prospect.id as string;
    if (id) {
      const score = await calculateAdvancedScore(prospect, options);
      results.set(id, score);
    }
  }

  return results;
}

/**
 * Get tier thresholds (can be made dynamic based on data)
 */
export function getTierThresholds(): { hot: number; warm: number; cold: number } {
  return {
    hot: 75,
    warm: 50,
    cold: 25,
  };
}

/**
 * Legacy compatibility - simple score calculation
 */
export function calculateScore(prospect: Record<string, unknown>): { total: number; breakdown: Record<string, number> } {
  const baseResult = calculateBaseScore(prospect);
  const reviewResult = calculateReviewScore(prospect);
  const total = Math.min(baseResult.score + reviewResult.score, 100);

  return {
    total,
    breakdown: { ...baseResult.details, ...reviewResult.details },
  };
}

/**
 * Legacy compatibility - get tier from score
 */
export function getTier(score: number): string {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  if (score >= 25) return 'cold';
  return 'ice';
}
