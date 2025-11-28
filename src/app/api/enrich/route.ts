import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Places API (New) response types
interface PlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: Array<{ name: string }>;
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Check rate limit for Google Places API
    const rateLimit = checkRateLimit('google_places');
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: 'Daily Google Places API limit reached',
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        message: 'Free tier limit reached. Try again tomorrow to stay within budget.',
      }, { status: 429 });
    }

    // Get prospect
    const { data: prospect, error: fetchError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (fetchError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Enrich with Google Places
    const enrichmentData = await enrichWithGooglePlaces(
      prospect.name,
      prospect.city || '',
      prospect.country || ''
    );

    // Track API usage
    incrementUsage('google_places');

    // Scrape website for contacts and social links
    let websiteData: WebsiteData = { emails: [], phones: [], socialLinks: {}, propertyInfo: {}, teamMembers: [] };
    const websiteUrl = enrichmentData.website || prospect.website;

    if (websiteUrl) {
      websiteData = await scrapeWebsite(websiteUrl);
    }

    // Determine best email - prioritized list already sorted
    let email = prospect.email;
    if (!email && websiteData.emails.length > 0) {
      email = websiteData.emails[0]; // Already sorted by priority
    }
    if (!email && websiteUrl) {
      // Fallback: generate pattern-based email
      const domain = extractDomain(websiteUrl);
      if (domain) {
        email = `info@${domain}`;
      }
    }

    // Determine best phone
    let phone = prospect.phone;
    if (!phone && websiteData.phones.length > 0) {
      phone = websiteData.phones[0];
    }

    // Get contact person if found (filter out fake/placeholder names)
    const fakeNamePatterns = /fallback|placeholder|cookie|consent|privacy|test|demo|sample|john doe|jane doe|btn|button|click|submit|form|input|select|toggle|menu|nav|header|footer|modal|popup/i;
    const validTeamMembers = websiteData.teamMembers.filter(m => {
      // Must have at least 2 words (first + last name)
      const words = m.name.trim().split(/\s+/);
      if (words.length < 2) return false;
      // Must not match fake patterns
      if (fakeNamePatterns.test(m.name)) return false;
      // Each word must be at least 2 chars
      if (words.some(w => w.length < 2)) return false;
      return true;
    });
    const primaryContact = validTeamMembers.find(m =>
      m.title.match(/general manager|gm|director|owner|managing/i)
    ) || validTeamMembers[0];

    // Update prospect with all scraped data
    const updateData: Record<string, unknown> = {
      ...enrichmentData,
      stage: 'researching',
    };

    // Contact info
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    // Contact person
    if (primaryContact) {
      updateData.contact_name = primaryContact.name;
      updateData.contact_title = primaryContact.title;
    }

    // Social links
    if (websiteData.socialLinks.linkedin) updateData.linkedin_url = websiteData.socialLinks.linkedin;
    if (websiteData.socialLinks.instagram) updateData.instagram_handle = websiteData.socialLinks.instagram;

    // Property info from scrape
    if (websiteData.propertyInfo.starRating) updateData.star_rating = websiteData.propertyInfo.starRating;
    if (websiteData.propertyInfo.roomCount) updateData.estimated_rooms = parseInt(websiteData.propertyInfo.roomCount);
    if (websiteData.propertyInfo.chainBrand) updateData.chain_affiliation = websiteData.propertyInfo.chainBrand;

    // Store extra scraped data in notes/tags
    const scrapedNotes: string[] = [];
    if (websiteData.propertyInfo.amenities?.length) {
      scrapedNotes.push(`Amenities: ${websiteData.propertyInfo.amenities.join(', ')}`);
    }
    if (websiteData.teamMembers.length > 1) {
      scrapedNotes.push(`Team: ${websiteData.teamMembers.map(m => `${m.name} (${m.title})`).slice(0, 3).join(', ')}`);
    }
    if (websiteData.socialLinks.tripadvisor) {
      scrapedNotes.push(`TripAdvisor: ${websiteData.socialLinks.tripadvisor}`);
    }
    if (scrapedNotes.length && !prospect.notes) {
      updateData.notes = scrapedNotes.join('\n');
    }

    // Add tags based on scraped info
    const tags: string[] = prospect.tags || [];
    if (websiteData.propertyInfo.chainBrand && !tags.includes('chain')) tags.push('chain');
    if (!websiteData.propertyInfo.chainBrand && !tags.includes('independent')) tags.push('independent');
    if (websiteData.propertyInfo.starRating && websiteData.propertyInfo.starRating >= 4 && !tags.includes('luxury')) tags.push('luxury');
    if (websiteData.propertyInfo.amenities?.includes('spa') && !tags.includes('spa')) tags.push('spa');
    if (websiteData.propertyInfo.amenities?.includes('michelin') && !tags.includes('fine-dining')) tags.push('fine-dining');
    if (primaryContact && !tags.includes('has-contact')) tags.push('has-contact');
    if (tags.length) updateData.tags = tags;

    const { data: updated, error: updateError } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospect_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log activity with detailed scraped data summary
    const scrapedItems = [
      enrichmentData.website && 'Website',
      email && `Email (${email.startsWith('info@') ? 'generated' : 'found'})`,
      phone && 'Phone',
      primaryContact && `Contact: ${primaryContact.name}`,
      websiteData.propertyInfo.starRating && `${websiteData.propertyInfo.starRating}-star`,
      websiteData.propertyInfo.chainBrand && `Chain: ${websiteData.propertyInfo.chainBrand}`,
      websiteData.socialLinks.linkedin && 'LinkedIn',
      websiteData.socialLinks.instagram && 'Instagram',
      websiteData.socialLinks.tripadvisor && 'TripAdvisor',
    ].filter(Boolean);

    await supabase.from('activities').insert({
      prospect_id,
      type: 'note',
      title: 'Enriched with Google Places + Deep Website Scrape',
      description: `Found: ${scrapedItems.join(', ') || 'Basic info only'}. Scraped ${websiteData.teamMembers.length} team members, ${websiteData.emails.length} emails.`,
    });

    // Calculate and update score
    const score = calculateScore(updated);
    const tier = getTier(score.total);

    await supabase
      .from('prospects')
      .update({
        score: score.total,
        score_breakdown: score.breakdown,
        tier,
      })
      .eq('id', prospect_id);

    return NextResponse.json({
      success: true,
      prospect: updated,
      score: score.total,
      tier,
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    return NextResponse.json(
      { error: 'Enrichment failed', details: String(error) },
      { status: 500 }
    );
  }
}

async function enrichWithGooglePlaces(name: string, city: string, country: string) {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn('Google Places API key not configured');
    return {};
  }

  try {
    // Use Places API (New) - Text Search endpoint
    // ESSENTIALS TIER ONLY - 10,000 FREE requests/month
    // Only requesting fields that are FREE or in Essentials tier:
    // - id, displayName, formattedAddress, websiteUri are Essentials (FREE up to 10k/month)
    // - rating, userRatingCount, nationalPhoneNumber are PRO tier (costs money)
    const searchUrl = 'https://places.googleapis.com/v1/places:searchText';

    // First: FREE essentials search to get Place ID and basic info
    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        // ESSENTIALS FIELDS ONLY (10,000 free/month)
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri',
      },
      body: JSON.stringify({
        textQuery: `${name} hotel ${city} ${country}`,
        maxResultCount: 1,
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchData.places || searchData.places.length === 0) {
      return {};
    }

    const place: PlaceResult = searchData.places[0];

    return {
      google_place_id: place.id,
      full_address: place.formattedAddress || null,
      website: place.websiteUri || null,
      // These fields require PRO tier ($32/1000) - not fetched to stay free
      // google_rating: null,
      // google_review_count: null,
      // google_phone: null,
      // google_price_level: null,
      // google_photos: null,
    };
  } catch (error) {
    console.error('Google Places API error:', error);
    return {};
  }
}

interface WebsiteData {
  emails: string[];
  phones: string[];
  socialLinks: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
    tripadvisor?: string;
    booking?: string;
  };
  contactPageUrl?: string;
  propertyInfo: {
    starRating?: number;
    roomCount?: string;
    amenities?: string[];
    chainBrand?: string;
    description?: string;
  };
  teamMembers: Array<{
    name: string;
    title: string;
    email?: string;
    linkedin?: string;
  }>;
}

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

