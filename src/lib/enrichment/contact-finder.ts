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

/**
 * Google search for decision-maker names
 * Uses DuckDuckGo HTML (no API key needed)
 */
async function searchForDecisionMaker(
  hotelName: string,
  city: string | null
): Promise<Array<{ name: string; title: string; source: string }>> {
  const results: Array<{ name: string; title: string; source: string }> = [];

  const searchQueries = [
    `"${hotelName}" "general manager"`,
    `"${hotelName}" "hotel manager"`,
    `"${hotelName}" "director"`,
    `"${hotelName}" "owner"`,
  ];

  for (const query of searchQueries.slice(0, 2)) { // Limit to 2 queries
    try {
      // Use DuckDuckGo HTML search (no API needed)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(searchUrl, {
        headers: FETCH_HEADERS,
      });

      if (!response.ok) continue;

      const html = await response.text();

      // Extract names with titles from search results
      const namePatterns = [
        // "John Smith, General Manager"
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,–-]\s*(General Manager|Hotel Manager|Director|Owner|Managing Director)/gi,
        // "General Manager John Smith"
        /(General Manager|Hotel Manager|Director|Owner|Managing Director)\s*[,–:-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
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

          if (name && name.length > 3 && name.length < 40 && !name.match(/hotel|resort|spa/i)) {
            // Validate it looks like a real name (2+ words, capitalized)
            const words = name.split(/\s+/);
            if (words.length >= 2 && words.every(w => /^[A-Z]/.test(w))) {
              results.push({ name, title, source: 'google_search' });
            }
          }
        }
      }

      // Small delay between searches
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Search error:', error);
    }
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
 */
async function lookupWhois(domain: string): Promise<ContactFinderResult['whoisInfo']> {
  try {
    // Use RDAP (modern WHOIS API) - no API key needed
    // Try common RDAP servers
    const rdapServers = [
      `https://rdap.verisign.com/com/v1/domain/${domain}`,
      `https://rdap.org/domain/${domain}`,
    ];

    for (const rdapUrl of rdapServers) {
      try {
        const response = await fetch(rdapUrl, {
          headers: { 'Accept': 'application/rdap+json' },
        });

        if (!response.ok) continue;

        const data = await response.json();

        // Extract registrant info from RDAP response
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

            return {
              registrantName: name,
              registrantEmail: email,
              registrantOrg: org,
            };
          }
        }
      } catch {
        // Try next server
      }
    }

    // Fallback: try whoisjson.com (free tier)
    try {
      const response = await fetch(`https://whoisjson.com/api/v1/whois?domain=${domain}`, {
        headers: FETCH_HEADERS,
      });

      if (response.ok) {
        const data = await response.json();
        return {
          registrantName: data.registrant?.name || data.registrant_name || null,
          registrantEmail: data.registrant?.email || data.registrant_email || null,
          registrantOrg: data.registrant?.organization || data.registrant_org || null,
        };
      }
    } catch {
      // WHOIS lookup failed
    }

    return null;
  } catch (error) {
    console.error('WHOIS error:', error);
    return null;
  }
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
  }

  // Step 2: Deep website scrape (already includes team/about/contact pages)
  if (websiteUrl) {
    const websiteData = await scrapeWebsite(websiteUrl);
    result.allEmails = [...websiteData.emails];

    // Add team members found on website
    for (const member of websiteData.teamMembers) {
      result.allNames.push({
        name: member.name,
        title: member.title,
        source: 'website',
      });
      if (member.email) {
        result.allEmails.push(member.email);
      }
    }
  }

  // Step 3: Google search for decision-maker names
  const searchResults = await searchForDecisionMaker(hotelName, city);
  result.allNames.push(...searchResults);

  // Step 4: WHOIS lookup
  if (result.domain) {
    result.whoisInfo = await lookupWhois(result.domain);

    // Add WHOIS registrant as potential contact
    if (result.whoisInfo?.registrantName) {
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
  for (const person of sortedNames) {
    // Check if we already have their email
    const personEmails = result.allEmails.filter(e => {
      const nameParts = person.name.toLowerCase().split(/\s+/);
      const emailLocal = e.split('@')[0].toLowerCase();
      return nameParts.some(part => emailLocal.includes(part));
    });

    if (personEmails.length > 0) {
      result.decisionMaker = {
        name: person.name,
        title: person.title,
        email: personEmails[0],
        source: person.source,
      };
      result.confidence = 'high';
      break;
    }

    // Generate email permutations if we have a domain
    if (result.domain) {
      const permutations = generateEmailPermutations(person.name, result.domain);
      result.allEmails.push(...permutations);

      // Take first person with generated email as medium confidence
      if (!result.decisionMaker) {
        result.decisionMaker = {
          name: person.name,
          title: person.title,
          email: permutations[0], // first.last@domain
          source: person.source,
        };
        result.confidence = 'medium';
      }
    }
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
      result.decisionMaker.email = null;
      result.confidence = 'low';
    }
  }

  return result;
}
