import { WebsiteData } from './types';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function findRelevantPages(html: string, baseUrl: string): string[] {
  const pages: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /contact/i, /kontakt/i, /about/i, /team/i,
    /management/i, /leadership/i, /staff/i, /imprint/i, /impressum/i,
  ];

  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      if (href.startsWith('#') || href.startsWith('javascript:') ||
          href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }

      const fullUrl = new URL(href, baseUrl).href;
      const baseHost = new URL(baseUrl).hostname;
      const linkHost = new URL(fullUrl).hostname;
      if (linkHost !== baseHost) continue;

      if (patterns.some(p => p.test(href)) && !seen.has(fullUrl)) {
        pages.push(fullUrl);
        seen.add(fullUrl);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return pages;
}

function extractPropertyInfo(html: string): WebsiteData['propertyInfo'] {
  const info: WebsiteData['propertyInfo'] = {};

  // Try to find star rating
  const starMatch = html.match(/(\d)\s*(?:star|sterne|étoiles|stelle)/i) ||
                    html.match(/(?:star|sterne|étoiles|stelle)\s*(\d)/i);
  if (starMatch) {
    info.starRating = parseInt(starMatch[1]);
  }

  // Look for star icons (★)
  const starIconMatch = html.match(/(★{3,5}|☆{3,5})/);
  if (starIconMatch && !info.starRating) {
    info.starRating = starIconMatch[1].replace(/☆/g, '★').length;
  }

  // Try to find room count
  const roomMatch = html.match(/(\d+)\s*(?:rooms|zimmer|chambres|camere|suites)/i);
  if (roomMatch) {
    info.roomCount = roomMatch[1];
  }

  // Look for chain/brand affiliation
  const chains = [
    'Marriott', 'Hilton', 'IHG', 'Hyatt', 'Accor', 'Wyndham', 'Choice',
    'Best Western', 'Radisson', 'Four Seasons', 'Ritz-Carlton', 'St. Regis',
    'W Hotels', 'Sheraton', 'Westin', 'Sofitel', 'Novotel', 'Mandarin Oriental',
    'Peninsula', 'Aman', 'Six Senses', 'Rosewood', 'Belmond', 'Kempinski',
    'Fairmont', 'Raffles', 'Jumeirah', 'One&Only', 'Como', 'Dorchester'
  ];
  for (const chain of chains) {
    if (html.toLowerCase().includes(chain.toLowerCase())) {
      info.chainBrand = chain;
      break;
    }
  }

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (descMatch) {
    info.description = descMatch[1].substring(0, 300);
  }

  // Look for common amenities
  const amenityKeywords = [
    'spa', 'pool', 'gym', 'fitness', 'restaurant', 'bar', 'wifi',
    'parking', 'beach', 'golf', 'tennis', 'concierge', 'butler', 'michelin'
  ];
  info.amenities = amenityKeywords.filter(a => html.toLowerCase().includes(a));

  return info;
}

