/**
 * Contact Finder Module
 *
 * Finds decision-maker emails through:
 * 1. Deep website scraping (team, about, contact, imprint pages)
 * 2. Google search for "[hotel name] general manager" / "director"
 * 3. WHOIS lookup for domain registrant
 * 4. Email pattern generation from found names + domain
 */

import { extractDomain, findEmailsInText, scrapeWebsite } from './website-scraper';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Timeout wrapper for fetch requests
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('[ContactFinder] Fetch timeout/error for:', url.substring(0, 50));
    return null;
  }
}

export interface ContactFinderResult {
  decisionMaker: {
    name: string | null;
    title: string | null;
    email: string | null;
    source: string;
  } | null;
  allEmails: string[];
  allNames: Array<{ name: string; title: string; source: string }>;
  whoisInfo: {
    registrantName: string | null;
    registrantEmail: string | null;
    registrantOrg: string | null;
  } | null;
  domain: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// Common first names to help validate person names
const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'anna', 'maria', 'emma', 'sophie', 'julia', 'laura', 'peter', 'george', 'edward', 'brian', 'kevin',
  'jean', 'pierre', 'marie', 'françois', 'philippe', 'michel', 'isabelle', 'catherine', 'nicolas', 'laurent',
  'hans', 'klaus', 'stefan', 'andreas', 'thomas', 'martin', 'frank', 'wolfgang', 'jürgen', 'helmut',
  'marco', 'luca', 'giovanni', 'giuseppe', 'alessandro', 'andrea', 'francesca', 'giulia', 'chiara', 'valentina',
  'carlos', 'jose', 'juan', 'miguel', 'antonio', 'francisco', 'manuel', 'pedro', 'pablo', 'luis',
  'alex', 'max', 'ben', 'sam', 'tom', 'chris', 'nick', 'mike', 'dan', 'joe', 'tim', 'matt', 'rob', 'steve',
]);

// Words that indicate this is NOT a person's name
const NOT_PERSON_PATTERNS = /hotel|resort|spa|restaurant|bar|cafe|group|ltd|inc|company|corporation|gmbh|sarl|limited|holdings|management|hospitality|collection|brands?|international|global|luxury|boutique|grand|royal|palace|manor|house|inn|lodge|suites|amsterdam|paris|london|berlin|rome|madrid|barcelona|copenhagen|vienna|munich|milan|lisbon|dublin|brussels|stockholm|oslo|zurich|geneva|prague|budapest|warsaw|athens|helsinki|dubai|singapore|tokyo|hong kong|sydney|melbourne|vancouver|toronto|new york|los angeles|miami|chicago|boston|san francisco/i;

/**
 * Validate if a string looks like a real person's name
 */
function isValidPersonName(name: string): boolean {
  if (!name || name.length < 5 || name.length > 40) return false;

  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  // Each word should be capitalized and reasonable length
  if (!words.every(w => /^[A-Z][a-z]+$/.test(w) && w.length >= 2 && w.length <= 15)) return false;

  // Check for company/location patterns
  if (NOT_PERSON_PATTERNS.test(name)) return false;

  // First word should look like a first name (either in list or reasonable length)
  const firstName = words[0].toLowerCase();
  const looksLikeFirstName = COMMON_FIRST_NAMES.has(firstName) ||
    (firstName.length >= 3 && firstName.length <= 10);

  // Last word should look like a last name (not a city, brand, etc.)
  const lastName = words[words.length - 1].toLowerCase();
  const looksLikeLastName = lastName.length >= 3 && lastName.length <= 15 &&
    !NOT_PERSON_PATTERNS.test(lastName);

  return looksLikeFirstName && looksLikeLastName;
}

/**
 * Google search for decision-maker names
 * Uses DuckDuckGo HTML (no API key needed)
 * OPTIMIZED: Single query with timeout
 */