async function scrapeWebsite(url: string): Promise<WebsiteData> {
  const result: WebsiteData = {
    emails: [],
    phones: [],
    socialLinks: {},
    propertyInfo: {},
    teamMembers: [],
  };

  try {
    // Fetch main page
    const html = await fetchPage(url);
    if (!html) return result;

    // Extract basic info from homepage
    result.emails = findEmailsInText(html);
    result.phones = findPhonesInText(html);
    result.socialLinks = findSocialLinks(html);
    result.propertyInfo = extractPropertyInfo(html);

    // Find all relevant pages to scrape
    const pagesToScrape = findRelevantPages(html, url);

    // Scrape each page (limit to 5 to avoid being too slow)
    for (const pageUrl of pagesToScrape.slice(0, 5)) {
      try {
        const pageHtml = await fetchPage(pageUrl);
        if (!pageHtml) continue;

        // Merge emails and phones
        const pageEmails = findEmailsInText(pageHtml);
        const pagePhones = findPhonesInText(pageHtml);
        result.emails = [...new Set([...result.emails, ...pageEmails])];
        result.phones = [...new Set([...result.phones, ...pagePhones])];

        // Look for team/staff info on about/team pages
        if (pageUrl.match(/team|about|management|leadership|staff/i)) {
          const teamMembers = extractTeamMembers(pageHtml);
          result.teamMembers = [...result.teamMembers, ...teamMembers];
        }

        // Check for contact page
        if (pageUrl.match(/contact|kontakt/i)) {
          result.contactPageUrl = pageUrl;
        }
      } catch {
        // Skip failed pages
      }
    }

    // Dedupe team members
    result.teamMembers = dedupeTeamMembers(result.teamMembers);

    // Sort emails by priority
    result.emails = prioritizeEmails(result.emails);

    return result;
  } catch {
    return result;
  }
}