function extractTeamMembers(html: string): WebsiteData['teamMembers'] {
  const members: WebsiteData['teamMembers'] = [];

  const titlePatterns = [
    'General Manager', 'GM', 'Hotel Manager', 'Managing Director',
    'Director of', 'Head of', 'Chief', 'Manager', 'Executive',
    'Owner', 'Founder', 'President', 'CEO', 'COO', 'CFO',
    'F&B Manager', 'Revenue Manager', 'Sales Director', 'Marketing Director',
  ];

  // Look for structured data (JSON-LD)
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const jsonBlock of jsonLdMatch) {
      try {
        const jsonStr = jsonBlock.replace(/<\/?script[^>]*>/gi, '');
        const data = JSON.parse(jsonStr);
        if (data.employee || data.member || data.founder) {
          const people = data.employee || data.member || data.founder;
          const peopleArray = Array.isArray(people) ? people : [people];
          for (const person of peopleArray) {
            if (person.name) {
              members.push({
                name: person.name,
                title: person.jobTitle || person.roleName || 'Team Member',
                email: person.email,
              });
            }
          }
        }
      } catch {
        // Invalid JSON
      }
    }
  }

  // Look for common patterns in HTML
  for (const title of titlePatterns) {
    const patterns = [
      new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)\\s*[,–-]\\s*${title}`, 'gi'),
      new RegExp(`${title}\\s*[,–:-]\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)`, 'gi'),
      new RegExp(`<[^>]*>([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)<\\/[^>]*>\\s*<[^>]*>${title}`, 'gi'),
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const name = match[1]?.trim();
        if (name && name.length > 3 && name.length < 50 && !name.match(/hotel|resort|spa|restaurant/i)) {
          members.push({ name, title });
        }
      }
    }
  }

  return members;
}

function dedupeTeamMembers(members: WebsiteData['teamMembers']): WebsiteData['teamMembers'] {
  const seen = new Map<string, WebsiteData['teamMembers'][0]>();
  for (const member of members) {
    const key = member.name.toLowerCase();
    if (!seen.has(key) || (member.email && !seen.get(key)?.email)) {
      seen.set(key, member);
    }
  }
  return Array.from(seen.values());
}

function prioritizeEmails(emails: string[]): string[] {
  const priorities = [
    /^(gm|generalmanager|manager|director)/i,
    /^(sales|revenue|marketing)/i,
    /^(info|contact|hello|enquir|reserv)/i,
    /^(reception|frontdesk|booking)/i,
  ];

  return emails.sort((a, b) => {
    const getPriority = (email: string) => {
      for (let i = 0; i < priorities.length; i++) {
        if (priorities[i].test(email)) return i;
      }
      return priorities.length;
    };
    return getPriority(a) - getPriority(b);
  });
}

export function findEmailsInText(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];

  const excludePatterns = [
    'example.com', 'test.com', 'email.com', 'website.com', 'domain.com', 'yourdomain.com',
    '.png', '.jpg', '.gif', '.svg', '.webp',
    'wixpress', 'sentry.io', 'cloudflare', 'google', 'facebook', 'twitter',
    'placeholder', 'noreply', 'no-reply', 'donotreply',
    'privacy@', 'gdpr@', 'unsubscribe@', 'abuse@',
  ];

  const fakePatterns = [
    /^(john|jane|user|test|demo|sample|admin|webmaster)@/i,
    /^(your|my|the|a)email@/i,
    /name@/i,
  ];

  return matches.filter(email => {
    const lower = email.toLowerCase();
    if (excludePatterns.some(pattern => lower.includes(pattern))) return false;
    if (fakePatterns.some(pattern => pattern.test(lower))) return false;
    return true;
  });
}

export function findPhonesInText(text: string): string[] {
  const phoneRegex = /(?:\+|00)?[1-9]\d{0,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
  const matches = text.match(phoneRegex) || [];

  return matches
    .map(phone => phone.replace(/[-.\s()]/g, ''))
    .filter(phone => phone.length >= 10 && phone.length <= 15)
    .filter((phone, index, self) => self.indexOf(phone) === index)
    .slice(0, 5);
}

export function findSocialLinks(html: string): WebsiteData['socialLinks'] {
  const social: WebsiteData['socialLinks'] = {};

  const linkedinMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'#?]+)/i);
  if (linkedinMatch) social.linkedin = linkedinMatch[1];

  const instagramMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'#?]+)/i);
  if (instagramMatch) social.instagram = instagramMatch[1];

  const facebookMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'#?]+)/i);
  if (facebookMatch) social.facebook = facebookMatch[1];

  const twitterMatch = html.match(/href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"'#?]+)/i);
  if (twitterMatch) social.twitter = twitterMatch[1];

  const tripadvisorMatch = html.match(/href=["'](https?:\/\/(?:www\.)?tripadvisor\.(?:com|co\.uk|de|fr|es|it)\/[^"'#?]+)/i);
  if (tripadvisorMatch) social.tripadvisor = tripadvisorMatch[1];

  const bookingMatch = html.match(/href=["'](https?:\/\/(?:www\.)?booking\.com\/[^"'#?]+)/i);
  if (bookingMatch) social.booking = bookingMatch[1];

  return social;
}

export async function scrapeWebsite(url: string): Promise<WebsiteData> {
  const result: WebsiteData = {
    emails: [],
    phones: [],
    socialLinks: {},
    propertyInfo: {},
    teamMembers: [],
  };

  try {
    const html = await fetchPage(url);
    if (!html) return result;

    result.emails = findEmailsInText(html);
    result.phones = findPhonesInText(html);
    result.socialLinks = findSocialLinks(html);
    result.propertyInfo = extractPropertyInfo(html);

    const pagesToScrape = findRelevantPages(html, url);

    for (const pageUrl of pagesToScrape.slice(0, 5)) {
      try {
        const pageHtml = await fetchPage(pageUrl);
        if (!pageHtml) continue;

        const pageEmails = findEmailsInText(pageHtml);
        const pagePhones = findPhonesInText(pageHtml);
        result.emails = [...new Set([...result.emails, ...pageEmails])];
        result.phones = [...new Set([...result.phones, ...pagePhones])];

        if (pageUrl.match(/team|about|management|leadership|staff/i)) {
          const teamMembers = extractTeamMembers(pageHtml);
          result.teamMembers = [...result.teamMembers, ...teamMembers];
        }

        if (pageUrl.match(/contact|kontakt/i)) {
          result.contactPageUrl = pageUrl;
        }
      } catch {
        // Skip failed pages
      }
    }

    result.teamMembers = dedupeTeamMembers(result.teamMembers);
    result.emails = prioritizeEmails(result.emails);

    return result;
  } catch {
    return result;
  }
}

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return null;
  }
}