async function searchForDecisionMaker(
  hotelName: string,
  city: string | null
): Promise<Array<{ name: string; title: string; source: string }>> {
  const results: Array<{ name: string; title: string; source: string }> = [];

  // Single optimized query
  const query = `"${hotelName}" "general manager" OR "hotel manager" OR "director"`;
  console.log('[ContactFinder] Quick search for:', hotelName);

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(searchUrl, { headers: FETCH_HEADERS }, 8000);

    if (!response || !response.ok) {
      console.log('[ContactFinder] Search failed or timed out');
      return results;
    }

    const html = await response.text();
    console.log('[ContactFinder] Got HTML:', html.length, 'chars');

    // Extract names with titles from search results
    const namePatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,–-]\s*(General Manager|Hotel Manager|Director|Owner|Managing Director)/gi,
      /(General Manager|Hotel Manager|Director|Owner|Managing Director)\s*[,–:-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*[-–]\s*(General Manager|Hotel Manager|Director|Owner)/gi,
    ];

    for (const pattern of namePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const name = match[1]?.includes('Manager') || match[1]?.includes('Director')
          ? match[2]?.trim()
          : match[1]?.trim();
        const title = match[1]?.includes('Manager') || match[1]?.includes('Director')
          ? match[1]?.trim()
          : match[2]?.trim();

        if (name && isValidPersonName(name)) {
          console.log('[ContactFinder] Found:', name, '-', title);
          results.push({ name, title, source: 'google_search' });
        }
      }
    }
  } catch (error) {
    console.error('[ContactFinder] Search error:', error);
  }

  // Dedupe by name
  const seen = new Set<string>();
  return results.filter(r => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * WHOIS lookup for domain registrant info
 * OPTIMIZED: Single quick request with timeout, skip if not .com
 */
async function lookupWhois(domain: string): Promise<ContactFinderResult['whoisInfo']> {
  // Only try WHOIS for .com domains (most reliable)
  if (!domain.endsWith('.com')) {
    console.log('[ContactFinder] Skipping WHOIS for non-.com domain');
    return null;
  }

  console.log('[ContactFinder] Quick WHOIS lookup:', domain);

  try {
    const rdapUrl = `https://rdap.verisign.com/com/v1/domain/${domain}`;
    const response = await fetchWithTimeout(rdapUrl, {
      headers: { 'Accept': 'application/rdap+json' },
    }, 5000);

    if (!response || !response.ok) {
      console.log('[ContactFinder] WHOIS failed/timeout');
      return null;
    }

    const data = await response.json();

    // Extract registrant info
    const entities = data.entities || [];
    for (const entity of entities) {
      if (entity.roles?.includes('registrant')) {
        const vcard = entity.vcardArray?.[1] || [];
        let name = null;
        let email = null;
        let org = null;

        for (const field of vcard) {
          if (field[0] === 'fn') name = field[3];
          if (field[0] === 'email') email = field[3];
          if (field[0] === 'org') org = field[3];
        }

        if (name || email) {
          console.log('[ContactFinder] WHOIS found:', { name, email });
          return { registrantName: name, registrantEmail: email, registrantOrg: org };
        }
      }
    }
  } catch (error) {
    console.log('[ContactFinder] WHOIS error');
  }

  return null;
}

/**
 * Generate email permutations from a name and domain
 */
function generateEmailPermutations(name: string, domain: string): string[] {
  const parts = name.toLowerCase().split(/\s+/);
  if (parts.length < 2) return [];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstInitial = first[0];

  return [
    `${first}.${last}@${domain}`,      // john.smith@
    `${first}@${domain}`,               // john@
    `${firstInitial}${last}@${domain}`, // jsmith@
    `${first}${last}@${domain}`,        // johnsmith@
    `${last}.${first}@${domain}`,       // smith.john@
    `${firstInitial}.${last}@${domain}`,// j.smith@
  ];
}

/**
 * Main function: Find decision-maker contact
 */
export async function findDecisionMakerContact(
  hotelName: string,
  websiteUrl: string | null,
  city: string | null
): Promise<ContactFinderResult> {
  console.log('[ContactFinder] Starting for:', hotelName, '| URL:', websiteUrl);

  const result: ContactFinderResult = {
    decisionMaker: null,
    allEmails: [],
    allNames: [],
    whoisInfo: null,
    domain: null,
    confidence: 'low',
  };

  // Step 1: Get domain
  if (websiteUrl) {
    result.domain = extractDomain(websiteUrl);
    console.log('[ContactFinder] Extracted domain:', result.domain);
  }

  // Step 2: Deep website scrape (already includes team/about/contact pages)
  if (websiteUrl) {
    console.log('[ContactFinder] Step 2: Website scrape');
    const websiteData = await scrapeWebsite(websiteUrl);
    result.allEmails = [...websiteData.emails];
    console.log('[ContactFinder] Found emails from website:', result.allEmails.length);

    // Add team members found on website (validate names)
    for (const member of websiteData.teamMembers) {
      if (isValidPersonName(member.name)) {
        console.log('[ContactFinder] Valid team member from website:', member.name);
        result.allNames.push({
          name: member.name,
          title: member.title,
          source: 'website',
        });
        if (member.email) {
          result.allEmails.push(member.email);
        }
      } else {
        console.log('[ContactFinder] Rejected invalid team member:', member.name);
      }
    }
  }

  // Step 3: Google search for decision-maker names
  console.log('[ContactFinder] Step 3: Google search');
  const searchResults = await searchForDecisionMaker(hotelName, city);
  result.allNames.push(...searchResults);
  console.log('[ContactFinder] Total names after search:', result.allNames.length);

  // Step 4: WHOIS lookup (only if no names found yet)
  if (result.domain && result.allNames.length === 0) {
    result.whoisInfo = await lookupWhois(result.domain);

    // Add WHOIS registrant as potential contact
    if (result.whoisInfo?.registrantName && isValidPersonName(result.whoisInfo.registrantName)) {
      console.log('[ContactFinder] WHOIS registrant:', result.whoisInfo.registrantName);
      result.allNames.push({
        name: result.whoisInfo.registrantName,
        title: 'Domain Registrant',
        source: 'whois',
      });
    }
    if (result.whoisInfo?.registrantEmail) {
      result.allEmails.push(result.whoisInfo.registrantEmail);
    }
  }

  // Step 5: Find best decision-maker
  console.log('[ContactFinder] Step 5: Select best decision-maker');
  console.log('[ContactFinder] All names found:', result.allNames.map(n => `${n.name} (${n.title})`).join(', ') || 'NONE');

  const priorityTitles = [
    'general manager', 'gm', 'owner', 'managing director',
    'hotel manager', 'director', 'operations manager',
  ];

  // Sort names by title priority
  const sortedNames = [...result.allNames].sort((a, b) => {
    const aIndex = priorityTitles.findIndex(t => a.title.toLowerCase().includes(t));
    const bIndex = priorityTitles.findIndex(t => b.title.toLowerCase().includes(t));
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  // Find the best match with an email
  // First pass: look for exact matches (last name must be in email)
  for (const person of sortedNames) {
    const nameParts = person.name.toLowerCase().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];

    // Check if we have an email with this person's last name
    const exactMatchEmails = result.allEmails.filter(e => {
      const emailLocal = e.split('@')[0].toLowerCase();
      return emailLocal.includes(lastName) && lastName.length >= 3;
    });

    if (exactMatchEmails.length > 0) {
      console.log('[ContactFinder] Found exact email match for:', person.name, '->', exactMatchEmails[0]);
      result.decisionMaker = {
        name: person.name,
        title: person.title,
        email: exactMatchEmails[0],
        source: person.source,
      };
      result.confidence = 'high';
      break;
    }
  }

  // Second pass: if no exact match, generate email for first decision-maker
  if (!result.decisionMaker && result.domain && sortedNames.length > 0) {
    const person = sortedNames[0];
    const permutations = generateEmailPermutations(person.name, result.domain);
    result.allEmails.push(...permutations);

    console.log('[ContactFinder] Generating email for:', person.name, '->', permutations[0]);
    result.decisionMaker = {
      name: person.name,
      title: person.title,
      email: permutations[0], // first.last@domain
      source: person.source,
    };
    result.confidence = 'medium';
  }

  // Dedupe emails
  result.allEmails = [...new Set(result.allEmails)];

  // Filter out generic/fake emails for the decision maker
  if (result.decisionMaker?.email) {
    const email = result.decisionMaker.email.toLowerCase();
    const isGeneric = ['info@', 'contact@', 'reservations@', 'reception@', 'hello@', 'enquiries@']
      .some(prefix => email.startsWith(prefix));
    const isFake = ['johndoe', 'janedoe', 'test', 'example', 'placeholder', 'website.com']
      .some(fake => email.includes(fake));

    if (isGeneric || isFake) {
      console.log('[ContactFinder] Rejected generic/fake email:', email);
      result.decisionMaker.email = null;
      result.confidence = 'low';
    }
  }

  console.log('[ContactFinder] Final result:', {
    decisionMaker: result.decisionMaker,
    confidence: result.confidence,
    totalNames: result.allNames.length,
    totalEmails: result.allEmails.length,
  });

  return result;
}
