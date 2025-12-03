/**
 * Prospect Readiness System
 *
 * Calculates how "ready" a prospect is for outreach.
 * Different from "score" which measures lead quality.
 * Readiness = Do we have the data we need to take action?
 */

export interface ReadinessBreakdown {
  contact: number;        // 0-40: Email, contact name, title
  property: number;       // 0-25: Website, Google Place, star rating
  enrichment: number;     // 0-25: Google rating, reviews, social, address
  research: number;       // 0-10: Notes, tags
  total: number;          // 0-100: Overall readiness
  tier: ReadinessTier;
  missingFields: string[];
  nextAction: NextAction;
}

export type ReadinessTier =
  | 'email_ready'      // 90-100%: Can email now
  | 'almost_ready'     // 70-89%: Quick action needed
  | 'needs_enrichment' // 50-69%: Run enrichment
  | 'needs_research'   // 30-49%: Significant work
  | 'new_lead';        // 0-29%: Start fresh

export interface NextAction {
  label: string;
  action: 'generate_email' | 'find_contact' | 'enrich' | 'research' | 'view';
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface ProspectData {
  email?: string | null;
  email_confidence?: 'low' | 'medium' | 'high' | null;
  contact_name?: string | null;
  contact_title?: string | null;
  phone?: string | null;
  website?: string | null;
  google_place_id?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  star_rating?: number | null;
  chain_affiliation?: string | null;
  linkedin_url?: string | null;
  instagram_handle?: string | null;
  full_address?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  stage?: string | null;
  tier?: string | null;
  score?: number | null;
}

/**
 * Calculate readiness score for a prospect
 */
export function calculateReadiness(prospect: ProspectData): ReadinessBreakdown {
  const missingFields: string[] = [];
  let contact = 0;
  let property = 0;
  let enrichment = 0;
  let research = 0;

  // === CONTACT (40 pts) ===
  if (prospect.email) {
    contact += 15;
    // Bonus for high confidence / personal email
    if (prospect.email_confidence === 'high') {
      contact += 10;
    } else if (!prospect.email.startsWith('info@') && !prospect.email.startsWith('contact@')) {
      contact += 5; // Likely personal email
    }
  } else {
    missingFields.push('Email');
  }

  if (prospect.contact_name) {
    contact += 10;
  } else {
    missingFields.push('Contact name');
  }

  if (prospect.contact_title) {
    contact += 5;
  } else if (prospect.contact_name) {
    missingFields.push('Contact title');
  }

  // === PROPERTY (25 pts) ===
  if (prospect.website) {
    property += 10;
  } else {
    missingFields.push('Website');
  }

  if (prospect.google_place_id) {
    property += 10;
  } else {
    missingFields.push('Google verification');
  }

  if (prospect.star_rating) {
    property += 5;
  }

  // === ENRICHMENT (25 pts) ===
  if (prospect.google_rating) {
    enrichment += 5;
  }

  if (prospect.google_review_count && prospect.google_review_count > 0) {
    enrichment += 5;
  }

  if (prospect.linkedin_url || prospect.instagram_handle) {
    enrichment += 5;
  } else {
    missingFields.push('Social links');
  }

  if (prospect.full_address) {
    enrichment += 5;
  }

  if (prospect.chain_affiliation) {
    enrichment += 5;
  }

  // === RESEARCH (10 pts) ===
  if (prospect.notes && prospect.notes.length > 50) {
    research += 5;
  }

  if (prospect.tags && prospect.tags.length >= 2) {
    research += 5;
  }

  // Calculate total (cap at 100)
  const total = Math.min(contact + property + enrichment + research, 100);

  // Determine tier
  const tier = getTierFromScore(total);

  // Determine next action
  const nextAction = getNextAction(prospect, total, missingFields);

  return {
    contact,
    property,
    enrichment,
    research,
    total,
    tier,
    missingFields,
    nextAction,
  };
}

/**
 * Get tier from readiness score
 */
function getTierFromScore(score: number): ReadinessTier {
  if (score >= 90) return 'email_ready';
  if (score >= 70) return 'almost_ready';
  if (score >= 50) return 'needs_enrichment';
  if (score >= 30) return 'needs_research';
  return 'new_lead';
}

/**
 * Determine next action based on prospect state
 */
function getNextAction(
  prospect: ProspectData,
  readinessScore: number,
  missingFields: string[]
): NextAction {
  // Already in later stages - view/follow up
  if (prospect.stage && ['engaged', 'meeting', 'proposal', 'won'].includes(prospect.stage)) {
    return {
      label: 'View Details',
      action: 'view',
      priority: 'medium',
      description: 'Continue the conversation',
    };
  }

  // Email ready - generate and send
  if (readinessScore >= 90) {
    return {
      label: 'Generate Email',
      action: 'generate_email',
      priority: 'high',
      description: 'Ready for outreach',
    };
  }

  // Has email but no contact name
  if (prospect.email && !prospect.contact_name) {
    return {
      label: 'Find Contact',
      action: 'find_contact',
      priority: 'high',
      description: 'Find decision maker',
    };
  }

  // Missing email - needs enrichment
  if (!prospect.email) {
    return {
      label: 'Enrich Data',
      action: 'enrich',
      priority: 'high',
      description: `Missing: ${missingFields.slice(0, 2).join(', ')}`,
    };
  }

  // Almost ready - quick enrich
  if (readinessScore >= 70) {
    return {
      label: 'Quick Enrich',
      action: 'enrich',
      priority: 'medium',
      description: `Missing: ${missingFields.slice(0, 2).join(', ')}`,
    };
  }

  // Needs enrichment
  if (readinessScore >= 50) {
    return {
      label: 'Enrich Now',
      action: 'enrich',
      priority: 'medium',
      description: `${missingFields.length} fields missing`,
    };
  }

  // Needs research
  return {
    label: 'Start Research',
    action: 'research',
    priority: 'low',
    description: 'Gather basic information',
  };
}

/**
 * Get tier display info
 */
export function getTierInfo(tier: ReadinessTier): {
  label: string;
  color: string;
  bgColor: string;
  description: string;
} {
  switch (tier) {
    case 'email_ready':
      return {
        label: 'Email Ready',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/20',
        description: 'Ready to send outreach',
      };
    case 'almost_ready':
      return {
        label: 'Almost Ready',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        description: 'Quick action needed',
      };
    case 'needs_enrichment':
      return {
        label: 'Needs Enrichment',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        description: 'Run data enrichment',
      };
    case 'needs_research':
      return {
        label: 'Needs Research',
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        description: 'Significant gaps to fill',
      };
    case 'new_lead':
      return {
        label: 'New Lead',
        color: 'text-zinc-400',
        bgColor: 'bg-zinc-500/20',
        description: 'Start from scratch',
      };
  }
}

/**
 * Get battery color based on percentage
 */
export function getBatteryColor(percentage: number): string {
  if (percentage >= 90) return 'bg-emerald-500';
  if (percentage >= 70) return 'bg-blue-500';
  if (percentage >= 50) return 'bg-amber-500';
  if (percentage >= 30) return 'bg-orange-500';
  return 'bg-zinc-500';
}

/**
 * Get battery glow color based on percentage
 */
export function getBatteryGlow(percentage: number): string {
  if (percentage >= 90) return 'shadow-emerald-500/30';
  if (percentage >= 70) return 'shadow-blue-500/30';
  if (percentage >= 50) return 'shadow-amber-500/30';
  if (percentage >= 30) return 'shadow-orange-500/30';
  return 'shadow-zinc-500/30';
}

/**
 * Sort prospects by readiness (highest first)
 */
export function sortByReadiness<T extends ProspectData>(prospects: T[]): T[] {
  return [...prospects].sort((a, b) => {
    const readinessA = calculateReadiness(a).total;
    const readinessB = calculateReadiness(b).total;
    return readinessB - readinessA;
  });
}

/**
 * Group prospects by readiness tier
 */
export function groupByReadiness<T extends ProspectData>(
  prospects: T[]
): Record<ReadinessTier, T[]> {
  const groups: Record<ReadinessTier, T[]> = {
    email_ready: [],
    almost_ready: [],
    needs_enrichment: [],
    needs_research: [],
    new_lead: [],
  };

  for (const prospect of prospects) {
    const { tier } = calculateReadiness(prospect);
    groups[tier].push(prospect);
  }

  // Sort each group by readiness score (highest first)
  for (const tier of Object.keys(groups) as ReadinessTier[]) {
    groups[tier] = sortByReadiness(groups[tier]);
  }

  return groups;
}

/**
 * Get readiness summary for a list of prospects
 */
export function getReadinessSummary(prospects: ProspectData[]): {
  emailReady: number;
  almostReady: number;
  needsEnrichment: number;
  needsResearch: number;
  newLead: number;
  averageReadiness: number;
} {
  const groups = groupByReadiness(prospects);
  const total = prospects.reduce((sum, p) => sum + calculateReadiness(p).total, 0);

  return {
    emailReady: groups.email_ready.length,
    almostReady: groups.almost_ready.length,
    needsEnrichment: groups.needs_enrichment.length,
    needsResearch: groups.needs_research.length,
    newLead: groups.new_lead.length,
    averageReadiness: prospects.length > 0 ? Math.round(total / prospects.length) : 0,
  };
}
