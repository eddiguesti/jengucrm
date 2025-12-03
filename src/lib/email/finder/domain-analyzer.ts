/**
 * Domain Email Pattern Analyzer
 *
 * Learns email patterns from:
 * 1. Known emails in our database
 * 2. Hunter.io domain search
 * 3. Website scraping (planned)
 *
 * Uses pattern recognition to predict most likely email format
 */

import { createServerClient } from '@/lib/supabase';
import { hunterDomainSearch } from './services';
import { logger } from '../../logger';

export interface DomainPattern {
  domain: string;
  pattern: string; // e.g., '{first}.{last}', '{f}{last}'
  confidence: number; // 0-100
  sampleSize: number;
  isCatchAll: boolean;
  isWebmail: boolean;
  organization?: string;
  lastUpdated: Date;
}

// Common pattern templates
const PATTERN_TEMPLATES = [
  { regex: /^([a-z]+)\.([a-z]+)@/, template: '{first}.{last}', priority: 1 },
  { regex: /^([a-z]+)([a-z]+)@/, template: '{first}{last}', priority: 2 },
  { regex: /^([a-z])([a-z]+)@/, template: '{f}{last}', priority: 3 },
  { regex: /^([a-z]+)_([a-z]+)@/, template: '{first}_{last}', priority: 4 },
  { regex: /^([a-z]+)-([a-z]+)@/, template: '{first}-{last}', priority: 5 },
  { regex: /^([a-z])\.([a-z]+)@/, template: '{f}.{last}', priority: 6 },
  { regex: /^([a-z]+)\.([a-z])@/, template: '{first}.{l}', priority: 7 },
  { regex: /^([a-z]+)@/, template: '{first}', priority: 8 },
  { regex: /^([a-z]+)([a-z])@/, template: '{first}{l}', priority: 9 },
];

