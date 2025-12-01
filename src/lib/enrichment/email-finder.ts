/**
 * Email Finder Module
 *
 * Implements a 7-step process to find and validate decision-maker emails:
 * 1. Website scrape (FREE - primary source)
 * 2. Apollo.io search (FREE unlimited - LinkedIn-sourced contacts)
 * 3. Identify correct decision-maker role (priority order)
 * 4. Identify hotel's email domain
 * 5. Discover email pattern from Apollo.io or generate common patterns
 * 6. Generate email permutations
 * 7. Output final result with confidence score
 *
 * Priority Order:
 *   1. Website scrape (direct emails found)
 *   2. Apollo.io (LinkedIn-sourced, verified)
 *   3. Pattern generation (fallback)
 */

import { extractDomain } from './website-scraper';

// Apollo.io API (FREE unlimited email credits)
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

// Hunter.io API (for email verification)
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

// Decision-maker roles in priority order
const DECISION_MAKER_ROLES = [
  'general manager',
  'gm',
  'operations manager',
  'director of operations',
  'owner',
  'proprietor',
  'managing director',
  'front office manager',
  'hotel manager',
  'it manager',
  'revenue manager',
];

// Fallback roles if no primary found
const FALLBACK_ROLES = [
  'manager',
  'director',
  'head of',
  'chief',
];

export interface EmailFinderResult {
  hotelName: string;
  contactRole: string;
  contactName: string;
  validatedEmail: string | null;
  emailPatternSource: string;
  confidenceScore: 'high' | 'medium' | 'low';
  allEmailsFound: string[];
  verificationStatus?: string;
  fallbackMethod?: string;
}

export interface TeamMember {
  name: string;
  title: string;
  email?: string;
}

/**
 * STEP 1: Identify the correct decision-maker from team members
 */
export function findDecisionMaker(teamMembers: TeamMember[]): TeamMember | null {
  if (!teamMembers.length) return null;

  // Check priority roles first
  for (const role of DECISION_MAKER_ROLES) {
    const match = teamMembers.find(m =>
      m.title.toLowerCase().includes(role)
    );
    if (match) return match;
  }

  // Check fallback roles
  for (const role of FALLBACK_ROLES) {
    const match = teamMembers.find(m =>
      m.title.toLowerCase().includes(role)
    );
    if (match) return match;
  }

  // Return first person if no role match
  return teamMembers[0];
}

/**
 * Search Apollo.io for people at a company
 * Returns decision-makers with verified emails from LinkedIn data
 */
export async function searchApollo(
  companyName: string,
  domain?: string
): Promise<{
  contacts: Array<{
    name: string;
    title: string;
    email: string | null;
    linkedinUrl?: string;
  }>;
  source: string;
}> {
  if (!APOLLO_API_KEY) {
    return { contacts: [], source: 'no_api_key' };
  }

  try {
    // Apollo.io People Search API
    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        organization_domains: domain ? [domain] : undefined,
        person_titles: [
          'General Manager',
          'Hotel Manager',
          'Operations Manager',
          'Managing Director',
          'Owner',
          'Director of Operations',
          'Revenue Manager',
          'IT Manager',
        ],
        page: 1,
        per_page: 10,
      }),
    });

    if (!response.ok) {
      console.error('Apollo.io error:', response.status, await response.text());
      return { contacts: [], source: 'apollo_error' };
    }

    const data = await response.json();
    const people = data.people || [];

    return {
      contacts: people.map((p: {
        name?: string;
        first_name?: string;
        last_name?: string;
        title?: string;
        email?: string;
        linkedin_url?: string;
      }) => ({
        name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        title: p.title || 'Unknown',
        email: p.email || null,
        linkedinUrl: p.linkedin_url,
      })),
      source: 'Apollo.io',
    };
  } catch (error) {
    console.error('Apollo.io search error:', error);
    return { contacts: [], source: 'apollo_error' };
  }
}

/**
 * STEP 4 & 5: Get email pattern from Apollo.io or generate common patterns
 */