function findRelevantPages(html: string, baseUrl: string): string[] {
  const pages: string[] = [];
  const seen = new Set<string>();

  // Patterns for pages we want to scrape
  const patterns = [
    /contact/i,
    /kontakt/i,
    /about/i,
    /team/i,
    /management/i,
    /leadership/i,
    /staff/i,
    /imprint/i,
    /impressum/i,
  ];

  // Find all links
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      // Skip external links, anchors, javascript, etc.
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }

      const fullUrl = new URL(href, baseUrl).href;

      // Only include links from same domain
      const baseHost = new URL(baseUrl).hostname;
      const linkHost = new URL(fullUrl).hostname;
      if (linkHost !== baseHost) continue;

      // Check if it matches our patterns
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
  const chains = ['Marriott', 'Hilton', 'IHG', 'Hyatt', 'Accor', 'Wyndham', 'Choice', 'Best Western', 'Radisson', 'Four Seasons', 'Ritz-Carlton', 'St. Regis', 'W Hotels', 'Sheraton', 'Westin', 'Sofitel', 'Novotel', 'Mandarin Oriental', 'Peninsula', 'Aman', 'Six Senses', 'Rosewood', 'Belmond', 'Kempinski', 'Fairmont', 'Raffles', 'Jumeirah', 'One&Only', 'Como', 'Dorchester'];
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
  const amenityKeywords = ['spa', 'pool', 'gym', 'fitness', 'restaurant', 'bar', 'wifi', 'parking', 'beach', 'golf', 'tennis', 'concierge', 'butler', 'michelin'];
  info.amenities = amenityKeywords.filter(a => html.toLowerCase().includes(a));

  return info;
}