// In-memory cache for pattern analysis
const patternCache = new Map<string, { pattern: DomainPattern; timestamp: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Detect pattern from a single email
 */
function detectPatternFromEmail(
  email: string,
  firstName?: string,
  lastName?: string
): string | null {
  const localPart = email.split('@')[0]?.toLowerCase();
  if (!localPart) return null;

  const first = firstName?.toLowerCase();
  const last = lastName?.toLowerCase();

  // If we have name data, use it for precise matching
  if (first && last) {
    const f = first.charAt(0);
    const l = last.charAt(0);

    // Check exact patterns
    if (localPart === `${first}.${last}`) return '{first}.{last}';
    if (localPart === `${first}${last}`) return '{first}{last}';
    if (localPart === `${f}${last}`) return '{f}{last}';
    if (localPart === `${first}_${last}`) return '{first}_{last}';
    if (localPart === `${first}-${last}`) return '{first}-{last}';
    if (localPart === `${f}.${last}`) return '{f}.{last}';
    if (localPart === `${first}.${l}`) return '{first}.{l}';
    if (localPart === `${last}.${first}`) return '{last}.{first}';
    if (localPart === `${last}${first}`) return '{last}{first}';
    if (localPart === `${last}_${first}`) return '{last}_{first}';
    if (localPart === `${first}`) return '{first}';
    if (localPart === `${last}`) return '{last}';
    if (localPart === `${first}${l}`) return '{first}{l}';
    if (localPart === `${f}${l}`) return '{f}{l}';
  }

  // Fallback to regex-based detection
  for (const { regex, template } of PATTERN_TEMPLATES) {
    if (regex.test(localPart + '@')) {
      return template;
    }
  }

  return null;
}

/**
 * Analyze patterns from multiple emails
 */
function analyzePatterns(
  emails: { email: string; firstName?: string; lastName?: string }[]
): { pattern: string; count: number; confidence: number }[] {
  const patternCounts = new Map<string, number>();

  for (const { email, firstName, lastName } of emails) {
    const pattern = detectPatternFromEmail(email, firstName, lastName);
    if (pattern) {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
  }

  const total = emails.length || 1;
  const results: { pattern: string; count: number; confidence: number }[] = [];

  for (const [pattern, count] of patternCounts) {
    results.push({
      pattern,
      count,
      confidence: Math.round((count / total) * 100),
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get domain pattern from database (known emails)
 */
async function getDomainPatternFromDb(domain: string): Promise<DomainPattern | null> {
  try {
    const supabase = createServerClient();

    // Get emails from this domain that we've successfully sent to or received from
    const { data: emails } = await supabase
      .from('emails')
      .select('to_email, from_email')
      .or(`to_email.ilike.%@${domain},from_email.ilike.%@${domain}`)
      .limit(50);

    if (!emails || emails.length === 0) {
      return null;
    }

    // Get prospect data for name matching
    const domainEmails = emails
      .flatMap(e => [e.to_email, e.from_email])
      .filter((e): e is string => !!e && e.toLowerCase().endsWith(`@${domain}`));

    const uniqueEmails = [...new Set(domainEmails)];

    // Get prospect names for these emails
    const { data: prospects } = await supabase
      .from('prospects')
      .select('email, contact_name, name')
      .in('email', uniqueEmails);

    const emailsWithNames = uniqueEmails.map(email => {
      const prospect = prospects?.find(p => p.email?.toLowerCase() === email.toLowerCase());
      const name = prospect?.contact_name || prospect?.name || '';
      const parts = name.split(' ');
      return {
        email,
        firstName: parts[0] || undefined,
        lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
      };
    });

    const patterns = analyzePatterns(emailsWithNames);

    if (patterns.length === 0) {
      return null;
    }

    return {
      domain,
      pattern: patterns[0].pattern,
      confidence: patterns[0].confidence,
      sampleSize: uniqueEmails.length,
      isCatchAll: false, // We don't know from DB alone
      isWebmail: isWebmailDomain(domain),
      lastUpdated: new Date(),
    };
  } catch (error) {
    logger.error({ error, domain }, 'Failed to get domain pattern from DB');
    return null;
  }
}

/**
 * Get domain pattern from Hunter.io
 */
async function getDomainPatternFromHunter(domain: string): Promise<DomainPattern | null> {
  try {
    const result = await hunterDomainSearch(domain, { limit: 20, type: 'personal' });

    if (!result || result.emails.length === 0) {
      return null;
    }

    // If Hunter provides a pattern directly, use it
    if (result.pattern) {
      const patternMap: Record<string, string> = {
        '{first}.{last}': '{first}.{last}',
        '{f}{last}': '{f}{last}',
        '{first}': '{first}',
        '{first}{last}': '{first}{last}',
        '{first}_{last}': '{first}_{last}',
        '{first}-{last}': '{first}-{last}',
        '{last}{first}': '{last}{first}',
        '{last}.{first}': '{last}.{first}',
      };

      const normalizedPattern = patternMap[result.pattern] || result.pattern;

      return {
        domain,
        pattern: normalizedPattern,
        confidence: 95, // Hunter patterns are very reliable
        sampleSize: result.emails.length,
        isCatchAll: result.acceptAll,
        isWebmail: result.webmail,
        organization: result.organization,
        lastUpdated: new Date(),
      };
    }

    // Otherwise, analyze the emails
    const emailsWithNames = result.emails.map(e => ({
      email: e.email,
      firstName: e.firstName || undefined,
      lastName: e.lastName || undefined,
    }));

    const patterns = analyzePatterns(emailsWithNames);

    if (patterns.length === 0) {
      return null;
    }

    return {
      domain,
      pattern: patterns[0].pattern,
      confidence: Math.min(patterns[0].confidence, 85), // Cap at 85 for analyzed patterns
      sampleSize: result.emails.length,
      isCatchAll: result.acceptAll,
      isWebmail: result.webmail,
      organization: result.organization,
      lastUpdated: new Date(),
    };
  } catch (error) {
    logger.error({ error, domain }, 'Failed to get domain pattern from Hunter');
    return null;
  }
}

/**
 * Check if domain is a webmail provider
 */
function isWebmailDomain(domain: string): boolean {
  const webmailDomains = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
    'aol.com', 'icloud.com', 'me.com', 'mac.com', 'mail.com', 'protonmail.com',
    'proton.me', 'zoho.com', 'yandex.com', 'gmx.com', 'gmx.net',
  ]);
  return webmailDomains.has(domain.toLowerCase());
}

/**
 * Get domain email pattern (main function)
 * Tries multiple sources in order of reliability
 */
export async function getDomainPattern(
  domain: string,
  options: { skipCache?: boolean; skipHunter?: boolean } = {}
): Promise<DomainPattern | null> {
  const normalizedDomain = domain.toLowerCase().trim();

  // Skip webmail domains - no predictable pattern
  if (isWebmailDomain(normalizedDomain)) {
    return {
      domain: normalizedDomain,
      pattern: 'unknown',
      confidence: 0,
      sampleSize: 0,
      isCatchAll: false,
      isWebmail: true,
      lastUpdated: new Date(),
    };
  }

  // Check cache first
  if (!options.skipCache) {
    const cached = patternCache.get(normalizedDomain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.pattern;
    }
  }

  // Try database first (our own data is most relevant)
  const dbPattern = await getDomainPatternFromDb(normalizedDomain);
  if (dbPattern && dbPattern.confidence >= 70) {
    patternCache.set(normalizedDomain, { pattern: dbPattern, timestamp: Date.now() });
    logger.debug({ domain: normalizedDomain, pattern: dbPattern.pattern, source: 'database' }, 'Domain pattern found');
    return dbPattern;
  }

  // Try Hunter.io for additional data
  if (!options.skipHunter) {
    const hunterPattern = await getDomainPatternFromHunter(normalizedDomain);
    if (hunterPattern) {
      // Merge with DB data if available
      const finalPattern = {
        ...hunterPattern,
        confidence: Math.max(hunterPattern.confidence, dbPattern?.confidence || 0),
        sampleSize: (hunterPattern.sampleSize || 0) + (dbPattern?.sampleSize || 0),
      };
      patternCache.set(normalizedDomain, { pattern: finalPattern, timestamp: Date.now() });
      logger.debug({ domain: normalizedDomain, pattern: finalPattern.pattern, source: 'hunter' }, 'Domain pattern found');
      return finalPattern;
    }
  }

  // Return DB pattern even if low confidence, or null
  if (dbPattern) {
    patternCache.set(normalizedDomain, { pattern: dbPattern, timestamp: Date.now() });
    return dbPattern;
  }

  return null;
}

/**
 * Save analyzed pattern to database for future use
 */
export async function saveDomainPattern(pattern: DomainPattern): Promise<void> {
  try {
    const supabase = createServerClient();

    await supabase.from('domain_patterns').upsert({
      domain: pattern.domain,
      pattern: pattern.pattern,
      confidence: pattern.confidence,
      sample_size: pattern.sampleSize,
      is_catch_all: pattern.isCatchAll,
      is_webmail: pattern.isWebmail,
      organization: pattern.organization,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'domain',
    });

    // Update cache
    patternCache.set(pattern.domain, { pattern, timestamp: Date.now() });
  } catch (error) {
    logger.error({ error, domain: pattern.domain }, 'Failed to save domain pattern');
  }
}

/**
 * Clear pattern cache
 */
export function clearPatternCache(): void {
  patternCache.clear();
}

/**
 * Apply a pattern to generate an email
 */
export function applyPattern(
  pattern: string,
  firstName: string,
  lastName: string,
  domain: string
): string {
  const f = firstName.charAt(0).toLowerCase();
  const l = lastName.charAt(0).toLowerCase();

  const local = pattern
    .replace(/{first}/g, firstName.toLowerCase())
    .replace(/{last}/g, lastName.toLowerCase())
    .replace(/{f}/g, f)
    .replace(/{l}/g, l);

  return `${local}@${domain.toLowerCase()}`;
}