export async function getEmailPattern(domain: string): Promise<{
  pattern: string | null;
  source: string;
  emails: string[];
}> {
  // Apollo doesn't return patterns like Hunter, but we can infer from found emails
  // For now, return null and use common patterns
  return {
    pattern: null,
    source: 'common_patterns',
    emails: [],
  };
}

/**
 * STEP 5: Generate email permutations based on pattern or common formats
 */
export function generateEmailPermutations(
  firstName: string,
  lastName: string,
  domain: string,
  pattern?: string | null
): string[] {
  const first = firstName.toLowerCase().trim();
  const last = lastName.toLowerCase().trim();
  const firstInitial = first[0] || '';
  const lastInitial = last[0] || '';

  // If we have a pattern from Hunter, use it
  if (pattern) {
    const patternEmail = pattern
      .replace('{first}', first)
      .replace('{last}', last)
      .replace('{f}', firstInitial)
      .replace('{l}', lastInitial);

    // Return pattern match first, then common alternatives
    const emails = [`${patternEmail}@${domain}`];

    // Add common alternatives
    const alternatives = generateCommonPatterns(first, last, firstInitial, domain);
    for (const alt of alternatives) {
      if (!emails.includes(alt)) emails.push(alt);
    }

    return emails.slice(0, 10);
  }

  // No pattern - use common hospitality email patterns
  return generateCommonPatterns(first, last, firstInitial, domain);
}

function generateCommonPatterns(
  first: string,
  last: string,
  firstInitial: string,
  domain: string
): string[] {
  // Common hospitality email patterns (most common first)
  return [
    `${first}.${last}@${domain}`,           // john.smith@hotel.com
    `${first}@${domain}`,                    // john@hotel.com
    `${firstInitial}${last}@${domain}`,      // jsmith@hotel.com
    `${first}${last}@${domain}`,             // johnsmith@hotel.com
    `${first}_${last}@${domain}`,            // john_smith@hotel.com
    `${first}-${last}@${domain}`,            // john-smith@hotel.com
    `${last}.${first}@${domain}`,            // smith.john@hotel.com
    `${last}@${domain}`,                     // smith@hotel.com
    `${firstInitial}.${last}@${domain}`,     // j.smith@hotel.com
    `${first}${firstInitial}@${domain}`,     // johnj@hotel.com (if duplicates exist)
  ];
}

/**
 * STEP 6: Verify email using Hunter.io or other free validator
 */
export async function verifyEmail(email: string): Promise<{
  valid: boolean;
  status: string;
  score?: number;
}> {
  // Try Hunter.io verification
  if (HUNTER_API_KEY) {
    try {
      const response = await fetch(
        `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`
      );

      if (response.ok) {
        const data = await response.json();
        const result = data.data;

        // Hunter returns: valid, invalid, accept_all, webmail, disposable, unknown
        const validStatuses = ['valid', 'accept_all'];

        return {
          valid: validStatuses.includes(result?.status),
          status: result?.status || 'unknown',
          score: result?.score,
        };
      }
    } catch (error) {
      console.error('Email verification error:', error);
    }
  }

  // Fallback: basic syntax check + MX record check would go here
  // For now, return as unverified
  return {
    valid: false,
    status: 'unverified',
  };
}

/**
 * STEP 6 Alternative: Verify multiple emails and return best one
 */