function extractTeamMembers(html: string): WebsiteData['teamMembers'] {
  const members: WebsiteData['teamMembers'] = [];

  // Common title patterns
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
  // Pattern: Name followed by title in parentheses or on next line
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
    // High priority - direct contacts
    /^(gm|generalmanager|manager|director)/i,
    /^(sales|revenue|marketing)/i,
    // Medium priority - business emails
    /^(info|contact|hello|enquir|reserv)/i,
    // Lower priority - departments
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

function findEmailsInText(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];

  // Filter out common false positives
  const excludePatterns = [
    'example.com', 'test.com', 'email.com', 'website.com', 'domain.com', 'yourdomain.com',
    '.png', '.jpg', '.gif', '.svg', '.webp',
    'wixpress', 'sentry.io', 'cloudflare', 'google', 'facebook', 'twitter',
    'placeholder', 'noreply', 'no-reply', 'donotreply',
    'privacy@', 'gdpr@', 'unsubscribe@', 'abuse@',
  ];

  // Also filter out obviously fake emails
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

function findPhonesInText(text: string): string[] {
  // Match international phone formats
  const phoneRegex = /(?:\+|00)?[1-9]\d{0,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
  const matches = text.match(phoneRegex) || [];

  // Filter and clean
  return matches
    .map(phone => phone.replace(/[-.\s()]/g, ''))
    .filter(phone => phone.length >= 10 && phone.length <= 15)
    .filter((phone, index, self) => self.indexOf(phone) === index) // unique
    .slice(0, 5); // max 5 phones
}

function findSocialLinks(html: string): WebsiteData['socialLinks'] {
  const social: WebsiteData['socialLinks'] = {};

  // LinkedIn
  const linkedinMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'#?]+)/i);
  if (linkedinMatch) social.linkedin = linkedinMatch[1];

  // Instagram
  const instagramMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'#?]+)/i);
  if (instagramMatch) social.instagram = instagramMatch[1];

  // Facebook
  const facebookMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'#?]+)/i);
  if (facebookMatch) social.facebook = facebookMatch[1];

  // Twitter/X
  const twitterMatch = html.match(/href=["'](https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^"'#?]+)/i);
  if (twitterMatch) social.twitter = twitterMatch[1];

  // TripAdvisor
  const tripadvisorMatch = html.match(/href=["'](https?:\/\/(?:www\.)?tripadvisor\.(?:com|co\.uk|de|fr|es|it)\/[^"'#?]+)/i);
  if (tripadvisorMatch) social.tripadvisor = tripadvisorMatch[1];

  // Booking.com
  const bookingMatch = html.match(/href=["'](https?:\/\/(?:www\.)?booking\.com\/[^"'#?]+)/i);
  if (bookingMatch) social.booking = bookingMatch[1];

  return social;
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function calculateScore(prospect: Record<string, unknown>): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let total = 0;

  // === CONTACT QUALITY (max 35) ===
  if (prospect.email) {
    const email = prospect.email as string;
    if (!email.startsWith('info@')) {
      breakdown.has_real_email = 15; // Found actual email
      total += 15;
    } else {
      breakdown.has_generated_email = 5; // Just info@domain
      total += 5;
    }
  }
  if (prospect.contact_name) {
    breakdown.has_contact_person = 15; // We know who to reach
    total += 15;
  }
  if (prospect.phone) {
    breakdown.has_phone = 5;
    total += 5;
  }

  // === ONLINE PRESENCE (max 25) ===
  if (prospect.website) {
    breakdown.has_website = 5;
    total += 5;
  }
  if (prospect.linkedin_url) {
    breakdown.has_linkedin = 10; // B2B signal
    total += 10;
  }
  if (prospect.instagram_handle) {
    breakdown.has_instagram = 5;
    total += 5;
  }
  if (prospect.google_place_id) {
    breakdown.google_verified = 5;
    total += 5;
  }

  // === PROPERTY QUALITY (max 30) ===
  const starRating = prospect.star_rating as number | null;
  if (starRating) {
    if (starRating >= 5) {
      breakdown.five_star = 15;
      total += 15;
    } else if (starRating >= 4) {
      breakdown.four_star = 10;
      total += 10;
    }
  }

  // Chain vs Independent
  const chain = prospect.chain_affiliation as string | null;
  if (chain) {
    // Luxury chains get bonus
    const luxuryChains = ['Four Seasons', 'Ritz-Carlton', 'St. Regis', 'Mandarin Oriental', 'Peninsula', 'Aman', 'Six Senses', 'Rosewood', 'Belmond'];
    if (luxuryChains.some(c => chain.includes(c))) {
      breakdown.luxury_chain = 15;
      total += 15;
    } else {
      breakdown.chain_property = 5;
      total += 5;
    }
  } else {
    // Independent hotels often make faster decisions
    breakdown.independent = 5;
    total += 5;
  }

  // === MARKET (max 15) ===
  const premiumMarkets = ['london', 'paris', 'dubai', 'new york', 'miami', 'singapore', 'hong kong', 'tokyo', 'maldives', 'monaco', 'zurich', 'geneva'];
  const city = ((prospect.city as string) || '').toLowerCase();
  if (premiumMarkets.some(market => city.includes(market))) {
    breakdown.premium_market = 15;
    total += 15;
  }

  // === HIRING SIGNALS (max 20) ===
  const jobTitle = ((prospect.source_job_title as string) || '').toLowerCase();

  // Senior decision makers
  const seniorRoles = ['general manager', 'gm', 'director', 'ceo', 'owner', 'managing director', 'president'];
  if (seniorRoles.some(role => jobTitle.includes(role))) {
    breakdown.senior_decision_maker = 15;
    total += 15;
  }

  // Growth/tech roles (more likely to adopt new tech)
  const growthRoles = ['revenue', 'marketing', 'digital', 'sales', 'technology', 'innovation'];
  if (growthRoles.some(role => jobTitle.includes(role))) {
    breakdown.growth_focused = 10;
    total += 10;
  }

  // Operations roles (feel the pain we solve)
  const opsRoles = ['operations', 'f&b', 'food', 'rooms division'];
  if (opsRoles.some(role => jobTitle.includes(role))) {
    breakdown.operations_role = 5;
    total += 5;
  }

  return { total, breakdown };
}

function getTier(score: number): string {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

// Batch enrich endpoint
export async function PUT(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const limit = body.limit || 10;

    // Get prospects that need enrichment
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id')
      .eq('stage', 'new')
      .is('google_place_id', null)
      .limit(limit);

    if (error) throw error;

    const results = [];
    for (const prospect of prospects || []) {
      try {
        const response = await fetch(`${request.nextUrl.origin}/api/enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect_id: prospect.id }),
        });

        const result = await response.json();
        results.push({ id: prospect.id, success: result.success });
      } catch (e) {
        results.push({ id: prospect.id, success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      enriched: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Batch enrichment failed', details: String(error) },
      { status: 500 }
    );
  }
}
