/**
 * Email Pattern Generator
 * Generates all possible email permutations from name + domain
 */

export interface NameParts {
  firstName: string;
  lastName: string;
  middleName?: string;
  domain: string;
}

export interface EmailCandidate {
  email: string;
  pattern: string;
  priority: number; // Lower = more common pattern
}

/**
 * Common email patterns ordered by frequency/likelihood
 * Based on analysis of millions of business emails
 */
const PATTERNS: { template: string; priority: number }[] = [
  // Most common patterns (priority 1-10)
  { template: '{first}.{last}', priority: 1 },
  { template: '{first}{last}', priority: 2 },
  { template: '{f}{last}', priority: 3 },
  { template: '{first}_{last}', priority: 4 },
  { template: '{first}', priority: 5 },
  { template: '{last}.{first}', priority: 6 },
  { template: '{f}.{last}', priority: 7 },
  { template: '{first}-{last}', priority: 8 },
  { template: '{last}{first}', priority: 9 },
  { template: '{last}', priority: 10 },

  // Common variations (priority 11-20)
  { template: '{first}{l}', priority: 11 },
  { template: '{f}{l}', priority: 12 },
  { template: '{first}.{l}', priority: 13 },
  { template: '{f}_{last}', priority: 14 },
  { template: '{last}_{first}', priority: 15 },
  { template: '{last}-{first}', priority: 16 },
  { template: '{first}.{last}.{m}', priority: 17 },
  { template: '{first}{middle}{last}', priority: 18 },
  { template: '{f}{middle}{last}', priority: 19 },
  { template: '{last}{f}', priority: 20 },

  // Less common but valid (priority 21-35)
  { template: '{f}-{last}', priority: 21 },
  { template: '{first}_{l}', priority: 22 },
  { template: '{f}_{l}', priority: 23 },
  { template: '{l}{first}', priority: 24 },
  { template: '{l}.{first}', priority: 25 },
  { template: '{first}.{m}.{last}', priority: 26 },
  { template: '{f}.{m}.{last}', priority: 27 },
  { template: '{first}{m}{last}', priority: 28 },
  { template: '{last}.{f}', priority: 29 },
  { template: '{last}_{f}', priority: 30 },
  { template: '{first}.{last}1', priority: 31 },
  { template: '{first}{last}1', priority: 32 },
  { template: '{f}{last}1', priority: 33 },
  { template: '{first}1', priority: 34 },
  { template: '{last}1', priority: 35 },
];

/**
 * Clean and normalize a name part
 */
function cleanName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z]/g, ''); // Keep only letters
}

/**
 * Parse a full name into parts
 */
export function parseFullName(fullName: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: cleanName(parts[0]), lastName: '' };
  }

  if (parts.length === 2) {
    return {
      firstName: cleanName(parts[0]),
      lastName: cleanName(parts[1]),
    };
  }

  // 3+ parts: first, middle(s), last
  return {
    firstName: cleanName(parts[0]),
    middleName: cleanName(parts.slice(1, -1).join('')),
    lastName: cleanName(parts[parts.length - 1]),
  };
}

/**
 * Generate all email candidates for a name + domain
 */
export function generateEmailCandidates(nameParts: NameParts): EmailCandidate[] {
  const { firstName, lastName, middleName, domain } = nameParts;

  if (!firstName || !domain) {
    return [];
  }

  const f = firstName.charAt(0);
  const l = lastName ? lastName.charAt(0) : '';
  const m = middleName ? middleName.charAt(0) : '';
  const middle = middleName || '';

  const candidates: EmailCandidate[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    // Skip patterns that require missing parts
    if (pattern.template.includes('{last}') && !lastName) continue;
    if (pattern.template.includes('{l}') && !lastName) continue;
    if (pattern.template.includes('{middle}') && !middleName) continue;
    if (pattern.template.includes('{m}') && !middleName) continue;

    const local = pattern.template
      .replace(/{first}/g, firstName)
      .replace(/{last}/g, lastName)
      .replace(/{f}/g, f)
      .replace(/{l}/g, l)
      .replace(/{middle}/g, middle)
      .replace(/{m}/g, m);

    const email = `${local}@${domain.toLowerCase()}`;

    if (!seen.has(email) && isValidEmailSyntax(email)) {
      seen.add(email);
      candidates.push({
        email,
        pattern: pattern.template,
        priority: pattern.priority,
      });
    }
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}

/**
 * Basic email syntax validation
 */
function isValidEmailSyntax(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Generate emails from a full name string
 */
export function generateEmailsFromName(fullName: string, domain: string): EmailCandidate[] {
  const parsed = parseFullName(fullName);
  return generateEmailCandidates({
    ...parsed,
    domain,
  });
}

/**
 * Extract domain from a website URL
 */
export function extractDomainFromUrl(url: string): string | null {
  try {
    // Add protocol if missing
    let urlToParse = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      urlToParse = `https://${url}`;
    }

    const parsed = new URL(urlToParse);
    let domain = parsed.hostname;

    // Remove www prefix
    if (domain.startsWith('www.')) {
      domain = domain.slice(4);
    }

    return domain;
  } catch {
    return null;
  }
}

/**
 * Common corporate email domain patterns
 */
export const CORPORATE_DOMAIN_PATTERNS = [
  // Generic catch-all patterns
  'info@{domain}',
  'contact@{domain}',
  'hello@{domain}',
  'sales@{domain}',
  'enquiries@{domain}',
  'reservations@{domain}',
  'bookings@{domain}',
  'reception@{domain}',
];

/**
 * Generate generic corporate emails for a domain
 */
export function generateCorporateEmails(domain: string): string[] {
  return CORPORATE_DOMAIN_PATTERNS.map(p => p.replace('{domain}', domain.toLowerCase()));
}