export async function findBestEmail(emails: string[]): Promise<{
  email: string | null;
  status: string;
  confidence: 'high' | 'medium' | 'low';
}> {
  if (!emails.length) {
    return { email: null, status: 'no_emails', confidence: 'low' };
  }

  // If no API key, return first email as unverified
  if (!HUNTER_API_KEY) {
    return {
      email: emails[0],
      status: 'unverified',
      confidence: 'low',
    };
  }

  // Verify emails in order until we find a valid one
  for (const email of emails.slice(0, 5)) { // Limit to 5 to conserve API credits
    const result = await verifyEmail(email);

    if (result.valid) {
      return {
        email,
        status: result.status,
        confidence: result.status === 'valid' ? 'high' : 'medium',
      };
    }

    // Small delay between verifications
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // No valid email found, return first as fallback
  return {
    email: emails[0],
    status: 'unverified',
    confidence: 'low',
  };
}

/**
 * Main function: Find decision-maker email using 7-step process
 */
export async function findDecisionMakerEmail(
  hotelName: string,
  websiteUrl: string | null,
  teamMembers: TeamMember[],
  existingEmails: string[]
): Promise<EmailFinderResult> {
  // Initialize result
  const result: EmailFinderResult = {
    hotelName,
    contactRole: '',
    contactName: '',
    validatedEmail: null,
    emailPatternSource: 'none',
    confidenceScore: 'low',
    allEmailsFound: [...existingEmails],
  };

  // STEP 1: Find decision-maker
  const decisionMaker = findDecisionMaker(teamMembers);

  if (decisionMaker) {
    result.contactName = decisionMaker.name;
    result.contactRole = decisionMaker.title;

    // If they already have an email, use it
    if (decisionMaker.email) {
      result.validatedEmail = decisionMaker.email;
      result.confidenceScore = 'high';
      result.emailPatternSource = 'website_scrape';
      return result;
    }
  }

  // STEP 3: Get email domain
  let domain: string | null = null;

  if (websiteUrl) {
    domain = extractDomain(websiteUrl);
  }

  // Try to extract domain from existing emails
  if (!domain && existingEmails.length > 0) {
    const businessEmail = existingEmails.find(e =>
      !e.includes('gmail') &&
      !e.includes('yahoo') &&
      !e.includes('hotmail') &&
      !e.includes('outlook')
    );
    if (businessEmail) {
      domain = businessEmail.split('@')[1];
    }
  }

  if (!domain) {
    // No domain found - suggest fallback
    result.fallbackMethod = 'Call reception to obtain GM email';

    // Use info@ as generic fallback if we have any clue about domain
    if (websiteUrl) {
      const urlDomain = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname.replace('www.', '');
      result.validatedEmail = `info@${urlDomain}`;
      result.emailPatternSource = 'generic_fallback';
      result.confidenceScore = 'low';
    }

    return result;
  }

  // STEP 4: Get email pattern
  const { pattern, source, emails: hunterEmails } = await getEmailPattern(domain);
  result.emailPatternSource = source;
  result.allEmailsFound = [...new Set([...result.allEmailsFound, ...hunterEmails])];

  // STEP 5: Generate permutations if we have a contact name
  if (decisionMaker) {
    const nameParts = decisionMaker.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || nameParts[0];

    if (firstName && lastName) {
      const permutations = generateEmailPermutations(firstName, lastName, domain, pattern);
      result.allEmailsFound = [...new Set([...result.allEmailsFound, ...permutations])];
    }
  }

  // Add generic emails as fallback
  const genericEmails = [
    `info@${domain}`,
    `reservations@${domain}`,
    `frontdesk@${domain}`,
    `reception@${domain}`,
    `gm@${domain}`,
    `manager@${domain}`,
  ];
  result.allEmailsFound = [...new Set([...result.allEmailsFound, ...genericEmails])];

  // STEP 6: Verify and find best email
  // Prioritize: 1) existing emails, 2) generated permutations, 3) generic
  const emailsToVerify = [
    ...existingEmails.filter(e => e.includes(domain)),
    ...result.allEmailsFound.filter(e => !genericEmails.includes(e)),
    ...genericEmails,
  ];

  const { email: bestEmail, status, confidence } = await findBestEmail(emailsToVerify);

  result.validatedEmail = bestEmail;
  result.verificationStatus = status;
  result.confidenceScore = confidence;

  // If no valid email and no contact, suggest fallback
  if (!result.validatedEmail && !decisionMaker) {
    result.fallbackMethod = 'Call reception to obtain GM email';
    result.validatedEmail = `info@${domain}`;
    result.confidenceScore = 'low';
  }

  return result;
}

/**
 * Search Google for decision-maker info (Step 2 helper)
 * Uses common search queries to find names
 */
export function generateSearchQueries(hotelName: string): string[] {
  return [
    `"${hotelName}" "General Manager"`,
    `"${hotelName}" "Operations Manager"`,
    `"${hotelName}" "Owner"`,
    `"${hotelName}" management team`,
    `"${hotelName}" staff team`,
    `"${hotelName}" contact`,
    `"${hotelName}" GM`,
  ];
}
